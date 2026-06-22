"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useMemo, useState } from "react"

import { AddTaskBar } from "./AddTaskBar"
import { DonePanel } from "./DonePanel"
import { TaskItem } from "./TaskItem"
import { useRealtimeTasks } from "@/lib/realtime"
import { runMutation } from "@/lib/offline/mutation-queue"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"
import { useOfflineOptimistic } from "@/lib/offline/use-offline-optimistic"
import { sortPendingTasks } from "@/lib/utils/sortTasks"

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
  /** Note libre optionnelle, affichée en petits caractères sous l'intitulé. */
  note: string | null
  dueDate: string | null
  isDone: boolean
  addedBy: string | null
  /** Date de création ISO — départage le tri des tâches sans échéance. */
  createdAt: string
}

type TodoListViewProps = {
  listId: string
  coupleId: string
  name: string
  members: TodoMemberView[]
  /** Id du profil courant — pour le marqueur d'une tâche ajoutée optimistement. */
  currentMemberId: string
  /** Tâches non faites de la liste (is_done = false), déjà filtrées côté serveur. */
  tasks: TaskView[]
  /**
   * 10 tâches faites les plus récentes (is_done = true, triées `done_at` desc),
   * pour la section « Fait » (DonePanel §2.8).
   */
  doneTasks: TaskView[]
}

/**
 * Action interne du réducteur optimiste. Trois mutations déplacent / insèrent /
 * retirent une tâche sans attendre le serveur :
 *   - `toggle` : à faire ⇄ « Fait » (porté par la tâche) ;
 *   - `add`    : nouvelle tâche insérée en tête des « à faire » ;
 *   - `delete` : tâche retirée des deux sections.
 */
type OptimisticAction =
  | { kind: "toggle"; id: string; done: boolean }
  | { kind: "add"; task: TaskView }
  | {
      kind: "edit"
      id: string
      title: string
      note: string | null
      dueDate: string | null
    }
  | { kind: "delete"; id: string }

/**
 * Réducteur partagé : applique UNE action à la liste combinée (à faire + faites).
 * Réutilisé à deux endroits avec une sémantique différente :
 *   - dans `useOptimistic` (feedback EN LIGNE, annulé en fin de transition) ;
 *   - sur l'overlay HORS LIGNE (changements PERSISTANTS tant qu'on n'a pas
 *     resynchronisé), pour que l'UI ne « rebondisse » pas quand la transition se
 *     termine sans rafraîchissement serveur.
 */
function applyTaskAction(
  current: TaskView[],
  action: OptimisticAction,
): TaskView[] {
  switch (action.kind) {
    case "toggle":
      return current.map((t) =>
        t.id === action.id ? { ...t, isDone: action.done } : t,
      )
    case "add":
      return [action.task, ...current]
    case "edit":
      return current.map((t) =>
        t.id === action.id
          ? {
              ...t,
              title: action.title,
              note: action.note,
              dueDate: action.dueDate,
            }
          : t,
      )
    case "delete":
      return current.filter((t) => t.id !== action.id)
  }
}

/**
 * Écran d'une to-do list (kind = 'todo').
 *
 * AddTaskBar + liste des tâches à faire, triées par urgence (ARCHITECTURE_V2
 * §4.3) : en retard → aujourd'hui/demain → futur → sans échéance. En bas, la
 * section « Fait » repliable (DonePanel §2.8).
 *
 * RÉSILIENCE HORS LIGNE (même stratégie que l'écran courses) : cochage, ajout et
 * suppression passent par `runMutation` (exécution en ligne, mise en file hors
 * ligne) ; l'UI répond immédiatement via `useOptimistic` + un overlay offline
 * persistant ; le cache de lecture garde la dernière copie connue.
 */
export function TodoListView({
  listId,
  coupleId,
  name,
  members,
  currentMemberId,
  tasks,
  doneTasks,
}: TodoListViewProps) {
  // Temps réel : ajout / cochage / modif / suppression d'une tâche côté
  // partenaire (sur CETTE liste) rafraîchit l'écran sans refresh manuel.
  // `refresh()` ne met à jour que la donnée serveur de base ; l'optimiste local
  // reste prioritaire pendant les mutations en cours.
  useRealtimeTasks(listId)

  // Cache de lecture : dernière copie connue de l'écran (à chaque chargement en
  // ligne). Fondation pour la consultation hors ligne (cf. use-offline-cache.ts).
  useOfflineCache(`${coupleId}:tasks:${listId}`, { tasks, doneTasks, members })

  // Index prénom/couleur par id de profil, pour le marqueur « ajouté par ».
  const membersById = useMemo(() => {
    const map = new Map<string, TodoMemberView>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  // Base optimiste : à faire + faites réunies (le réducteur déplace une tâche
  // d'une section à l'autre par simple bascule de `isDone`).
  const combined = useMemo(() => [...tasks, ...doneTasks], [tasks, doneTasks])

  // Affichage optimiste + résilience hors ligne, mutualisés (cf.
  // useOfflineOptimistic) : `displayTasks` = état serveur + optimiste en vol +
  // patches hors ligne persistants ; `apply` applique une action (et la
  // mémorise si l'on est hors ligne).
  const {
    display: displayTasks,
    isPending,
    startAction,
    apply,
  } = useOfflineOptimistic(combined, applyTaskAction)
  const [error, setError] = useState<string | undefined>()

  function handleAdd(title: string, dueDate?: Date) {
    setError(undefined)
    const iso = dueDate ? dueDate.toISOString().slice(0, 10) : null
    // UUID partagé par l'optimiste, la file hors ligne et la base. Un rejeu de
    // la création cible donc toujours la même ligne.
    const taskId = crypto.randomUUID()
    const optimisticTask: TaskView = {
      id: taskId,
      title,
      note: null,
      dueDate: iso,
      isDone: false,
      addedBy: currentMemberId,
      createdAt: new Date().toISOString(),
    }
    const action: OptimisticAction = { kind: "add", task: optimisticTask }
    startAction(async () => {
      apply(action)
      const result = await runMutation("addTask", {
        taskId,
        listId,
        rawTitle: title,
        dueDate: iso,
      })
      if (!result.ok) setError(result.error)
    })
  }

  function handleToggle(taskId: string, next: boolean) {
    setError(undefined)
    const action: OptimisticAction = { kind: "toggle", id: taskId, done: next }
    startAction(async () => {
      apply(action)
      const result = await runMutation("toggleTask", {
        listId,
        taskId,
        done: next,
      })
      if (!result.ok) setError(result.error)
    })
  }

  function handleEdit(
    taskId: string,
    patch: { title: string; note: string | null; dueDate: string | null },
  ) {
    setError(undefined)
    const action: OptimisticAction = {
      kind: "edit",
      id: taskId,
      title: patch.title,
      note: patch.note,
      dueDate: patch.dueDate,
    }
    startAction(async () => {
      apply(action)
      const result = await runMutation("editTask", {
        listId,
        taskId,
        rawTitle: patch.title,
        note: patch.note,
        dueDate: patch.dueDate,
      })
      if (!result.ok) setError(result.error)
    })
  }

  function handleDelete(taskId: string) {
    setError(undefined)
    const action: OptimisticAction = { kind: "delete", id: taskId }
    startAction(async () => {
      apply(action)
      const result = await runMutation("deleteTask", { listId, taskId })
      if (!result.ok) setError(result.error)
    })
  }

  // Reséparation à l'affichage : à faire (triées par urgence) et faites. Une
  // tâche fraîchement cochée reste dans la région « à faire » de `combined`, donc
  // remonte en tête de la section « Fait » (juste-faites d'abord).
  const pending = useMemo(
    () => sortPendingTasks(displayTasks.filter((t) => !t.isDone)),
    [displayTasks],
  )
  const done = useMemo(
    () => displayTasks.filter((t) => t.isDone),
    [displayTasks],
  )

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
        <h1 className="mt-1 font-display text-xl uppercase text-ink">{name}</h1>
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

        {pending.length === 0 && done.length === 0 ? (
          <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
            Aucune tâche pour l’instant. Ajoute-en une ci-dessus.
          </p>
        ) : (
          <>
            {pending.length > 0 && (
              <ul className="flex flex-col gap-2">
                {pending.map((task) => {
                  return (
                    <TaskItem
                      key={task.id}
                      id={task.id}
                      title={task.title}
                      note={task.note}
                      dueDate={task.dueDate}
                      isDone={task.isDone}
                      member={
                        task.addedBy
                          ? membersById.get(task.addedBy) ?? null
                          : null
                      }
                      onToggle={handleToggle}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  )
                })}
              </ul>
            )}

            {/* Section « Fait » repliable (§2.8) */}
            <DonePanel
              tasks={done}
              membersById={membersById}
              onToggle={handleToggle}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          </>
        )}
      </div>
    </div>
  )
}
