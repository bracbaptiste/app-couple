"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import {
  type Recurrence,
  NO_RECURRENCE,
  normalizeRecurrence,
  recurrenceToDbColumns,
} from "@/lib/tasks/recurrence"

/** Client Supabase serveur typé (inféré du helper, comme dans actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

const TITLE_MAX = 120

/** Borne une chaîne saisie : trim + longueur max. */
function clamp(raw: unknown, max: number): string {
  return String(raw ?? "").trim().slice(0, max)
}

/**
 * Récupère l'utilisateur authentifié + son couple_id. Les Server Actions étant
 * appelables directement (POST), on ne se repose jamais sur l'UI pour
 * l'autorisation ; la RLS reste la barrière finale.
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
 * Garde-fou commun : confirme que la liste appartient au couple courant ET
 * qu'il s'agit bien d'une to-do list. Double la RLS et borne les `listId` reçus.
 */
async function assertTodoListOwned(
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
  return data?.kind === "todo"
}

/**
 * Garde-fou « assigné » : on n'accepte un `assigned_to` que s'il désigne un
 * profil du couple courant (l'UI ne propose que les deux membres, mais une
 * Server Action est appelable directement). Toute autre valeur retombe sur
 * `null` (non assigné), jamais sur le profil d'un autre couple.
 */
async function sanitizeAssignee(
  supabase: ServerClient,
  assignedTo: string | null | undefined,
  coupleId: string,
): Promise<string | null> {
  if (!assignedTo) return null
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", assignedTo)
    .eq("couple_id", coupleId)
    .maybeSingle()
  return data ? assignedTo : null
}

/* -------------------------------------------------------------------------- */
/*  Ajout d'une tâche                                                          */
/* -------------------------------------------------------------------------- */

/** Entrées de {@link addTask}. */
export type AddTaskInput = {
  /** UUID généré côté client, conservé lors d'un éventuel rejeu hors ligne. */
  taskId: string
  listId: string
  /** Intitulé brut saisi (sera borné). */
  rawTitle: string
  /** Échéance optionnelle (ISO « yyyy-mm-dd »). */
  dueDate?: string | null
  /** Assigné (id de profil du couple) ou null (non assigné / partagé). */
  assignedTo?: string | null
  /** Règle de récurrence (défaut : aucune). */
  recurrence?: Recurrence | null
}

/** Ajoute une tâche (non faite) à une to-do list, attribuée à l'utilisateur. */
export async function addTask(input: AddTaskInput): Promise<ActionResult> {
  const title = clamp(input.rawTitle, TITLE_MAX)
  if (!title) return { ok: false, error: "Entre l’intitulé d’une tâche." }

  const { supabase, userId, coupleId } = await requireMembership()

  if (!(await assertTodoListOwned(supabase, input.listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const assignedTo = await sanitizeAssignee(supabase, input.assignedTo, coupleId)
  const recurrence = normalizeRecurrence(input.recurrence ?? NO_RECURRENCE)

  const { error } = await supabase.from("tasks").insert({
    id: input.taskId,
    list_id: input.listId,
    title,
    due_date: input.dueDate ?? null,
    added_by: userId,
    assigned_to: assignedTo,
    ...recurrenceToDbColumns(recurrence),
  })

  if (error) {
    // Un rejeu après une réponse réseau perdue retrouve la même tâche : succès
    // idempotent, pas de seconde ligne.
    if (error.code === "23505") return { ok: true }
    return { ok: false, error: "Impossible d’ajouter la tâche. Réessaie." }
  }

  revalidatePath(`/lists/${input.listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Modification (intitulé · note · échéance)                                  */
/* -------------------------------------------------------------------------- */

const NOTE_MAX = 200

/** Entrées de {@link editTask}. */
export type EditTaskInput = {
  listId: string
  taskId: string
  /** Nouvel intitulé (sera borné ; obligatoire). */
  rawTitle: string
  /** Note libre (bornée ; chaîne vide → effacée/NULL). */
  note?: string | null
  /** Échéance « yyyy-mm-dd » | null (null → échéance retirée). */
  dueDate?: string | null
  /** Assigné (id de profil du couple) ou null (non assigné / partagé). */
  assignedTo?: string | null
  /** Règle de récurrence (défaut : aucune). */
  recurrence?: Recurrence | null
}

/** Modifie l'intitulé, la note, l'échéance, l'assigné et/ou la récurrence d'une tâche. */
export async function editTask(input: EditTaskInput): Promise<ActionResult> {
  const title = clamp(input.rawTitle, TITLE_MAX)
  if (!title) return { ok: false, error: "Entre l’intitulé d’une tâche." }

  const noteClean = clamp(input.note, NOTE_MAX)

  const { supabase, coupleId } = await requireMembership()

  if (!(await assertTodoListOwned(supabase, input.listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const assignedTo = await sanitizeAssignee(supabase, input.assignedTo, coupleId)
  const recurrence = normalizeRecurrence(input.recurrence ?? NO_RECURRENCE)

  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      note: noteClean || null,
      due_date: input.dueDate ?? null,
      assigned_to: assignedTo,
      ...recurrenceToDbColumns(recurrence),
    })
    .eq("id", input.taskId)
    .eq("list_id", input.listId)

  if (error) {
    return { ok: false, error: "Modification impossible. Réessaie." }
  }

  revalidatePath(`/lists/${input.listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Cocher / décocher                                                          */
/* -------------------------------------------------------------------------- */

/** Coche ou décoche une tâche (mémorise qui l'a faite et quand). */
export async function toggleTask(
  listId: string,
  taskId: string,
  done: boolean,
): Promise<ActionResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  if (!(await assertTodoListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

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

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Suppression                                                               */
/* -------------------------------------------------------------------------- */

/** Supprime définitivement une tâche d'une to-do list. */
export async function deleteTask(
  listId: string,
  taskId: string,
): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  if (!(await assertTodoListOwned(supabase, listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("list_id", listId)

  if (error) {
    return { ok: false, error: "Suppression impossible. Réessaie." }
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}
