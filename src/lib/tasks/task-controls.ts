/**
 * Tri & filtres d'une to-do list (PRD V2.1 §3.5).
 *
 * Fonctions pures appliquées CÔTÉ CLIENT aux tâches déjà chargées (aucune
 * requête, aucun changement de schéma). Le composant garde l'état des contrôles
 * et délègue ici le calcul.
 *
 * Les notions « aujourd'hui » / « en retard » s'appuient sur {@link dueBucket}
 * (comparaison au jour près, fuseau Europe/Paris) — ce sont nos « rappels »
 * dans l'appli.
 */

import { dueBucket, parisTodayIso, type DueBucket } from "./dueBucket"

/** Clé de tri proposée à l'utilisateur. */
export type SortKey = "due" | "manual" | "assignee" | "created"

/** Filtre par personne (assigné), via la couleur d'identité. */
export type PersonFilter = "all" | "sauge" | "brique"

/** Filtre par statut de complétion. */
export type StatusFilter = "all" | "todo" | "done"

/** Filtre par tranche d'échéance (reprend les tranches de {@link DueBucket}). */
export type DueFilter = "all" | DueBucket

/** Couleur d'identité d'une personne (convention deux couleurs du couple). */
type PersonColor = "sauge" | "brique"

/** Forme minimale d'une tâche manipulée par les contrôles (compatible TaskView). */
export type ControllableTask = {
  dueDate: string | null
  createdAt: string
  position: number
  assignedTo: string | null
  isDone: boolean
}

/** Résout la couleur de l'assigné d'une tâche (null si non assignée / inconnue). */
type AssigneeColor = (assignedTo: string | null) => PersonColor | null

/* -------------------------------------------------------------------------- */
/*  Filtres                                                                     */
/* -------------------------------------------------------------------------- */

/** Garde les tâches dont l'assigné a la couleur demandée (`all` = tout passer). */
export function filterByPerson<T extends ControllableTask>(
  tasks: T[],
  person: PersonFilter,
  colorOf: AssigneeColor,
): T[] {
  if (person === "all") return tasks
  return tasks.filter((t) => colorOf(t.assignedTo) === person)
}

/** Garde les tâches de la tranche d'échéance demandée (`all` = tout passer). */
export function filterByDue<T extends ControllableTask>(
  tasks: T[],
  due: DueFilter,
  today: string = parisTodayIso(),
): T[] {
  if (due === "all") return tasks
  return tasks.filter((t) => dueBucket(t.dueDate, today) === due)
}

/* -------------------------------------------------------------------------- */
/*  Tris                                                                        */
/* -------------------------------------------------------------------------- */

/** Comparateur « par échéance croissante » : retard → proche → loin, sans date en bas. */
function compareDue(a: ControllableTask, b: ControllableTask): number {
  // Sans échéance : en bas, les plus récemment créées d'abord.
  if (!a.dueDate && !b.dueDate) return b.createdAt.localeCompare(a.createdAt)
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate.localeCompare(b.dueDate)
}

/** Ordre des couleurs pour le tri « par personne » : sauge, brique, puis non assignée. */
function personRank(color: PersonColor | null): number {
  if (color === "sauge") return 0
  if (color === "brique") return 1
  return 2
}

/**
 * Trie une liste de tâches selon la clé choisie (copie, l'entrée n'est pas mutée) :
 *   - `due`      : par échéance croissante (défaut historique) ;
 *   - `manual`   : par `position` (ordre manuel), à défaut par création ;
 *   - `assignee` : regroupé par personne (sauge, brique, non assignée), puis échéance ;
 *   - `created`  : par date d'ajout, la plus récente d'abord.
 */
export function sortTasksBy<T extends ControllableTask>(
  tasks: T[],
  sort: SortKey,
  colorOf: AssigneeColor,
): T[] {
  const copy = [...tasks]
  switch (sort) {
    case "manual":
      return copy.sort(
        (a, b) =>
          a.position - b.position || a.createdAt.localeCompare(b.createdAt),
      )
    case "created":
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case "assignee":
      return copy.sort(
        (a, b) =>
          personRank(colorOf(a.assignedTo)) -
            personRank(colorOf(b.assignedTo)) || compareDue(a, b),
      )
    case "due":
    default:
      return copy.sort(compareDue)
  }
}
