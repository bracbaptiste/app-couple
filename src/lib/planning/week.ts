/**
 * Helpers de semaine pour le Planning (PRD_V4 §8.1).
 *
 * La grille couvre une semaine ISO : lundi → dimanche. Tout est calculé en heure
 * LOCALE (pas d'UTC) : la « date » d'un repas est un jour civil (colonne `date`
 * de `meal_slots`, sans heure), et l'utilisateur raisonne dans son fuseau. On
 * échange les dates avec Postgres via une clé `YYYY-MM-DD` (type `date`), jamais
 * un ISO horodaté — pour éviter tout décalage de jour lié au fuseau.
 */

/** Nombre de jours d'une semaine affichée (lundi → dimanche). */
export const DAYS_IN_WEEK = 7

/**
 * Clé jour `YYYY-MM-DD` en heure locale (≠ `toISOString()`, qui bascule en UTC
 * et peut reculer d'un jour le soir). C'est le format attendu par la colonne
 * `date` de Postgres.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Parse une clé `YYYY-MM-DD` en Date locale à minuit. Renvoie null si la chaîne
 * n'est pas une date calendaire valide (ex. `2026-13-40`, texte arbitraire d'URL).
 */
export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)
  const date = new Date(year, month - 1, day)
  // Rejette les dates « repliées » par le constructeur (ex. 31 février → 3 mars).
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** Nouvelle Date, décalée de `n` jours (n négatif = passé). Ne mute pas l'entrée. */
export function addDays(date: Date, n: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

/** Nouvelle Date, décalée de `n` semaines. */
export function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * DAYS_IN_WEEK)
}

/**
 * Lundi (00:00 local) de la semaine contenant `date`. `getDay()` renvoie 0 pour
 * dimanche → on le ramène à 7 pour que lundi soit le premier jour (ISO).
 */
export function startOfWeek(date: Date): Date {
  const day = date.getDay() === 0 ? 7 : date.getDay() // lundi=1 … dimanche=7
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return addDays(monday, 1 - day)
}

/** Les 7 dates (lundi → dimanche) de la semaine dont `monday` est le lundi. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(monday, i))
}

/** Deux dates tombent-elles le même jour civil (local) ? */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Résout la semaine à afficher depuis un paramètre d'URL `?debut=YYYY-MM-DD`.
 * On NORMALISE toujours au lundi de la semaine visée (un `debut` tombant un
 * mercredi désigne quand même sa semaine). Paramètre absent/invalide → semaine
 * de `today`. `today` est injecté (testabilité).
 */
export function resolveWeekStart(debut: string | undefined, today: Date): Date {
  const parsed = debut ? parseDateKey(debut) : null
  return startOfWeek(parsed ?? today)
}

/**
 * Libellé d'une semaine, ex. « 30 juin – 6 juil. » ou « 29 déc. – 4 janv. »
 * (à cheval sur deux mois / deux années). Formatage FR via Intl.
 */
export function formatWeekLabel(monday: Date): string {
  const sunday = addDays(monday, DAYS_IN_WEEK - 1)
  const fmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
  return `${fmt.format(monday)} – ${fmt.format(sunday)}`
}
