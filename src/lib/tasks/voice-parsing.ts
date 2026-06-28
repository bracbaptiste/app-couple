/**
 * Cœur du parsing « commande vocale → tâche structurée » (PRD-taches-v2.1 §3.2, §5).
 *
 * Étage 2 de la stratégie voix : la dictée native de l'OS produit du texte ; ce
 * module construit le prompt système (jeux fermés + contexte) et parse
 * défensivement la réponse de Claude Haiku vers le schéma de sortie. Comme les
 * modules Recettes, il ne fait AUCUN appel réseau — il est donc testable sans clé
 * API. L'appel à Claude vit dans la route serveur
 * (`src/app/api/parse-task/route.ts`).
 *
 * Règle d'or (§5, garde-fou voix) : on ne fait JAMAIS confiance à l'IA pour les
 * identifiants. `assigned_to` et `list_id` ne sont acceptés que s'ils figurent
 * dans le contexte fourni au serveur (listes/profils relus en base sous RLS) ;
 * tout id hallucineé est ramené à `null`. De même, les dates relatives sont
 * résolues par rapport à « aujourd'hui » calculé côté serveur (fuseau
 * Europe/Paris), jamais d'après une date fournie par le client.
 */

import { extraireBlocJson } from "@/lib/recipes/extraction"

/** Types de récurrence (jeu fermé, aligné sur `tasks.recurrence_type`). */
export const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"] as const
export type RecurrenceType = (typeof RECURRENCE_TYPES)[number]

/** Une liste to-do accessible, telle que relue en base sous RLS. */
export interface TodoListContext {
  id: string
  name: string
}

/** Un profil du couple, tel que relu en base sous RLS. */
export interface ProfileContext {
  id: string
  display_name: string
  /** Contrainte base : 'sauge' | 'brique' (cf. PRD §2). */
  color: string
}

/** Règle de récurrence détectée (calquée sur les colonnes `tasks.recurrence_*`). */
export interface ParsedRecurrence {
  type: RecurrenceType
  /** Le « N » (tous les N jours / semaines / mois). >= 1. */
  interval: number
  /** Pour `weekly` : 0 = lundi … 6 = dimanche (convention de l'app). Sinon null. */
  weekday: number | null
  /** Pour `monthly` : 1–31. Sinon null. */
  day_of_month: number | null
}

/** Tâche structurée renvoyée au navigateur (PRD §3.2 / §5). */
export interface ParsedTask {
  title: string
  /** Échéance « YYYY-MM-DD », dates relatives déjà résolues, ou null. */
  due_date: string | null
  /** Règle de récurrence, ou null si la phrase n'en évoque aucune. */
  recurrence: ParsedRecurrence | null
  /** Id d'un profil du contexte (« pour Soso ») ou null. */
  assigned_to: string | null
  /** Id d'une liste du contexte (Maison/Personel/Pro) ou null. */
  list_id: string | null
}

/** Date du jour résolue côté serveur, dans un fuseau donné. */
export interface JourCourant {
  /** « YYYY-MM-DD ». */
  iso: string
  /** Libellé lisible pour le prompt (ex. « dimanche 28 juin 2026 »). */
  label: string
}

/**
 * Calcule la date du jour dans un fuseau (par défaut Europe/Paris), sans faire
 * confiance à l'horloge/au fuseau du client. `en-CA` produit directement le
 * format « YYYY-MM-DD » ; le libellé français sert au prompt.
 */
export function jourCourantDansFuseau(
  now: Date = new Date(),
  timeZone = "Europe/Paris",
): JourCourant {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)

  const label = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now)

  return { iso, label }
}

/**
 * Construit le prompt SYSTÈME : cadre + jeux fermés + contexte (date du jour,
 * listes, profils). Le contexte permet à l'IA de mapper noms → ids ; la
 * validation finale reste côté serveur ({@link parseTaskCommand}).
 */
export function construireSystemPrompt(params: {
  jour: JourCourant
  lists: TodoListContext[]
  profiles: ProfileContext[]
}): string {
  const { jour, lists, profiles } = params

  const listesTexte =
    lists.length > 0
      ? lists.map((l) => `- ${l.name} → "${l.id}"`).join("\n")
      : "(aucune liste disponible)"

  const profilsTexte =
    profiles.length > 0
      ? profiles
          .map((p) => `- ${p.display_name} (${p.color}) → "${p.id}"`)
          .join("\n")
      : "(aucun profil disponible)"

  return `Tu transformes une phrase dictée (en français) en une tâche structurée pour une application de to-do de couple. Tu raisonnes sur le sens de la phrase pour en extraire un titre, une éventuelle échéance, une éventuelle récurrence, une éventuelle personne assignée et une éventuelle liste.

CONTEXTE
- Date d'aujourd'hui : ${jour.label} (${jour.iso}). Résous toutes les dates relatives par rapport à cette date.
- Listes disponibles (nom → id) :
${listesTexte}
- Personnes du couple (nom → id) :
${profilsTexte}

RÈGLES
- "title" : le libellé de la tâche en langage clair, sans les indications de date / récurrence / personne / liste déjà extraites par ailleurs. Ne le laisse jamais vide.
- "due_date" : "YYYY-MM-DD" si une échéance est évoquée, sinon null. Résous les dates relatives par rapport à aujourd'hui : "demain", "après-demain", "ce soir/aujourd'hui" (= aujourd'hui), un jour de semaine ("mardi" = le prochain mardi à venir), "le 15" (le 15 de ce mois-ci s'il n'est pas passé, sinon du mois suivant), "dans 3 jours", "la semaine prochaine", etc. Ne mets une date que si elle est réellement évoquée.
- "recurrence" : un objet si la phrase évoque une répétition ("tous les jours", "tous les mardis", "chaque mois", "tous les 2 jours"), sinon null. Champs :
  - "type" : "daily" | "weekly" | "monthly" (jamais "none" : renvoie null s'il n'y a pas de récurrence).
  - "interval" : entier >= 1 (le N de "tous les N jours/semaines/mois" ; 1 par défaut).
  - "weekday" : pour "weekly" uniquement, l'indice du jour avec 0 = lundi, 1 = mardi, 2 = mercredi, 3 = jeudi, 4 = vendredi, 5 = samedi, 6 = dimanche ; sinon null.
  - "day_of_month" : pour "monthly" uniquement, le jour du mois (1–31) ; sinon null.
- "assigned_to" : l'id EXACT d'une personne ci-dessus si la phrase l'assigne ("pour Soso", "c'est à moi", "à toi de"), sinon null. N'invente jamais d'id.
- "list_id" : l'id EXACT d'une liste ci-dessus si la phrase la désigne ("sur la liste Maison", "dans les courses Pro"), sinon null. N'invente jamais d'id.
- Tout champ non détecté vaut null.

SORTIE
Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour, sans balises Markdown, sans backticks. Forme exacte :
{"title": string, "due_date": string|null, "recurrence": {"type": "daily"|"weekly"|"monthly", "interval": number, "weekday": number|null, "day_of_month": number|null}|null, "assigned_to": string|null, "list_id": string|null}`
}

/** Erreur dédiée : la réponse de l'IA n'est pas un JSON exploitable. */
export class TaskParseError extends Error {
  constructor(
    message: string,
    /** Texte brut renvoyé par l'IA, pour debug (jamais la clé API). */
    public readonly raw: string,
  ) {
    super(message)
    this.name = "TaskParseError"
  }
}

/** Vrai si la valeur est une chaîne « YYYY-MM-DD » correspondant à une date réelle. */
function estDateIsoValide(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [y, m, d] = v.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // Rejette les dates « débordées » (ex. 2026-02-31 normalisé en mars).
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  )
}

/** Coerce une valeur en entier dans [min, max], sinon `null`. */
function entierBorne(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "string" ? Number(v) : v
  if (typeof n !== "number" || !Number.isFinite(n)) return null
  const i = Math.round(n)
  return i >= min && i <= max ? i : null
}

/**
 * Coerce le bloc `recurrence` de l'IA vers {@link ParsedRecurrence} ou `null`.
 * Toute valeur hors des jeux fermés est neutralisée ; `type` absent/`'none'`
 * (ou type non répétitif) ramène l'ensemble à `null`.
 */
function coerceRecurrence(v: unknown): ParsedRecurrence | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>

  const type = o.type
  if (type !== "daily" && type !== "weekly" && type !== "monthly") return null

  const interval = entierBorne(o.interval, 1, 365) ?? 1
  const weekday = type === "weekly" ? entierBorne(o.weekday, 0, 6) : null
  const day_of_month =
    type === "monthly" ? entierBorne(o.day_of_month, 1, 31) : null

  return { type, interval, weekday, day_of_month }
}

/**
 * Parse défensivement la réponse texte de Haiku vers {@link ParsedTask}.
 *
 * Robustesse : retrait des fences, isolation de l'objet `{…}`, `JSON.parse` sous
 * `try/catch`. Validation/coercition de chaque champ contre les jeux fermés et,
 * pour `assigned_to`/`list_id`, contre les ids RÉELLEMENT présents dans le
 * contexte serveur (garde-fou §5 : aucun id inventé n'est accepté).
 *
 * @throws TaskParseError si la réponse n'est pas un objet JSON exploitable, ou
 *   si aucun titre n'a pu en être tiré.
 */
export function parseTaskCommand(
  rawText: string,
  context: { lists: TodoListContext[]; profiles: ProfileContext[] },
): ParsedTask {
  const bloc = extraireBlocJson(rawText)

  let data: unknown
  try {
    data = JSON.parse(bloc)
  } catch {
    throw new TaskParseError("La réponse de l'IA n'est pas un JSON valide.", rawText)
  }
  if (!data || typeof data !== "object") {
    throw new TaskParseError("La réponse de l'IA n'est pas un objet JSON.", rawText)
  }

  const o = data as Record<string, unknown>

  const title = typeof o.title === "string" ? o.title.trim() : ""
  if (!title) {
    throw new TaskParseError("La réponse de l'IA ne contient pas de titre.", rawText)
  }

  const due_date = estDateIsoValide(o.due_date) ? o.due_date : null

  // Ids : acceptés uniquement s'ils existent dans le contexte serveur (RLS).
  const listIds = new Set(context.lists.map((l) => l.id))
  const profileIds = new Set(context.profiles.map((p) => p.id))

  const assigned_to =
    typeof o.assigned_to === "string" && profileIds.has(o.assigned_to)
      ? o.assigned_to
      : null
  const list_id =
    typeof o.list_id === "string" && listIds.has(o.list_id) ? o.list_id : null

  return {
    title,
    due_date,
    recurrence: coerceRecurrence(o.recurrence),
    assigned_to,
    list_id,
  }
}
