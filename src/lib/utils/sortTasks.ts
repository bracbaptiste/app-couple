/**
 * Tri des tâches à faire (ARCHITECTURE_V2 §4.3).
 *
 * Ordre d'affichage dans une to-do list :
 *   1. Tâches en retard, de la plus ancienne échéance à la plus récente
 *   2. Tâches bientôt dues (aujourd'hui, demain), puis échéances futures
 *      — l'ensemble est trié par date croissante, donc retard → proche → loin
 *   3. Tâches sans échéance, par ordre de création (les plus récentes d'abord)
 *
 * Les tâches avec échéance se classent toutes par `dueDate` croissant : les
 * échéances dépassées (dates passées) remontent naturellement en tête.
 */

/** Forme minimale triable (compatible `TaskView`). */
export type SortableTask = {
  /** Échéance ISO « yyyy-mm-dd » ou `null`. */
  dueDate: string | null
  /** Date de création ISO (départage les tâches sans échéance). */
  createdAt: string
}

/** Trie les tâches non cochées selon l'ordre d'affichage de l'archi §4.3. */
export function sortPendingTasks<T extends SortableTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    // Les tâches sans échéance vont en bas, les plus récentes d'abord.
    if (!a.dueDate && !b.dueDate) return b.createdAt.localeCompare(a.createdAt)
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    // Échéances : date croissante (retard d'abord, puis proche, puis loin).
    return a.dueDate.localeCompare(b.dueDate)
  })
}
