"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/** Client Supabase serveur typé (inféré du helper, comme dans lists/actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux formulaires / handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const NAME_MAX = 60
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
async function assertListOwned(
  supabase: ServerClient,
  listId: string,
  coupleId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return Boolean(data)
}

/* -------------------------------------------------------------------------- */
/*  Ajout d'un article                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Ajoute un article à la liste depuis le champ « Ajouter un article… ».
 *
 * Fondations de l'ajout intelligent (l'autocomplétion / suggestions viendront
 * plus tard) :
 *   1. on cherche le produit dans la bibliothèque du couple (insensible à la
 *      casse) ; s'il existe on réutilise son `library_item` (et on incrémente
 *      sa fréquence d'usage), sinon on le crée ;
 *   2. on insère un `list_item` pointant dessus, attribué à l'utilisateur ;
 *   3. si un article identique est déjà présent et non coché, on n'en
 *      recrée pas (la liste reste propre).
 *
 * Signature compatible `useActionState` via `addItem.bind(null, listId)`.
 */
export async function addItem(
  listId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const name = clamp(formData.get("name"), NAME_MAX)
  if (!name) return { ok: false, error: "Entre le nom d’un article." }

  const { supabase, userId, coupleId } = await requireMembership()

  if (!(await assertListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  // 1. Produit déjà connu du couple ?
  const { data: existing } = await supabase
    .from("library_items")
    .select("id, usage_count")
    .eq("couple_id", coupleId)
    .ilike("name", escapeLike(name))
    .maybeSingle()

  let libraryItemId: string

  if (existing) {
    libraryItemId = existing.id
    await supabase
      .from("library_items")
      .update({
        usage_count: existing.usage_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
  } else {
    const { data: created, error } = await supabase
      .from("library_items")
      .insert({ couple_id: coupleId, name })
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
  })

  if (insErr) {
    return { ok: false, error: "Impossible d’ajouter l’article. Réessaie." }
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
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

  if (!(await assertListOwned(supabase, listId, coupleId))) {
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

  if (!(await assertListOwned(supabase, listId, coupleId))) {
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
/*  Modifier la catégorie                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Change le rayon d'un article. La catégorie est portée par le `library_item`
 * (mémoire de rangement du couple) : on met donc à jour le produit, ce qui le
 * reclasse partout. `categoryId` à `null` = « Sans rayon ».
 */
export async function moveItemToCategory(
  listId: string,
  libraryItemId: string,
  categoryId: string | null,
): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  if (!(await assertListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  // Vérifie que la catégorie cible appartient bien au couple (la RLS de
  // library_items ne contrôle pas la provenance du category_id à elle seule).
  if (categoryId) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("couple_id", coupleId)
      .maybeSingle()
    if (!cat) return { ok: false, error: "Rayon inconnu." }
  }

  const { error } = await supabase
    .from("library_items")
    .update({ category_id: categoryId })
    .eq("id", libraryItemId)
    .eq("couple_id", coupleId)

  if (error) {
    return { ok: false, error: "Changement de rayon impossible. Réessaie." }
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

  if (!(await assertListOwned(supabase, listId, coupleId))) {
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
