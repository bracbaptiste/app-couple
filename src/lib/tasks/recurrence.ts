/**
 * Modèle de récurrence côté applicatif (PRD-taches-v2.1 §3.3).
 *
 * Pur (sans React) : partagé par la Server Action (`task-actions.ts`), la file
 * hors ligne et l'UI du formulaire. Calque les colonnes `tasks.recurrence_*`
 * mais en camelCase, dans le style des autres vues du front (`dueDate`…).
 *
 * Convention de `weekday` : 0 = lundi … 6 = dimanche (convention de l'app,
 * alignée sur `voice-parsing.ts`), distincte de `Date.getDay()` (0 = dimanche).
 */

export const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"] as const
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number]

/** Règle de récurrence d'une tâche (jeux fermés, valeurs déjà bornées). */
export type Recurrence = {
  type: RecurrenceType
  /** Le « N » de « tous les N jours » (utile pour `daily`). >= 1. */
  interval: number
  /** Jour de la semaine pour `weekly` (0 = lundi … 6 = dimanche), sinon null. */
  weekday: number | null
  /** Jour du mois pour `monthly` (1–31), sinon null. */
  dayOfMonth: number | null
}

/** Récurrence « aucune » — valeur par défaut d'une tâche. */
export const NO_RECURRENCE: Recurrence = {
  type: "none",
  interval: 1,
  weekday: null,
  dayOfMonth: null,
}

/** Libellés des jours, indexés par la convention de l'app (0 = lundi). */
export const WEEKDAY_LABELS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const

/** Initiales des jours (lundi en tête), pour les sélecteurs compacts. */
export const WEEKDAY_INITIALS = ["L", "M", "M", "J", "V", "S", "D"] as const

/** Indice « lundi en tête » (0 = lundi … 6 = dimanche) d'une `Date`. */
export function appWeekday(date: Date): number {
  return (date.getDay() + 6) % 7
}

/** Construit une `Date` locale (minuit) à partir de « yyyy-mm-dd », ou aujourd'hui. */
function dateFromIsoOrToday(iso: string | null): Date {
  if (iso) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number)
    if (y && m && d) return new Date(y, m - 1, d)
  }
  return new Date()
}

/** Jour de semaine par défaut (cohérent avec l'échéance) pour `weekly`. */
export function defaultWeekdayFor(dueIso: string | null): number {
  return appWeekday(dateFromIsoOrToday(dueIso))
}

/** Jour du mois par défaut (cohérent avec l'échéance) pour `monthly`. */
export function defaultDayOfMonthFor(dueIso: string | null): number {
  return dateFromIsoOrToday(dueIso).getDate()
}

/** Coerce une valeur en entier borné [min, max], avec repli. */
function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * Normalise défensivement une récurrence venue du client / de la file hors ligne
 * (données sérialisées non fiables) vers une {@link Recurrence} bornée. Un type
 * inconnu, ou `none`, ramène l'ensemble à {@link NO_RECURRENCE}. Les champs non
 * pertinents pour le type sont remis à `null` / `1`.
 */
export function normalizeRecurrence(raw: unknown): Recurrence {
  if (!raw || typeof raw !== "object") return { ...NO_RECURRENCE }
  const o = raw as Record<string, unknown>
  const type = (RECURRENCE_TYPES as readonly string[]).includes(o.type as string)
    ? (o.type as RecurrenceType)
    : "none"

  if (type === "none") return { ...NO_RECURRENCE }
  if (type === "daily") {
    return {
      type,
      interval: clampInt(o.interval, 1, 365, 1),
      weekday: null,
      dayOfMonth: null,
    }
  }
  if (type === "weekly") {
    return {
      type,
      interval: 1,
      weekday: clampInt(o.weekday, 0, 6, 0),
      dayOfMonth: null,
    }
  }
  // monthly
  return {
    type,
    interval: 1,
    weekday: null,
    dayOfMonth: clampInt(o.dayOfMonth, 1, 31, 1),
  }
}

/** Mappe une récurrence vers les colonnes `recurrence_*` de la table `tasks`. */
export function recurrenceToDbColumns(r: Recurrence): {
  recurrence_type: RecurrenceType
  recurrence_interval: number
  recurrence_weekday: number | null
  recurrence_day_of_month: number | null
} {
  return {
    recurrence_type: r.type,
    recurrence_interval: r.interval,
    recurrence_weekday: r.weekday,
    recurrence_day_of_month: r.dayOfMonth,
  }
}

/** Reconstruit une {@link Recurrence} depuis une ligne `tasks` lue en base. */
export function recurrenceFromDb(row: {
  recurrence_type: string | null
  recurrence_interval: number | null
  recurrence_weekday: number | null
  recurrence_day_of_month: number | null
}): Recurrence {
  return normalizeRecurrence({
    type: row.recurrence_type,
    interval: row.recurrence_interval,
    weekday: row.recurrence_weekday,
    dayOfMonth: row.recurrence_day_of_month,
  })
}
