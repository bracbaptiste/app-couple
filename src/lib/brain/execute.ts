"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { guessCategory } from "@/lib/utils/guess-category"
import { normaliserNom } from "@/lib/utils/normalize-name-key"
import { type Unite } from "@/lib/recipes/extraction"
import {
  fusionnerQuantite,
  parseQuantites,
  type QuantiteBase,
} from "@/lib/recipes/fusion"
import { decrireFusion } from "@/lib/recipes/format"

import { type BrainAction } from "./command-parsing"

/**
 * EXÉCUTION des actions du Cerveau (PRD_V4 §5 → §6 niveau 1).
 *
 * Le routeur (`/api/brain-command`) ne fait que STRUCTURER : il renvoie des
 * actions validées + les ids résolus, mais n'écrit RIEN. Ce module exécute les
 * actions de **niveau 1** (§6) — `courses.ajouter_article`, `courses.cocher`/
 * `decocher_article`, `bibliotheque.ajouter_article` — et renvoie :
 *   - un RÉCAP transparent (§6, règle V3 : jamais de fusion silencieuse) ;
 *   - un jeu de données d'ANNULATION ({@link BrainUndo}) permettant de défaire
 *     immédiatement (toast ANNULER ~6 s) — c'est aussi la fondation du `undo_data`
 *     persisté du journal (Phase 3, prompt 7).
 *
 * Règle d'or (§2.12) : on ne fait JAMAIS confiance au client. Les ids reçus sont
 * re-vérifiés sous RLS (propriété couple + bon `kind`), et les noms d'articles
 * repassent TOUJOURS par {@link normaliserNom} côté serveur (jamais la clé venue
 * de l'IA/du client). Aucune suppression n'est exécutable ici (§5.2).
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Une ligne du récap affichable dans le toast (§6 « Transparence »). */
export type RecapLigne = {
  nom: string
  /** Détail humain : « ajouté », « 200 + 300 = 500 g », « coché »… */
  detail: string
}

/**
 * Une opération d'annulation. Elle décrit COMMENT défaire, sans jamais dépendre
 * d'un état client. Sérialisable (jsonb) → réutilisable tel quel par le journal.
 */
export type UndoOp =
  | { kind: "delete_list_item"; listId: string; itemId: string }
  | {
      kind: "restore_quantities"
      listId: string
      itemId: string
      quantities: QuantiteBase[]
    }
  | { kind: "uncheck_list_item"; listId: string; itemId: string }
  | { kind: "recheck_list_item"; listId: string; itemId: string }
  | { kind: "delete_library_item"; itemId: string }
  | { kind: "uncheck_task"; listId: string; taskId: string }
  | { kind: "recheck_task"; listId: string; taskId: string }

/** Bloc d'annulation renvoyé au client (opaque pour lui, réappliqué par le serveur). */
export type BrainUndo = { ops: UndoOp[] }

export type ExecuteResult =
  | { ok: true; recap: RecapLigne[]; undo: BrainUndo }
  | { ok: false; error: string }

export type UndoResult = { ok: true } | { ok: false; error: string }

/** Intents exécutables ICI (niveau 1, §6). Tout le reste est refusé. */
const INTENTS_NIVEAU_1 = new Set([
  "courses.ajouter_article",
  "courses.cocher_article",
  "courses.decocher_article",
  "bibliotheque.ajouter_article",
  "taches.cocher",
])

/* ------------------------------------------------------------------ garde-fous */

/**
 * Auth + rattachement couple (même pattern que les autres Server Actions). La RLS
 * reste la barrière finale ; ceci borne aussi les ids reçus du client.
 */
async function requireMembership(): Promise<{
  supabase: ServerClient
  userId: string
  coupleId: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .single()

  if (!profile?.couple_id) redirect("/onboarding")

  return { supabase, userId: user.id, coupleId: profile.couple_id }
}

/** Échappe les métacaractères LIKE pour une recherche `ilike` exacte. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/**
 * Confirme qu'une liste appartient au couple ET qu'elle est bien une liste de
 * COURSES (double la RLS, borne le `list_id` reçu du client). Renvoie l'id validé
 * ou `null`.
 */
async function assertCoursesList(
  supabase: ServerClient,
  listId: string,
  coupleId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return data?.kind === "courses" ? data.id : null
}

/**
 * Confirme qu'une liste appartient au couple ET qu'elle est bien une to-do list
 * (double la RLS, borne le `list_id` reçu). Renvoie l'id validé ou `null`.
 */
async function assertTodoList(
  supabase: ServerClient,
  listId: string,
  coupleId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return data?.kind === "todo" ? data.id : null
}

/**
 * Résout la tâche à cocher (§5.2 `taches.cocher`) par CLÉ de titre normalisée
 * ({@link normaliserNom}), jamais un id venu du client. Cherche parmi les tâches
 * NON FAITES : dans la to-do nommée si `listeId` est fournie, sinon dans toutes
 * les to-do du couple. En cas d'homonymes, prend la plus récente (même règle que
 * `courses.cocher`). Renvoie `{ taskId, listId }` ou `null` si aucune ne matche.
 */
async function resoudreTacheACocher(
  supabase: ServerClient,
  coupleId: string,
  cleTitre: string,
  listeId: string | null,
): Promise<{ taskId: string; listId: string } | null> {
  let listIds: string[]
  if (listeId) {
    const ok = await assertTodoList(supabase, listeId, coupleId)
    if (!ok) return null
    listIds = [ok]
  } else {
    const { data: lists } = await supabase
      .from("lists")
      .select("id")
      .eq("couple_id", coupleId)
      .eq("kind", "todo")
    listIds = (lists ?? []).map((l) => l.id)
  }
  if (listIds.length === 0) return null

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, list_id, created_at")
    .in("list_id", listIds)
    .eq("is_done", false)
    .order("created_at", { ascending: false })

  const match = (tasks ?? []).find((t) => normaliserNom(t.title) === cleTitre)
  return match ? { taskId: match.id, listId: match.list_id } : null
}

/** Résout l'id d'un rayon du couple par nom (insensible à la casse), ou `null`. */
async function resolveCategoryId(
  supabase: ServerClient,
  coupleId: string,
  categoryName: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("couple_id", coupleId)
    .ilike("name", escapeLike(categoryName))
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Find-or-create d'un article de bibliothèque par CLÉ normalisée (règle d'or §5 :
 * la clé est TOUJOURS recalculée serveur, jamais celle du client). Incrémente
 * l'usage à l'ajout en liste (comme le chemin recette). `created` distingue les
 * deux cas pour l'annulation.
 */
async function trouverOuCreerArticle(
  supabase: ServerClient,
  coupleId: string,
  nomAffiche: string,
  cle: string,
  compterUsage: boolean,
): Promise<{ id: string; created: boolean } | null> {
  const { data: matches } = await supabase
    .from("library_items")
    .select("id, usage_count")
    .eq("couple_id", coupleId)
    .eq("nom_normalise", cle)
    .order("usage_count", { ascending: false })
    .limit(1)

  const existing = matches?.[0]
  if (existing) {
    if (compterUsage) {
      await supabase
        .from("library_items")
        .update({
          usage_count: existing.usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    }
    return { id: existing.id, created: false }
  }

  const categoryId = await resolveCategoryId(
    supabase,
    coupleId,
    guessCategory(nomAffiche),
  )

  const { data: created } = await supabase
    .from("library_items")
    .insert({
      couple_id: coupleId,
      name: nomAffiche,
      nom_normalise: cle, // règle d'or §5 : clé canonique fournie par l'app
      category_id: categoryId,
    })
    .select("id")
    .single()

  return created ? { id: created.id, created: true } : null
}

/* ------------------------------------------------------------- exécution */

/**
 * Exécute un LOT d'actions de niveau 1 (§6). Pour le prompt 5, le lot contient en
 * pratique une seule action (« Ajoute le lait et le beurre à Auchan » = une action
 * `courses.ajouter_article` à 2 articles). Le multi-intentions / niveau ≥ 2 est
 * routé ailleurs (prompt 6). Toute action hors du jeu niveau 1 est ignorée
 * défensivement.
 *
 * Renvoie un récap transparent (§6) + les données d'annulation.
 */
export async function executeBrainActions(
  actions: BrainAction[],
): Promise<ExecuteResult> {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { ok: false, error: "Aucune action à exécuter." }
  }
  // Défense en profondeur : ce point d'entrée n'exécute QUE du niveau 1.
  const executables = actions.filter((a) => INTENTS_NIVEAU_1.has(a.intent))
  if (executables.length === 0) {
    return { ok: false, error: "Cette commande n'est pas exécutable ici." }
  }

  const { supabase, userId, coupleId } = await requireMembership()

  const recap: RecapLigne[] = []
  const ops: UndoOp[] = []
  const listesTouchees = new Set<string>()
  const todosTouchees = new Set<string>()
  let biblioTouchee = false

  for (const action of executables) {
    switch (action.intent) {
      case "courses.ajouter_article": {
        const listId = await assertCoursesList(supabase, action.liste_id, coupleId)
        if (!listId) return { ok: false, error: "Liste introuvable." }
        listesTouchees.add(listId)

        for (const art of action.articles) {
          const nom = art.nom.trim()
          const cle = normaliserNom(nom) // jamais la clé venue du client
          if (!cle) continue

          const lib = await trouverOuCreerArticle(
            supabase,
            coupleId,
            nom,
            cle,
            true,
          )
          if (!lib) {
            return { ok: false, error: "Impossible d'ajouter un article. Réessaie." }
          }

          // Ligne ACTIVE (non cochée) existante pour ce produit → on fusionne
          // dedans (jamais dans une ligne déjà cochée, qui appartient au passé).
          const { data: existant } = await supabase
            .from("list_items")
            .select("id, quantities")
            .eq("list_id", listId)
            .eq("library_item_id", lib.id)
            .eq("is_checked", false)
            .maybeSingle()

          const unite: Unite | null = art.unite
          const { quantites, operation } = fusionnerQuantite(
            parseQuantites(existant?.quantities),
            { quantite: art.quantite, unite },
          )

          if (existant) {
            const avant = parseQuantites(existant.quantities)
            const { error } = await supabase
              .from("list_items")
              .update({ quantities: quantites })
              .eq("id", existant.id)
              .eq("list_id", listId)
            if (error) {
              return {
                ok: false,
                error: "Impossible de mettre à jour la liste. Réessaie.",
              }
            }
            // Annulation : restaurer les quantités d'avant fusion.
            ops.push({
              kind: "restore_quantities",
              listId,
              itemId: existant.id,
              quantities: avant,
            })
          } else {
            const { data: inserted, error } = await supabase
              .from("list_items")
              .insert({
                list_id: listId,
                library_item_id: lib.id,
                added_by: userId,
                quantities: quantites,
              })
              .select("id")
              .single()
            if (error || !inserted) {
              return { ok: false, error: "Impossible d'ajouter à la liste. Réessaie." }
            }
            // Annulation : retirer la ligne créée.
            ops.push({ kind: "delete_list_item", listId, itemId: inserted.id })
          }

          // « au goût » est un terme de recette : pour une liste de courses, un
          // article sans quantité se dit simplement « ajouté ». Les fusions de
          // quantités gardent leur détail transparent (§6).
          recap.push({
            nom,
            detail:
              operation.kind === "au_gout"
                ? "ajouté"
                : decrireFusion(operation, quantites),
          })
        }
        break
      }

      case "courses.cocher_article":
      case "courses.decocher_article": {
        const cocher = action.intent === "courses.cocher_article"
        const listId = await assertCoursesList(supabase, action.liste_id, coupleId)
        if (!listId) return { ok: false, error: "Liste introuvable." }
        listesTouchees.add(listId)

        const cle = normaliserNom(action.article.nom)
        if (!cle) continue

        // Résolution de l'article par CLÉ (jamais l'id du client) : on retrouve le
        // library_item du couple, puis la ligne concernée dans cette liste.
        const { data: lib } = await supabase
          .from("library_items")
          .select("id")
          .eq("couple_id", coupleId)
          .eq("nom_normalise", cle)
          .limit(1)
          .maybeSingle()
        if (!lib) {
          return {
            ok: false,
            error: `« ${action.article.nom} » est introuvable dans la liste.`,
          }
        }

        // Pour cocher : la ligne active (non cochée). Pour décocher : une ligne
        // cochée. On prend la plus récente s'il y en a plusieurs.
        const { data: cible } = await supabase
          .from("list_items")
          .select("id")
          .eq("list_id", listId)
          .eq("library_item_id", lib.id)
          .eq("is_checked", !cocher)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!cible) {
          return {
            ok: false,
            error: cocher
              ? `« ${action.article.nom} » n'est pas à prendre dans cette liste.`
              : `« ${action.article.nom} » n'est pas coché dans cette liste.`,
          }
        }

        const { error } = await supabase
          .from("list_items")
          .update({
            is_checked: cocher,
            checked_by: cocher ? userId : null,
            checked_at: cocher ? new Date().toISOString() : null,
          })
          .eq("id", cible.id)
          .eq("list_id", listId)
        if (error) {
          return { ok: false, error: "Action impossible. Réessaie." }
        }

        // Annulation : geste inverse.
        ops.push({
          kind: cocher ? "uncheck_list_item" : "recheck_list_item",
          listId,
          itemId: cible.id,
        })
        recap.push({
          nom: action.article.nom,
          detail: cocher ? "coché" : "décoché",
        })
        break
      }

      case "taches.cocher": {
        const cle = normaliserNom(action.titre)
        if (!cle) continue

        const cible = await resoudreTacheACocher(
          supabase,
          coupleId,
          cle,
          action.liste_id,
        )
        if (!cible) {
          return {
            ok: false,
            error: `« ${action.titre} » est introuvable dans tes tâches.`,
          }
        }

        const { error } = await supabase
          .from("tasks")
          .update({
            is_done: true,
            done_by: userId,
            done_at: new Date().toISOString(),
          })
          .eq("id", cible.taskId)
          .eq("list_id", cible.listId)
        if (error) {
          return { ok: false, error: "Impossible de cocher la tâche. Réessaie." }
        }

        todosTouchees.add(cible.listId)
        // Annulation : décocher la tâche (geste inverse).
        ops.push({
          kind: "uncheck_task",
          listId: cible.listId,
          taskId: cible.taskId,
        })
        recap.push({ nom: action.titre, detail: "coché" })
        break
      }

      case "bibliotheque.ajouter_article": {
        biblioTouchee = true
        for (const art of action.articles) {
          const nom = art.nom.trim()
          const cle = normaliserNom(nom)
          if (!cle) continue

          // Ajout au garde-manger : si la clé existe déjà → on ne crée rien et on
          // ne compte pas d'usage (§8.4 recettes, même règle).
          const lib = await trouverOuCreerArticle(
            supabase,
            coupleId,
            nom,
            cle,
            false,
          )
          if (!lib) {
            return { ok: false, error: "Impossible d'ajouter à la bibliothèque. Réessaie." }
          }
          if (lib.created) {
            ops.push({ kind: "delete_library_item", itemId: lib.id })
          }
          recap.push({
            nom,
            detail: lib.created ? "ajouté" : "déjà dans la bibliothèque",
          })
        }
        break
      }

      default:
        // Intents non-niveau-1 : ignorés (filtrés en amont, garde-fou).
        continue
    }
  }

  if (recap.length === 0) {
    return { ok: false, error: "Rien à faire." }
  }

  for (const listId of listesTouchees) revalidatePath(`/lists/${listId}`)
  for (const listId of todosTouchees) revalidatePath(`/lists/${listId}`)
  if (biblioTouchee) revalidatePath("/library")

  return { ok: true, recap, undo: { ops } }
}

/* ------------------------------------------------------------- annulation */

/**
 * Défait un lot d'actions via ses {@link UndoOp}. Chaque geste est l'inverse exact
 * de l'exécution. Garde-fou DELETE (mémoire projet) : jamais de suppression sans
 * filtre `couple_id`/`id`, et on ne supprime un library_item que s'il n'est plus
 * référencé (aucun list_item ne pointe dessus).
 */
export async function undoBrainActions(undo: BrainUndo): Promise<UndoResult> {
  if (!undo || !Array.isArray(undo.ops) || undo.ops.length === 0) {
    return { ok: false, error: "Rien à annuler." }
  }
  const { supabase, coupleId } = await requireMembership()

  const listesTouchees = new Set<string>()
  const todosTouchees = new Set<string>()
  let biblioTouchee = false

  // On défait dans l'ordre inverse (symétrie stricte avec l'exécution).
  for (const op of [...undo.ops].reverse()) {
    switch (op.kind) {
      case "delete_list_item": {
        // Ne retirer que si la liste appartient au couple (double la RLS).
        if (!(await assertCoursesList(supabase, op.listId, coupleId))) break
        await supabase
          .from("list_items")
          .delete()
          .eq("id", op.itemId)
          .eq("list_id", op.listId)
        listesTouchees.add(op.listId)
        break
      }
      case "restore_quantities": {
        if (!(await assertCoursesList(supabase, op.listId, coupleId))) break
        await supabase
          .from("list_items")
          .update({ quantities: op.quantities })
          .eq("id", op.itemId)
          .eq("list_id", op.listId)
        listesTouchees.add(op.listId)
        break
      }
      case "uncheck_list_item":
      case "recheck_list_item": {
        if (!(await assertCoursesList(supabase, op.listId, coupleId))) break
        const checked = op.kind === "recheck_list_item"
        await supabase
          .from("list_items")
          .update({
            is_checked: checked,
            checked_at: checked ? new Date().toISOString() : null,
          })
          .eq("id", op.itemId)
          .eq("list_id", op.listId)
        listesTouchees.add(op.listId)
        break
      }
      case "uncheck_task":
      case "recheck_task": {
        // Ne toucher que si la to-do appartient au couple (double la RLS).
        if (!(await assertTodoList(supabase, op.listId, coupleId))) break
        const done = op.kind === "recheck_task"
        await supabase
          .from("tasks")
          .update({
            is_done: done,
            done_at: done ? new Date().toISOString() : null,
            done_by: null,
          })
          .eq("id", op.taskId)
          .eq("list_id", op.listId)
        todosTouchees.add(op.listId)
        break
      }
      case "delete_library_item": {
        // Garde-fou cascade : ne supprimer que si plus AUCUN list_item ne
        // référence cet article (sinon on laisse tel quel — annulation partielle
        // sûre plutôt qu'une suppression en cascade).
        const { count } = await supabase
          .from("list_items")
          .select("id", { count: "exact", head: true })
          .eq("library_item_id", op.itemId)
        if ((count ?? 0) === 0) {
          await supabase
            .from("library_items")
            .delete()
            .eq("id", op.itemId)
            .eq("couple_id", coupleId)
          biblioTouchee = true
        }
        break
      }
    }
  }

  for (const listId of listesTouchees) revalidatePath(`/lists/${listId}`)
  for (const listId of todosTouchees) revalidatePath(`/lists/${listId}`)
  if (biblioTouchee) revalidatePath("/library")

  return { ok: true }
}
