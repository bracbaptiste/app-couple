"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

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
