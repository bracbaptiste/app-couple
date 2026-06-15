/**
 * Logique d'état d'une tâche (ARCHITECTURE_V2 §4.1 et §4.2).
 *
 * Deux fonctions pures, sans dépendance React (le nom « hooks » suit
 * l'arborescence proposée par l'archi, mais ce sont des helpers réutilisables
 * côté serveur comme client) :
 *   - getTaskState : à faire / bientôt due / en retard / faite
 *   - getDueLabel  : étiquette d'échéance lisible (EN RETARD, AUJOURD'HUI…)
 */

/** États d'une tâche selon son échéance et son cochage. */
export type TaskState = "todo" | "soon" | "overdue" | "done"

/** Forme minimale attendue par {@link getTaskState} (compatible `TaskView`). */
export type TaskStateInput = {
  /** Tâche cochée. */
  isDone: boolean
  /** Échéance ISO « yyyy-mm-dd », objet `Date`, ou `null` si aucune. */
  dueDate: string | Date | null
}

/**
 * Calcule l'état d'une tâche (ARCHITECTURE_V2 §4.1).
 *
 * - cochée → `done`
 * - sans échéance → `todo`
 * - échéance dépassée → `overdue`
 * - échéance dans moins de 24h → `soon`
 * - sinon → `todo`
 */
export function getTaskState(
  task: TaskStateInput,
  now: Date = new Date(),
): TaskState {
  if (task.isDone) return "done"
  if (!task.dueDate) return "todo"

  const due = new Date(task.dueDate)
  const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60)

  if (diffHours < 0) return "overdue"
  if (diffHours < 24) return "soon"
  return "todo"
}

/** Formate « jeu. 20 juin » (jour abrégé + jour + mois court). */
const dueFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
})

/** Convertit une échéance (ISO ou Date) en `Date`. */
function toDate(date: string | Date): Date {
  return typeof date === "string" ? new Date(date) : date
}

/**
 * Étiquette d'échéance lisible (ARCHITECTURE_V2 §4.2).
 *
 * Renvoie « EN RETARD », « AUJOURD'HUI », « DEMAIN » ou une date formatée du
 * type « JEU. 20 JUIN ». La comparaison se fait au jour près (les heures sont
 * ignorées), contrairement à {@link getTaskState}.
 */
export function getDueLabel(date: string | Date, now: Date = new Date()): string {
  const value = toDate(date)

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const dueDay = new Date(value.getFullYear(), value.getMonth(), value.getDate())

  if (dueDay < today) return "EN RETARD"
  if (+dueDay === +today) return "AUJOURD'HUI"
  if (+dueDay === +tomorrow) return "DEMAIN"

  return dueFormatter.format(value).toUpperCase()
}
