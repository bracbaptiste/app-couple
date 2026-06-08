"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
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
