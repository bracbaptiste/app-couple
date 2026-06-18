"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/** Client Supabase serveur typé (inféré du helper, comme dans auth.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Couleurs d'identité disponibles (PRD §5.3). */
const COLORS = ["sauge", "brique"] as const
type Color = (typeof COLORS)[number]

/** Résultat uniforme renvoyé aux formulaires / handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const NAME_MAX = 40
const CATEGORY_MAX = 30

/** Borne une chaîne saisie : trim + longueur max. */
function clamp(raw: unknown, max: number): string {
  return String(raw ?? "").trim().slice(0, max)
}

/**
 * Récupère l'utilisateur authentifié + son couple_id. Toute action de cette
 * page exige un compte connecté ET rattaché à un couple. Sert de garde-fou
 * commun : les Server Actions sont appelables directement (POST), on ne se
 * repose donc jamais sur l'UI pour l'autorisation. La RLS reste la barrière
 * finale (chaque écriture est filtrée par `current_couple_id()`).
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
 * Met à jour le profil : prénom + couleur d'identité.
 * La couleur n'est modifiable que si le/la partenaire ne l'utilise pas déjà
 * (les deux membres ne peuvent pas partager la même couleur, PRD §5.3).
 */
export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const displayName = clamp(formData.get("display_name"), NAME_MAX)
  const color = String(formData.get("color") ?? "") as Color

  if (!displayName) return { ok: false, error: "Entre ton prénom." }
  if (!COLORS.includes(color)) {
    return { ok: false, error: "Choisis une couleur valide." }
  }

  const { supabase, userId, coupleId } = await requireMembership()

  // Contrôle d'unicité de couleur dans le couple (pas de contrainte DB dessus).
  const { data: partner } = await supabase
    .from("profiles")
    .select("color")
    .eq("couple_id", coupleId)
    .neq("id", userId)
    .maybeSingle()

  if (partner && partner.color === color) {
    return {
      ok: false,
      error: "Cette couleur est déjà prise par ton/ta partenaire.",
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName, color })
    .eq("id", userId)

  if (error) {
    return { ok: false, error: "Impossible d'enregistrer. Réessaie." }
  }

  revalidatePath("/profile")
  return { ok: true }
}

/** Ajoute une catégorie à la fin de la liste (position = max + 1). */
export async function addCategory(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const name = clamp(formData.get("name"), CATEGORY_MAX)
  if (!name) return { ok: false, error: "Entre un nom de rayon." }

  const { supabase, coupleId } = await requireMembership()

  const { data: last } = await supabase
    .from("categories")
    .select("position")
    .eq("couple_id", coupleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = (last?.position ?? -1) + 1

  const { error } = await supabase
    .from("categories")
    .insert({ couple_id: coupleId, name, position: nextPosition })

  if (error) {
    return { ok: false, error: "Impossible d'ajouter ce rayon. Réessaie." }
  }

  revalidatePath("/profile/categories")
  return { ok: true }
}

/** Renomme une catégorie du couple courant. */
export async function renameCategory(
  categoryId: string,
  rawName: string,
): Promise<ActionResult> {
  const name = clamp(rawName, CATEGORY_MAX)
  if (!name) return { ok: false, error: "Le nom ne peut pas être vide." }

  const { supabase, coupleId } = await requireMembership()

  // La clause couple_id double la RLS : on ne touche qu'à ses propres rayons.
  const { error } = await supabase
    .from("categories")
    .update({ name })
    .eq("id", categoryId)
    .eq("couple_id", coupleId)

  if (error) {
    return { ok: false, error: "Impossible de renommer. Réessaie." }
  }

  revalidatePath("/profile/categories")
  return { ok: true }
}

/**
 * Déplace une catégorie d'un cran (haut/bas) en échangeant sa position avec
 * sa voisine. Réordonnancement simple, sans drag-and-drop.
 */
export async function moveCategory(
  categoryId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  const { data: cats } = await supabase
    .from("categories")
    .select("id, position")
    .eq("couple_id", coupleId)
    .order("position", { ascending: true })

  if (!cats || cats.length < 2) return { ok: true }

  const index = cats.findIndex((c) => c.id === categoryId)
  if (index === -1) return { ok: false, error: "Rayon introuvable." }

  const swapIndex = direction === "up" ? index - 1 : index + 1
  if (swapIndex < 0 || swapIndex >= cats.length) return { ok: true } // déjà au bord

  const current = cats[index]
  const neighbor = cats[swapIndex]

  // Échange des positions (deux écritures, toutes deux filtrées par couple_id).
  const [a, b] = await Promise.all([
    supabase
      .from("categories")
      .update({ position: neighbor.position })
      .eq("id", current.id)
      .eq("couple_id", coupleId),
    supabase
      .from("categories")
      .update({ position: current.position })
      .eq("id", neighbor.id)
      .eq("couple_id", coupleId),
  ])

  if (a.error || b.error) {
    return { ok: false, error: "Impossible de réordonner. Réessaie." }
  }

  revalidatePath("/profile/categories")
  return { ok: true }
}

/**
 * Supprime une catégorie.
 * - Si elle ne contient aucun produit (bibliothèque) → suppression directe.
 * - Si elle en contient → on EXIGE une catégorie de remplacement : les
 *   produits y sont réaffectés avant la suppression. Sans remplacement, on
 *   bloque avec un message clair (pas de suppression « brutale »).
 */
export async function deleteCategory(
  categoryId: string,
  replacementId: string | null,
): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  // Compte les produits rattachés (source de vérité côté serveur).
  const { count, error: countError } = await supabase
    .from("library_items")
    .select("id", { count: "exact", head: true })
    .eq("couple_id", coupleId)
    .eq("category_id", categoryId)

  if (countError) {
    return { ok: false, error: "Vérification impossible. Réessaie." }
  }

  const usedCount = count ?? 0

  if (usedCount > 0) {
    if (!replacementId) {
      return {
        ok: false,
        error: `Ce rayon contient ${usedCount} produit${
          usedCount > 1 ? "s" : ""
        }. Choisis un rayon de remplacement avant de le supprimer.`,
      }
    }
    if (replacementId === categoryId) {
      return { ok: false, error: "Choisis un autre rayon de remplacement." }
    }

    // Le remplacement doit appartenir au même couple.
    const { data: replacement } = await supabase
      .from("categories")
      .select("id")
      .eq("id", replacementId)
      .eq("couple_id", coupleId)
      .maybeSingle()

    if (!replacement) {
      return { ok: false, error: "Rayon de remplacement invalide." }
    }

    const { error: reassignError } = await supabase
      .from("library_items")
      .update({ category_id: replacementId })
      .eq("couple_id", coupleId)
      .eq("category_id", categoryId)

    if (reassignError) {
      return { ok: false, error: "Réaffectation impossible. Réessaie." }
    }
  }

  const { error: deleteError } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("couple_id", coupleId)

  if (deleteError) {
    return { ok: false, error: "Suppression impossible. Réessaie." }
  }

  revalidatePath("/profile/categories")
  return { ok: true }
}

/**
 * Quitte l'espace couple : détache le profil (couple_id = NULL). Les données
 * partagées (couple, catégories, listes) restent pour l'autre membre.
 * Redirige vers l'onboarding (l'utilisateur devra recréer/rejoindre un espace).
 */
export async function leaveCouple(): Promise<ActionResult> {
  const { supabase, userId } = await requireMembership()

  const { error } = await supabase
    .from("profiles")
    .update({ couple_id: null })
    .eq("id", userId)

  if (error) {
    return { ok: false, error: "Impossible de quitter l'espace. Réessaie." }
  }

  revalidatePath("/profile")
  redirect("/onboarding")
}
