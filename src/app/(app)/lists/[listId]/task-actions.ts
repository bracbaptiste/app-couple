"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

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

/* -------------------------------------------------------------------------- */
/*  Ajout d'une tâche                                                          */
/* -------------------------------------------------------------------------- */

/** Entrées de {@link addTask}. */
export type AddTaskInput = {
  listId: string
  /** Intitulé brut saisi (sera borné). */
  rawTitle: string
  /** Échéance optionnelle (ISO « yyyy-mm-dd »). Non câblée pour l'instant. */
  dueDate?: string | null
}

/** Ajoute une tâche (non faite) à une to-do list, attribuée à l'utilisateur. */
export async function addTask(input: AddTaskInput): Promise<ActionResult> {
  const title = clamp(input.rawTitle, TITLE_MAX)
  if (!title) return { ok: false, error: "Entre l’intitulé d’une tâche." }

  const { supabase, userId, coupleId } = await requireMembership()

  if (!(await assertTodoListOwned(supabase, input.listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const { error } = await supabase.from("tasks").insert({
    list_id: input.listId,
    title,
    due_date: input.dueDate ?? null,
    added_by: userId,
  })

  if (error) {
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
}

/** Modifie l'intitulé, la note et/ou l'échéance d'une tâche. */
export async function editTask(input: EditTaskInput): Promise<ActionResult> {
  const title = clamp(input.rawTitle, TITLE_MAX)
  if (!title) return { ok: false, error: "Entre l’intitulé d’une tâche." }

  const noteClean = clamp(input.note, NOTE_MAX)

  const { supabase, coupleId } = await requireMembership()

  if (!(await assertTodoListOwned(supabase, input.listId, coupleId))) {
    return { ok: false, error: "Liste introuvable." }
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      note: noteClean || null,
      due_date: input.dueDate ?? null,
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
