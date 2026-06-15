"use client"

import Link from "next/link"
import { ArrowLeft, Pencil } from "lucide-react"
import { useMemo, useState, useTransition } from "react"

import { AddTaskBar } from "./AddTaskBar"
import { TaskItem } from "./TaskItem"
import { addTask, toggleTask } from "@/app/(app)/lists/[listId]/task-actions"

type Color = "sauge" | "brique"

/** Membre du couple (pour résoudre le marqueur « ajouté par »). */
export type TodoMemberView = {
  id: string
  name: string
  color: Color
}

/** Une tâche, aplatie pour le rendu. */
export type TaskView = {
  id: string
  title: string
  dueDate: string | null
  isDone: boolean
  addedBy: string | null
}

type TodoListViewProps = {
  listId: string
  name: string
  members: TodoMemberView[]
  /** Tâches non faites de la liste (is_done = false), déjà filtrées côté serveur. */
  tasks: TaskView[]
}

/**
 * Écran d'une to-do list (kind = 'todo').
 *
 * ÉTAPE COURANTE : AddTaskBar + liste des tâches à faire. Le tri par échéance
 * (retard / bientôt / futur), la section « Fait » (§2.8) et le sélecteur de date
 * arrivent aux étapes suivantes.
 */
export function TodoListView({ listId, name, members, tasks }: TodoListViewProps) {
  // Index prénom/couleur par id de profil, pour le marqueur « ajouté par ».
  const membersById = useMemo(() => {
    const map = new Map<string, TodoMemberView>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()

  function handleAdd(title: string, dueDate?: Date) {
    setError(undefined)
    startTransition(async () => {
      const result = await addTask({
        listId,
        rawTitle: title,
        dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : null,
      })
      if (!result.ok) setError(result.error)
    })
  }

  function handleToggle(taskId: string, next: boolean) {
    setError(undefined)
    startTransition(async () => {
      const result = await toggleTask(listId, taskId, next)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col">
      <div className="mb-4">
        {/* Retour : cible tap 44px (DESIGN_SYSTEM §8), aligné au bord gauche. */}
        <Link
          href="/lists"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Listes
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="font-display text-xl uppercase text-ink">{name}</h1>
          {/* Crayon (renommer) — désactivé tant que le module to-do n'est pas câblé. */}
          <button
            type="button"
            disabled
            aria-label="Renommer la liste (bientôt disponible)"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink-soft opacity-50"
          >
            <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <AddTaskBar onAdd={handleAdd} disabled={isPending} />

        {error && (
          <p
            role="alert"
            className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
          >
            {error}
          </p>
        )}

        {tasks.length === 0 ? (
          <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
            Aucune tâche pour l’instant. Ajoute-en une ci-dessus.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                id={task.id}
                title={task.title}
                dueDate={task.dueDate}
                isDone={task.isDone}
                member={task.addedBy ? membersById.get(task.addedBy) ?? null : null}
                onToggle={handleToggle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
