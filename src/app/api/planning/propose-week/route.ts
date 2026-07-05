import Anthropic from "@anthropic-ai/sdk"

import {
  PROMPT_PROPOSITION_SYSTEM,
  construireMessageProposition,
  parseProposition,
  PropositionParseError,
  type Creneau,
  type PropositionCaseLibre,
  type PropositionContext,
  type PropositionRecette,
} from "@/lib/planning/proposal"
import {
  addDays,
  parseDateKey,
  startOfWeek,
  toDateKey,
  weekDays,
} from "@/lib/planning/week"
import { createClient } from "@/lib/supabase/server"

/**
 * Route de la PROPOSITION IA DE SEMAINE (PRD_V4 §8.4, Phase 6).
 *
 * Flux : navigateur → cette route (clé serveur) → Claude Opus 4.8 → JSON parsé
 * défensivement → placements proposés renvoyés. RIEN n'est écrit : le placement
 * réel passe par l'écran de validation case par case (§8.4), puis `placeMeal`
 * (et l'écran de relecture V3 pour les nouvelles recettes).
 *
 * Sécurité §3 : `ANTHROPIC_API_KEY` serveur uniquement. Le contexte (recettes du
 * carnet, cases libres de la semaine) est RELU sous RLS ; le client ne fournit que
 * la semaine visée (`weekStartKey`, bornée serveur) et les contraintes.
 */

// Le SDK Anthropic a besoin du runtime Node.js (pas Edge).
export const runtime = "nodejs"

/** Longueur max des contraintes en langage naturel (garde-fou prompt). */
const CONTRAINTES_MAX = 500

const CRENEAUX: Creneau[] = ["dejeuner", "diner"]
const CRENEAU_MOMENT: Record<Creneau, string> = { dejeuner: "midi", diner: "soir" }

function erreur(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  // 1. Auth + rattachement couple (route IA payante, jamais en accès libre).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return erreur("Non authentifié.", 401)

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .single()
  if (!profile?.couple_id) return erreur("Aucun couple rattaché.", 403)

  // 2. Clé serveur.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return erreur(
      "Configuration manquante : ANTHROPIC_API_KEY n'est pas définie côté serveur.",
      500,
    )
  }

  // 3. Corps : { contraintes?, weekStartKey? }.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return erreur("Requête invalide : JSON attendu.", 400)
  }
  const o = (body ?? {}) as Record<string, unknown>
  const contraintes =
    typeof o.contraintes === "string"
      ? o.contraintes.trim().slice(0, CONTRAINTES_MAX)
      : ""

  // Semaine visée, NORMALISÉE au lundi côté serveur (jamais confiance au client).
  const parsed =
    typeof o.weekStartKey === "string" ? parseDateKey(o.weekStartKey) : null
  const monday = startOfWeek(parsed ?? new Date())
  const days = weekDays(monday)
  const mondayKey = toDateKey(days[0])
  const sundayKey = toDateKey(addDays(monday, 6))

  // 4. Contexte relu sous RLS : recettes du carnet + repas déjà placés (pour en
  //    déduire les cases LIBRES que l'IA a le droit de remplir).
  const [recipesRes, mealsRes] = await Promise.all([
    supabase
      .from("recipes")
      .select("id, titre, type_plat, tags")
      .eq("couple_id", profile.couple_id),
    supabase
      .from("meal_slots")
      .select("date, creneau")
      .eq("couple_id", profile.couple_id)
      .gte("date", mondayKey)
      .lte("date", sundayKey),
  ])

  const recettes: PropositionRecette[] = (recipesRes.data ?? []).map((r) => ({
    id: r.id,
    titre: r.titre,
    type_plat: r.type_plat,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  }))

  // Cases occupées → à exclure des cases proposables.
  const occupees = new Set(
    (mealsRes.data ?? []).map(
      (m) => `${m.date}|${m.creneau === "diner" ? "diner" : "dejeuner"}`,
    ),
  )
  const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long" })
  const casesLibres: PropositionCaseLibre[] = []
  for (const day of days) {
    const dateKey = toDateKey(day)
    const jour = weekdayFmt.format(day)
    for (const creneau of CRENEAUX) {
      if (occupees.has(`${dateKey}|${creneau}`)) continue
      casesLibres.push({
        date: dateKey,
        creneau,
        label: `${jour} ${CRENEAU_MOMENT[creneau]}`,
      })
    }
  }

  if (casesLibres.length === 0) {
    return erreur("La semaine est déjà complète — aucune case à proposer.", 422)
  }

  const ctx: PropositionContext = { recettes, casesLibres }

  // 5. Appel Claude Opus 4.8 (§3).
  const client = new Anthropic({ apiKey })
  let rawText: string
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: PROMPT_PROPOSITION_SYSTEM,
      messages: [
        {
          role: "user",
          content: construireMessageProposition({ contraintes, ctx }),
        },
      ],
    })

    if (response.stop_reason === "refusal") {
      return erreur("L'IA a refusé de traiter cette demande.", 422)
    }

    rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      return erreur(`Erreur de l'API IA (${e.status ?? "?"}).`, 502)
    }
    return erreur("Échec de l'appel à l'IA.", 502)
  }

  // 6. Parsing défensif (ids validés, cases bornées, nouvelles recettes coercées).
  try {
    const placements = parseProposition(rawText, ctx)
    if (placements.length === 0) {
      return erreur(
        "L'IA n'a rien proposé pour ces contraintes. Reformule ta demande.",
        422,
      )
    }
    return Response.json({ placements, weekStartKey: mondayKey })
  } catch (e) {
    if (e instanceof PropositionParseError) {
      return erreur(
        "La réponse de l'IA n'a pas pu être interprétée. Reformule ta demande.",
        422,
      )
    }
    return erreur("Erreur inattendue lors du traitement.", 500)
  }
}
