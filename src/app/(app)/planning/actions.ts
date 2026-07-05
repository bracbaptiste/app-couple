"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { parseDateKey } from "@/lib/planning/week"

/** Client Supabase serveur typé (inféré du helper, comme task-actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

/** Longueur max d'un repas « texte libre » (« restes », « pizza surgelée »…). */
const TEXTE_MAX = 80

/** Les deux créneaux d'un jour (§8.1). */
const CRENEAUX = ["dejeuner", "diner"] as const
type Creneau = (typeof CRENEAUX)[number]

/**
 * Récupère l'utilisateur authentifié + son couple_id. Les Server Actions étant
 * appelables directement (POST), on ne se repose jamais sur l'UI pour
 * l'autorisation ; la RLS reste la barrière finale (même pattern task-actions).
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

/** Borne défensive : la clé date d'URL/formulaire est-elle un jour valide ? */
function isValidDateKey(dateKey: unknown): dateKey is string {
  return typeof dateKey === "string" && parseDateKey(dateKey) !== null
}

/** Borne défensive : le créneau reçu appartient-il au jeu fermé ? */
function isValidCreneau(creneau: unknown): creneau is Creneau {
  return CRENEAUX.includes(creneau as Creneau)
}

/* -------------------------------------------------------------------------- */
/*  Placement d'un repas sur une case (§8.2)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Source d'un repas (§8.2) : recette du carnet OU texte libre. La proposition IA
 * (§8.4) arrive en Phase 6 ; elle deviendra une recette normale (`type = recette`)
 * une fois validée, donc rien à prévoir de spécial ici.
 */
export type MealSource =
  | { kind: "recette"; recipeId: string }
  | { kind: "texte"; texte: string }

/**
 * Place (ou remplace) un repas sur une case (couple, jour, créneau). L'unicité
 * `(couple_id, date, creneau)` fait qu'on n'empile jamais deux repas sur le même
 * créneau : placer là où il y a déjà quelque chose REMPLACE (upsert, §8.1).
 *
 * Défense en profondeur : jour/créneau bornés au jeu fermé, et un `recipeId` n'est
 * accepté que s'il désigne une recette DU COUPLE courant (la RLS le garantit déjà,
 * on double la vérification côté action). Le CHECK `meal_slots_content_coherent`
 * garantit en base qu'exactement une des deux formes (recette / texte) est posée.
 *
 * NB : le retrait des articles de courses engendrés par un repas remplacé (§8.6)
 * n'existe pas encore — la génération de la liste de la semaine arrive en Phase 5.
 */
export async function placeMeal(
  dateKey: string,
  creneau: string,
  source: MealSource,
): Promise<ActionResult> {
  if (!isValidDateKey(dateKey) || !isValidCreneau(creneau)) {
    return { ok: false, error: "Case de planning invalide." }
  }

  const { supabase, userId, coupleId } = await requireMembership()

  // Contenu selon la source, en respectant le CHECK de cohérence type ↔ contenu.
  let type: "recette" | "texte"
  let recipeId: string | null = null
  let texte: string | null = null

  if (source.kind === "recette") {
    // L'id de recette ne vient jamais d'un endroit de confiance : on vérifie
    // qu'il appartient bien au couple avant de le référencer (garde-fou §2.12).
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id")
      .eq("id", source.recipeId)
      .eq("couple_id", coupleId)
      .maybeSingle()
    if (!recipe) return { ok: false, error: "Recette introuvable." }
    type = "recette"
    recipeId = recipe.id
  } else {
    const clean = source.texte.trim().slice(0, TEXTE_MAX)
    if (!clean) return { ok: false, error: "Entre le repas (ex. « restes »)." }
    type = "texte"
    texte = clean
  }

  const { error } = await supabase.from("meal_slots").upsert(
    {
      couple_id: coupleId,
      date: dateKey,
      creneau,
      type,
      recipe_id: recipeId,
      texte,
      created_by: userId,
    },
    { onConflict: "couple_id,date,creneau" },
  )

  if (error) {
    return { ok: false, error: "Impossible de placer ce repas. Réessaie." }
  }

  revalidatePath("/planning")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Retrait d'un repas (case vidée)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Vide une case (retire le repas planifié). Filtré par `id` ET `couple_id` :
 * garde-fou global (jamais de DELETE sans filtre couple/id sur une table
 * multi-couples). La RLS empêcherait déjà de toucher la case d'un autre couple ;
 * le filtre explicite double la protection.
 */
export async function clearMeal(slotId: string): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  const { error } = await supabase
    .from("meal_slots")
    .delete()
    .eq("id", slotId)
    .eq("couple_id", coupleId)

  if (error) {
    return { ok: false, error: "Impossible de retirer ce repas. Réessaie." }
  }

  revalidatePath("/planning")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Cochage d'une tâche depuis le planning (§8.3)                              */
/* -------------------------------------------------------------------------- */

/**
 * Coche / décoche une tâche affichée dans le planning (§8.3 : « cochable sur
 * place »). Même écriture que `toggleTask` de l'outil Listes (mémorise qui l'a
 * faite et quand), mais on borne d'abord la tâche à une to-do list DU COUPLE :
 * la tâche ne porte pas de `couple_id`, son rattachement dérive de la liste.
 *
 * Cocher une tâche récurrente déclenche en base la génération de l'occurrence
 * suivante (trigger `tasks_generate_next_occurrence`) : rien à faire ici, la
 * nouvelle ligne apparaîtra d'elle-même (Realtime + refresh).
 *
 * On revalide `/planning` ET la to-do list d'origine : les deux vues reflètent
 * le même état de la tâche.
 */
export async function togglePlanningTask(
  listId: string,
  taskId: string,
  done: boolean,
): Promise<ActionResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  // La liste appartient-elle au couple et est-elle bien une to-do ? (double RLS)
  const { data: list } = await supabase
    .from("lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (list?.kind !== "todo") return { ok: false, error: "Tâche introuvable." }

  const { error } = await supabase
    .from("tasks")
    .update({
      is_done: done,
      done_by: done ? userId : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("list_id", listId)

  if (error) {
    return { ok: false, error: "Action impossible. Réessaie." }
  }

  revalidatePath("/planning")
  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}
