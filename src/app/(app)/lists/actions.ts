"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/** Client Supabase serveur typé (inféré du helper, comme dans profile/actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux formulaires / handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const NAME_MAX = 50

/** Borne une chaîne saisie : trim + longueur max. */
function clamp(raw: unknown, max: number): string {
  return String(raw ?? "").trim().slice(0, max)
}

/**
 * Récupère l'utilisateur authentifié + son couple_id. Toute action de cette
 * page exige un compte connecté ET rattaché à un couple. Les Server Actions
 * étant appelables directement (POST), on ne se repose jamais sur l'UI pour
 * l'autorisation. La RLS reste la barrière finale (chaque écriture est filtrée
 * par `current_couple_id()`).
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
 * Crée une nouvelle liste (courses ou to-do), partagée ou perso.
 *
 * - `kind` : "courses" (défaut) ou "todo" — figé à la création (PRD_V2 §2.1).
 * - `share` : "on" => liste partagée avec la conjointe ; absent => liste perso
 *   (visible du seul créateur). `owner_id` = créateur si perso, `null` sinon —
 *   miroir des policies RLS `lists_*_accessible` (is_shared OR owner_id = uid).
 * - `position` : placée en fin de SON groupe (max(position) + 1 parmi les listes
 *   de même `kind`), pour ne pas bousculer l'ordre de l'autre groupe.
 */
export async function createList(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const name = clamp(formData.get("name"), NAME_MAX)
  if (!name) return { ok: false, error: "Entre un nom de liste." }

  // Type de liste : on n'accepte que les deux valeurs connues, défaut courses.
  const kind = formData.get("kind") === "todo" ? "todo" : "courses"
  const isShared = formData.get("share") === "on"

  const { supabase, userId, coupleId } = await requireMembership()

  // Dernière position DU GROUPE (même kind) : on étend ce groupe sans décaler
  // l'autre.
  const { data: last } = await supabase
    .from("lists")
    .select("position")
    .eq("couple_id", coupleId)
    .eq("kind", kind)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (last?.position ?? -1) + 1

  const { error } = await supabase.from("lists").insert({
    couple_id: coupleId,
    name,
    kind,
    is_shared: isShared,
    // Perso => rattachée à son créateur ; partagée => pas de propriétaire unique.
    owner_id: isShared ? null : userId,
    position: nextPosition,
    created_by: userId,
  })

  if (error) {
    return { ok: false, error: "Impossible de créer la liste. Réessaie." }
  }

  revalidatePath("/lists")
  return { ok: true }
}

/** Renomme une liste du couple courant. */
export async function renameList(
  listId: string,
  rawName: string,
): Promise<ActionResult> {
  const name = clamp(rawName, NAME_MAX)
  if (!name) return { ok: false, error: "Le nom ne peut pas être vide." }

  const { supabase, coupleId } = await requireMembership()

  // La clause couple_id double la RLS : on ne touche qu'à ses propres listes.
  const { error } = await supabase
    .from("lists")
    .update({ name })
    .eq("id", listId)
    .eq("couple_id", coupleId)

  if (error) {
    return { ok: false, error: "Impossible de renommer. Réessaie." }
  }

  revalidatePath("/lists")
  return { ok: true }
}

/**
 * Vide la rubrique « Déjà pris » d'une liste : retire tous les articles cochés,
 * en gardant intacts ceux qui restent à acheter (non cochés). Geste de fin de
 * courses — on a tout pris, on nettoie la liste sans la supprimer.
 *
 * Les produits restent dans la bibliothèque (seuls les `list_items` cochés sont
 * supprimés). No-op silencieux s'il n'y a rien de coché.
 */
export async function clearCheckedItems(listId: string): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  // Garde-fou : la liste doit appartenir au couple courant.
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()

  if (!list) return { ok: false, error: "Liste introuvable." }

  const { error } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId)
    .eq("is_checked", true)

  if (error) {
    return { ok: false, error: "Impossible de vider la liste. Réessaie." }
  }

  revalidatePath("/lists")
  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/**
 * Supprime une liste et ses articles.
 * On retire d'abord les `list_items` (filtrés par list_id), puis la liste
 * elle-même (filtrée par couple_id, en plus de la RLS).
 */
export async function deleteList(listId: string): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  // Garde-fou : la liste doit appartenir au couple courant.
  const { data: list } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()

  if (!list) return { ok: false, error: "Liste introuvable." }

  const { error: itemsError } = await supabase
    .from("list_items")
    .delete()
    .eq("list_id", listId)

  if (itemsError) {
    return { ok: false, error: "Suppression impossible. Réessaie." }
  }

  const { error: deleteError } = await supabase
    .from("lists")
    .delete()
    .eq("id", listId)
    .eq("couple_id", coupleId)

  if (deleteError) {
    return { ok: false, error: "Suppression impossible. Réessaie." }
  }

  revalidatePath("/lists")
  return { ok: true }
}
