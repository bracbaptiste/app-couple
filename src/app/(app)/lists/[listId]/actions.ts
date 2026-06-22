"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { guessCategory } from "@/lib/utils/guess-category"
import { normalizeItemName } from "@/lib/utils/normalize-item-name"

/** Client Supabase serveur typé (inféré du helper, comme dans lists/actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux formulaires / handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const QUANTITY_MAX = 30
const NOTE_MAX = 200

/** Borne une chaîne saisie : trim + longueur max. */
function clamp(raw: unknown, max: number): string {
  return String(raw ?? "").trim().slice(0, max)
}

/** Échappe les métacaractères LIKE (`%` et `_`) pour une recherche `ilike` exacte. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

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
 * Garde-fou commun : confirme que la liste appartient bien au couple courant.
 * Toutes les mutations d'articles passent par là avant d'écrire (double la RLS
 * et borne les `list_id` reçus du client).
 */
async function assertCoursesListOwned(
  supabase: ServerClient,
  listId: string,
  coupleId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return data?.kind === "courses"
}

/* -------------------------------------------------------------------------- */
/*  Ajout d'un article                                                         */
/* -------------------------------------------------------------------------- */

/** Entrées de {@link addItemToList}. */
export type AddItemInput = {
  listId: string
  /** Nom brut saisi (sera normalisé). */
  rawName: string
  /** Quantité optionnelle (« 2 kg », « ×3 »…). */
  quantity?: string | null
  /** Note optionnelle (« marque préférée »…). */
  note?: string | null
}

/**
 * Ajoute un article à une liste, en alimentant aussi la bibliothèque du couple.
 *
 *   1. normalise le nom (trim, espaces, casse cohérente) ;
 *   2. cherche le produit dans la bibliothèque du couple (insensible à la
 *      casse) ; s'il existe on réutilise son `library_item`, on incrémente son
 *      `usage_count` et on rafraîchit `last_used_at` ;
 *   3. sinon on devine son rayon via {@link guessCategory} (table de mots-clés,
 *      sans IA en V1) puis on crée le `library_item` rangé dans ce rayon ;
 *   4. on insère le `list_item` associé (avec quantité / note éventuelles),
 *      attribué à l'utilisateur ;
 *   5. déduplication : si un article identique non coché est déjà présent, on
 *      ne le recrée pas (la liste reste propre).
 *
 * Le vidage du champ et l'affichage de l'erreur sont gérés côté client
 * (`useActionState` + `FormFeedback`).
 */
export async function addItemToList(input: AddItemInput): Promise<ActionResult> {
  const { listId } = input
  const name = normalizeItemName(input.rawName)
  if (!name) return { ok: false, error: "Entre le nom d’un article." }

  const quantity = clamp(input.quantity, QUANTITY_MAX) || null
  const note = clamp(input.note, NOTE_MAX) || null

  const { supabase, userId, coupleId } = await requireMembership()

  if (!(await assertCoursesListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  // 1. Produit déjà connu du couple ? (pas de doublon dans library_items)
  const { data: existing } = await supabase
    .from("library_items")
    .select("id, usage_count")
    .eq("couple_id", coupleId)
    .ilike("name", escapeLike(name))
    .maybeSingle()

  let libraryItemId: string

  if (existing) {
    libraryItemId = existing.id
    await supabase.rpc("increment_library_usage", { p_item_id: existing.id })
  } else {
    // Nouveau produit : on devine son rayon et on le range si ce rayon existe
    // chez le couple (sinon `null` = « Sans rayon »).
    const categoryId = await resolveCategoryId(
      supabase,
      coupleId,
      guessCategory(name),
    )

    const { data: created, error } = await supabase
      .from("library_items")
      .insert({
        couple_id: coupleId,
        name,
        category_id: categoryId,
        usage_count: 1,
      })
      .select("id")
      .single()

    if (error || !created) {
      return { ok: false, error: "Impossible d’ajouter l’article. Réessaie." }
    }
    libraryItemId = created.id
  }

  // 2. Déjà présent et non coché dans cette liste ? On ne duplique pas.
  const { data: dup } = await supabase
    .from("list_items")
    .select("id")
    .eq("list_id", listId)
    .eq("library_item_id", libraryItemId)
    .eq("is_checked", false)
    .maybeSingle()

  if (dup) {
    revalidatePath(`/lists/${listId}`)
    return { ok: true }
  }

  const { error: insErr } = await supabase.from("list_items").insert({
    list_id: listId,
    library_item_id: libraryItemId,
    added_by: userId,
    quantity,
    note,
  })

  if (insErr) {
    return { ok: false, error: "Impossible d’ajouter l’article. Réessaie." }
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/**
 * Résout l'`id` du rayon du couple portant ce nom (insensible à la casse), ou
 * `null` s'il n'existe pas. Permet de rattacher la catégorie devinée à un rayon
 * réel — qui a pu être renommé par le couple.
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

/* -------------------------------------------------------------------------- */
/*  Cocher / décocher                                                          */
/* -------------------------------------------------------------------------- */

/** Coche ou décoche un article (mémorise qui a coché et quand). */
export async function toggleItem(
  listId: string,
  itemId: string,
  checked: boolean,
): Promise<ActionResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  if (!(await assertCoursesListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const { error } = await supabase
    .from("list_items")
    .update({
      is_checked: checked,
      checked_by: checked ? userId : null,
      checked_at: checked ? new Date().toISOString() : null,
    })
    .eq("id", itemId)
    .eq("list_id", listId)

  if (error) {
    return { ok: false, error: "Action impossible. Réessaie." }
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Modifier quantité / note                                                   */
/* -------------------------------------------------------------------------- */

/** Met à jour la quantité et/ou la note d'un article (vide → effacé). */
export async function updateItemDetails(
  listId: string,
  itemId: string,
  rawQuantity: string,
  rawNote: string,
): Promise<ActionResult> {
  const quantity = clamp(rawQuantity, QUANTITY_MAX) || null
  const note = clamp(rawNote, NOTE_MAX) || null

  const { supabase, coupleId } = await requireMembership()

  if (!(await assertCoursesListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const { error } = await supabase
    .from("list_items")
    .update({ quantity, note })
    .eq("id", itemId)
    .eq("list_id", listId)

  if (error) {
    return { ok: false, error: "Modification impossible. Réessaie." }
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Supprimer un article                                                       */
/* -------------------------------------------------------------------------- */

/** Retire un article de la liste (le produit reste dans la bibliothèque). */
export async function deleteItem(
  listId: string,
  itemId: string,
): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  if (!(await assertCoursesListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("id", itemId)
    .eq("list_id", listId)

  if (error) {
    return { ok: false, error: "Suppression impossible. Réessaie." }
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}
