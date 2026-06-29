/**
 * Classement d'une échéance en « tranche » de rappel (PRD V2.1 §3.5).
 *
 * `tasks.due_date` est un `date` PostgreSQL : un jour calendaire SANS fuseau
 * (« 2026-06-29 »). Pour décider si une tâche est « aujourd'hui » ou « en
 * retard », il faut comparer ce jour au jour courant *à Paris* — pas au fuseau
 * du serveur ni à l'UTC, sinon on décale d'un jour la nuit (PRD §3.1).
 *
 * On évite tout objet `Date` (et ses pièges de fuseau) : la date du jour à Paris
 * est formatée en « yyyy-mm-dd », puis comparée par ordre lexicographique aux
 * `due_date` (eux aussi « yyyy-mm-dd »). Pour ce format, l'ordre des chaînes
 * coïncide avec l'ordre chronologique.
 */

/** Tranche d'échéance d'une tâche, du plus urgent au moins défini. */
export type DueBucket = "overdue" | "today" | "upcoming" | "none"

/** Formate une date en « yyyy-mm-dd » dans le fuseau Europe/Paris. */
const parisDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Jour courant à Paris en « yyyy-mm-dd » (référence des comparaisons). */
export function parisTodayIso(now: Date = new Date()): string {
  return parisDayFormatter.format(now)
}

/**
 * Range une échéance (« yyyy-mm-dd » ou `null`) dans sa tranche, par rapport au
 * jour courant à Paris :
 *   - `null`            → `none` (sans date)
 *   - jour < aujourd'hui → `overdue` (en retard)
 *   - jour = aujourd'hui → `today` (aujourd'hui)
 *   - jour > aujourd'hui → `upcoming` (à venir)
 */
export function dueBucket(
  dueDate: string | null,
  today: string = parisTodayIso(),
): DueBucket {
  if (!dueDate) return "none"
  const day = dueDate.slice(0, 10)
  if (day < today) return "overdue"
  if (day === today) return "today"
  return "upcoming"
}
