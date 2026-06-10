"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { guessCategory } from "@/lib/utils/guess-category"
import { normalizeItemName } from "@/lib/utils/normalize-item-name"

/** Client Supabase serveur typé (inféré du helper, comme dans lists/actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Récupère l'utilisateur authentifié + son couple_id. Toute action de cette
 * page exige un compte connecté ET rattaché à un couple. Les Server Actions
 * étant appelables directement (POST), on ne se repose jamais sur l'UI pour
 * l'autorisation. La RLS reste la barrière finale.
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

/**
 * Garde-fou : confirme que le produit appartient bien au couple courant et
 * renvoie son `usage_count`. Borne les `libraryItemId` reçus du client (double
 * la RLS).
 */
async function getOwnedLibraryItem(
  supabase: ServerClient,
  libraryItemId: string,
  coupleId: string,
): Promise<{ id: string; usage_count: number } | null> {
  const { data } = await supabase
    .from("library_items")
    .select("id, usage_count")
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return data ?? null
}

/** Échappe les métacaractères LIKE (`%` et `_`) pour une recherche `ilike` exacte. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/**
 * Résout l'`id` du rayon du couple portant ce nom (insensible à la casse), ou
 * `null` s'il n'existe pas. Permet de ranger un nouveau produit dans le rayon
 * deviné, tel qu'il a pu être renommé par le couple.
 */
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
 * Vérifie qu'un rayon (`categoryId`) appartient bien au couple courant. `null`
 * signifie « Sans rayon » et est toujours valide. Borne les `categoryId` reçus
 * du client (la RLS de `library_items` ne contrôle pas seule la provenance du
 * `category_id` qu'on y écrit).
 */
async function categoryBelongsToCouple(
  supabase: ServerClient,
  categoryId: string | null,
  coupleId: string,
): Promise<boolean> {
  if (!categoryId) return true
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return Boolean(data)
}

/* -------------------------------------------------------------------------- */
/*  Ajouter un produit directement à la bibliothèque                           */
/* -------------------------------------------------------------------------- */

/**
 * Crée un produit dans la bibliothèque du couple sans passer par une liste.
 *
 *   1. normalise le nom (trim, espaces, casse cohérente) ;
 *   2. no-op silencieux si le produit existe déjà (insensible à la casse) — on
 *      ne crée pas de doublon et on n'affiche pas d'erreur bloquante ;
 *   3. sinon on devine son rayon via {@link guessCategory} et on l'y range.
 *
 * Le produit naît avec `usage_count = 0` (réglage par défaut côté base) : il
 * apparaît dans la Bibliothèque mais reste « Rare » tant qu'on ne l'a pas envoyé
 * vers une liste.
 *
 * `categoryId` (optionnel) : rayon choisi explicitement à la création. S'il est
 * fourni et valide on le respecte ; vide / absent → on devine le rayon via
 * {@link guessCategory}.
 */
export async function addLibraryItem(
  rawName: string,
  categoryId?: string | null,
): Promise<ActionResult> {
  const name = normalizeItemName(rawName)
  if (!name) return { ok: false, error: "Entre le nom d’un article." }

  const { supabase, coupleId } = await requireMembership()

  // Déjà connu du couple ? On ne duplique pas (contrainte unique couple_id+name).
  const { data: existing } = await supabase
    .from("library_items")
    .select("id")
    .eq("couple_id", coupleId)
    .ilike("name", escapeLike(name))
    .maybeSingle()

  if (existing) {
    return { ok: false, error: `« ${name} » est déjà dans ta bibliothèque.` }
  }

  // Rayon : choix explicite (validé) prioritaire, sinon on le devine.
  let resolvedCategoryId: string | null
  if (categoryId) {
    resolvedCategoryId = (await categoryBelongsToCouple(
      supabase,
      categoryId,
      coupleId,
    ))
      ? categoryId
      : null
  } else {
    resolvedCategoryId = await resolveCategoryId(
      supabase,
      coupleId,
      guessCategory(name),
    )
  }

  const { error } = await supabase
    .from("library_items")
    .insert({ couple_id: coupleId, name, category_id: resolvedCategoryId })

  if (error) {
    // 23505 = violation d'unicité (course entre deux ajouts simultanés).
    if (error.code === "23505") {
      return { ok: false, error: `« ${name} » est déjà dans ta bibliothèque.` }
    }
    return { ok: false, error: "Impossible d’ajouter l’article. Réessaie." }
  }

  revalidatePath("/library")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Envoyer un produit de la bibliothèque vers une liste                       */
/* -------------------------------------------------------------------------- */

/**
 * Ajoute un produit de la bibliothèque dans une liste choisie par l'utilisateur,
 * puis renforce sa fréquence d'usage :
 *
 *   1. vérifie que le produit ET la liste appartiennent au couple courant ;
 *   2. déduplication : si un article identique non coché existe déjà dans la
 *      liste, on ne le recrée pas (la liste reste propre) ;
 *   3. sinon on insère le `list_item` (attribué à l'utilisateur) ;
 *   4. on incrémente `usage_count` et rafraîchit `last_used_at` — ce qui
 *      remonte le produit dans le tri par fréquence de la Bibliothèque.
 *
 * L'étape 4 a lieu même en cas de doublon : renvoyer un produit vers une liste
 * reste un signal d'usage, indépendamment de la présence d'un doublon.
 */
export async function sendToList(
  libraryItemId: string,
  listId: string,
): Promise<ActionResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  const product = await getOwnedLibraryItem(supabase, libraryItemId, coupleId)
  if (!product) return { ok: false, error: "Article introuvable." }

  // La liste doit appartenir au couple courant (borne le list_id du client).
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!list) return { ok: false, error: "Liste introuvable." }

  // Déjà présent et non coché dans cette liste ? On ne duplique pas.
  const { data: dup } = await supabase
    .from("list_items")
    .select("id")
    .eq("list_id", listId)
    .eq("library_item_id", libraryItemId)
    .eq("is_checked", false)
    .maybeSingle()

  if (!dup) {
    const { error: insErr } = await supabase.from("list_items").insert({
      list_id: listId,
      library_item_id: libraryItemId,
      added_by: userId,
    })
    if (insErr) {
      return { ok: false, error: "Impossible d’envoyer l’article. Réessaie." }
    }
  }

  // Renforce la fréquence d'usage (tri de la Bibliothèque).
  await supabase
    .from("library_items")
    .update({
      usage_count: product.usage_count + 1,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)

  revalidatePath("/library")
  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/**
 * Envoie PLUSIEURS produits sélectionnés vers une même liste en un geste (cœur
 * du flux « je coche mes articles dans la Bibliothèque puis j'exporte tout »).
 *
 *   1. vérifie que la liste appartient au couple courant ;
 *   2. ne retient que les produits réellement possédés par le couple (borne les
 *      ids reçus du client, double la RLS) ;
 *   3. pour chacun : déduplication (pas de doublon non coché) + insertion du
 *      `list_item`, puis renforcement de sa fréquence d'usage.
 *
 * On revalide une seule fois à la fin. Un id inconnu est ignoré silencieusement
 * plutôt que de faire échouer tout le lot.
 */
export async function sendManyToList(
  libraryItemIds: string[],
  listId: string,
): Promise<ActionResult> {
  if (libraryItemIds.length === 0) {
    return { ok: false, error: "Sélectionne au moins un article." }
  }

  const { supabase, userId, coupleId } = await requireMembership()

  // La liste doit appartenir au couple courant (borne le list_id du client).
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!list) return { ok: false, error: "Liste introuvable." }

  // Ne garder que les produits réellement possédés (borne les ids du client).
  const { data: owned } = await supabase
    .from("library_items")
    .select("id, usage_count")
    .eq("couple_id", coupleId)
    .in("id", libraryItemIds)

  if (!owned || owned.length === 0) {
    return { ok: false, error: "Articles introuvables." }
  }

  // Articles déjà présents non cochés dans la liste : on ne les duplique pas.
  const { data: present } = await supabase
    .from("list_items")
    .select("library_item_id")
    .eq("list_id", listId)
    .eq("is_checked", false)
    .in(
      "library_item_id",
      owned.map((p) => p.id),
    )
  const alreadyThere = new Set((present ?? []).map((r) => r.library_item_id))

  const toInsert = owned
    .filter((p) => !alreadyThere.has(p.id))
    .map((p) => ({
      list_id: listId,
      library_item_id: p.id,
      added_by: userId,
    }))

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("list_items").insert(toInsert)
    if (insErr) {
      return { ok: false, error: "Impossible d’envoyer les articles. Réessaie." }
    }
  }

  // Renforce la fréquence d'usage de tous les produits envoyés (doublon compris :
  // renvoyer un article reste un signal d'usage).
  const now = new Date().toISOString()
  await Promise.all(
    owned.map((p) =>
      supabase
        .from("library_items")
        .update({ usage_count: p.usage_count + 1, last_used_at: now })
        .eq("id", p.id)
        .eq("couple_id", coupleId),
    ),
  )

  revalidatePath("/library")
  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Renommer un produit de la bibliothèque                                     */
/* -------------------------------------------------------------------------- */

/**
 * Corrige le nom d'un produit de la bibliothèque (ex. faute d'orthographe).
 *
 * Le nom vit UNIQUEMENT sur `library_items` : les `list_items` pointent vers le
 * produit (`library_item_id`) sans copie du libellé. Renommer ici se répercute
 * donc automatiquement sur TOUTES les listes qui contiennent l'article — aucune
 * mise à jour ligne par ligne, et le temps réel (`useRealtimeListItems` écoute
 * les UPDATE de `library_items`) propage le nouveau nom aux écrans ouverts.
 *
 *   1. normalise le nom (trim, espaces, casse cohérente) ;
 *   2. vérifie l'appartenance au couple (borne le `libraryItemId` du client) ;
 *   3. no-op si le nom n'a pas changé ;
 *   4. refuse si un AUTRE produit du couple porte déjà ce nom (contrainte
 *      `unique (couple_id, name)`) — on n'écrase pas, on invite à fusionner.
 */
export async function renameLibraryItem(
  libraryItemId: string,
  rawName: string,
): Promise<ActionResult> {
  const name = normalizeItemName(rawName)
  if (!name) return { ok: false, error: "Entre un nom d’article." }

  const { supabase, coupleId } = await requireMembership()

  const { data: product } = await supabase
    .from("library_items")
    .select("id, name")
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!product) return { ok: false, error: "Article introuvable." }

  // Rien à changer (déjà ce libellé après normalisation).
  if (product.name === name) return { ok: true }

  // Listes impactées : on les revalidera pour rafraîchir leur affichage.
  const { data: refs } = await supabase
    .from("list_items")
    .select("list_id")
    .eq("library_item_id", libraryItemId)

  const { error } = await supabase
    .from("library_items")
    .update({ name })
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)

  if (error) {
    // 23505 = violation d'unicité (un autre produit porte déjà ce nom).
    if (error.code === "23505") {
      return {
        ok: false,
        error: `« ${name} » existe déjà dans ta bibliothèque.`,
      }
    }
    return { ok: false, error: "Renommage impossible. Réessaie." }
  }

  revalidatePath("/library")
  for (const listId of new Set((refs ?? []).map((r) => r.list_id))) {
    revalidatePath(`/lists/${listId}`)
  }
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Modifier un produit (nom ET rayon) en un seul geste                        */
/* -------------------------------------------------------------------------- */

/**
 * Met à jour le nom ET le rayon d'un produit de la bibliothèque en une fois
 * (panneau d'édition combiné). Comme pour le renommage, ces deux champs vivent
 * sur `library_items` : la modification se RÉPERCUTE PARTOUT (toutes les listes
 * qui contiennent l'article), sans copie ligne par ligne. La quantité et la note
 * (propres à chaque `list_item`) ne sont jamais touchées ici.
 *
 *   1. normalise le nom ;
 *   2. vérifie l'appartenance du produit au couple (borne le `libraryItemId`) ;
 *   3. vérifie que le rayon cible appartient au couple (`null` = « Sans rayon ») ;
 *   4. no-op si ni le nom ni le rayon ne changent ;
 *   5. refuse si un AUTRE produit du couple porte déjà ce nom (unicité).
 */
export async function updateLibraryItem(
  libraryItemId: string,
  rawName: string,
  categoryId: string | null,
): Promise<ActionResult> {
  const name = normalizeItemName(rawName)
  if (!name) return { ok: false, error: "Entre un nom d’article." }

  const { supabase, coupleId } = await requireMembership()

  const { data: product } = await supabase
    .from("library_items")
    .select("id, name, category_id")
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!product) return { ok: false, error: "Article introuvable." }

  if (!(await categoryBelongsToCouple(supabase, categoryId, coupleId))) {
    return { ok: false, error: "Rayon inconnu." }
  }

  // Rien à changer (même nom après normalisation ET même rayon).
  if (product.name === name && (product.category_id ?? null) === categoryId) {
    return { ok: true }
  }

  // Listes impactées : on les revalidera pour rafraîchir leur affichage.
  const { data: refs } = await supabase
    .from("list_items")
    .select("list_id")
    .eq("library_item_id", libraryItemId)

  const { error } = await supabase
    .from("library_items")
    .update({ name, category_id: categoryId })
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)

  if (error) {
    // 23505 = violation d'unicité (un autre produit porte déjà ce nom).
    if (error.code === "23505") {
      return {
        ok: false,
        error: `« ${name} » existe déjà dans ta bibliothèque.`,
      }
    }
    return { ok: false, error: "Modification impossible. Réessaie." }
  }

  revalidatePath("/library")
  for (const listId of new Set((refs ?? []).map((r) => r.list_id))) {
    revalidatePath(`/lists/${listId}`)
  }
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Supprimer un produit de la bibliothèque                                    */
/* -------------------------------------------------------------------------- */

/**
 * Supprime un produit mal saisi de la bibliothèque.
 *
 * Contrainte d'intégrité : la FK `list_items.library_item_id` est en
 * `on delete cascade` — supprimer un produit encore référencé effacerait
 * silencieusement les articles correspondants dans les listes. On REFUSE donc
 * la suppression tant que le produit est utilisé, et on indique combien de
 * listes le référencent. L'utilisateur doit d'abord retirer l'article de ses
 * listes. Un produit non référencé (1 seule occurrence historique, déjà retirée)
 * est supprimé proprement.
 */
export async function deleteLibraryItem(
  libraryItemId: string,
): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  const product = await getOwnedLibraryItem(supabase, libraryItemId, coupleId)
  if (!product) return { ok: false, error: "Article introuvable." }

  // Encore référencé par des list_items ? On bloque (cascade destructrice).
  const { count } = await supabase
    .from("list_items")
    .select("id", { count: "exact", head: true })
    .eq("library_item_id", libraryItemId)

  if (count && count > 0) {
    return {
      ok: false,
      error: `Encore présent dans ${count} liste${count > 1 ? "s" : ""}. Retire-le d’abord de tes listes.`,
    }
  }

  const { error } = await supabase
    .from("library_items")
    .delete()
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)

  if (error) {
    return { ok: false, error: "Suppression impossible. Réessaie." }
  }

  revalidatePath("/library")
  return { ok: true }
}
