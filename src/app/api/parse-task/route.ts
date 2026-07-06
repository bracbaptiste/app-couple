import Anthropic from "@anthropic-ai/sdk"

import {
  construireSystemPrompt,
  jourCourantDansFuseau,
  parseTaskCommand,
  TaskParseError,
  type ProfileContext,
  type TodoListContext,
} from "@/lib/tasks/voice-parsing"
import { createClient } from "@/lib/supabase/server"
import { consumeAiRateLimit } from "@/lib/ai/rate-limit"

/**
 * Route de la commande vocale → tâche structurée (PRD-taches-v2.1 §3.2, §5).
 *
 * Flux : dictée native (navigateur) → texte → cette route (clé serveur) → Claude
 * Haiku 4.5 (modèle éco) → JSON strict parsé défensivement → tâche pré-remplie
 * renvoyée au navigateur. RIEN n'est écrit en base : l'utilisateur valide le
 * résultat avant l'ajout (garde-fou §3.2).
 *
 * Sécurité §3 (NON NÉGOCIABLE) : `ANTHROPIC_API_KEY` est lue côté serveur
 * uniquement, jamais préfixée `NEXT_PUBLIC_`, jamais transmise au navigateur. La
 * date du jour et les listes/profils sont calculés/relus CÔTÉ SERVEUR (RLS) :
 * on ne fait pas confiance au client pour le fuseau ni pour les identifiants.
 */

// Le SDK Anthropic a besoin du runtime Node.js (pas Edge).
export const runtime = "nodejs"

/** Garde-fou longueur d'une phrase dictée (une commande, pas un roman). */
const TEXTE_MAX = 1000

function erreur(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  // 1. Garde d'auth + rattachement au couple (même pattern que les routes IA
  //    Recettes : on n'expose pas une route payante en accès libre).
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

  // 2. Clé serveur. Absente → message clair, sans jamais exposer de secret.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return erreur(
      "Configuration manquante : ANTHROPIC_API_KEY n'est pas définie côté serveur.",
      500,
    )
  }

  // 3. Corps JSON : { text }.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return erreur("Requête invalide : JSON attendu.", 400)
  }
  const o = (body ?? {}) as Record<string, unknown>
  const text = typeof o.text === "string" ? o.text.trim().slice(0, TEXTE_MAX) : ""
  if (!text) return erreur("Aucun texte à analyser.", 400)

  const rate = await consumeAiRateLimit(supabase, "parse-task", 20)
  if (!rate.ok) return erreur(rate.error, rate.status)

  // 4. Contexte relu CÔTÉ SERVEUR sous RLS (jamais fourni par le client) :
  //    - listes to-do accessibles (la RLS de `lists` filtre déjà couple +
  //      partagé/possédé) ;
  //    - les deux profils du couple, pour mapper « pour Soso » → id.
  const { data: listsData } = await supabase
    .from("lists")
    .select("id, name")
    .eq("kind", "todo")
    .order("position", { ascending: true })

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, display_name, color")
    .eq("couple_id", profile.couple_id)

  const lists: TodoListContext[] = listsData ?? []
  const profiles: ProfileContext[] = profilesData ?? []

  // 5. Date du jour résolue côté serveur (fuseau Europe/Paris) : les dates
  //    relatives (« demain », « mardi », « le 15 ») sont calées dessus.
  const jour = jourCourantDansFuseau()
  const systemPrompt = construireSystemPrompt({ jour, lists, profiles })

  // 6. Appel Claude Haiku 4.5 (modèle éco §3.2). Sortie JSON stricte imposée par
  //    le prompt système ; la phrase dictée est le message utilisateur.
  const client = new Anthropic({ apiKey })
  let rawText: string
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: text }],
    })

    if (response.stop_reason === "refusal") {
      return erreur("L'IA a refusé de traiter cette demande.", 422)
    }

    rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
  } catch (e) {
    // Erreurs API typées (clé invalide, quota, surcharge…), sans fuiter de secret.
    if (e instanceof Anthropic.APIError) {
      return erreur(`Erreur de l'API IA (${e.status ?? "?"}).`, 502)
    }
    return erreur("Échec de l'appel à l'IA.", 502)
  }

  // 7. Parsing défensif : JSON strict + validation des ids contre le contexte
  //    serveur (aucun id hallucineé accepté, §5). Échec de parsing → 422 propre.
  try {
    const task = parseTaskCommand(rawText, { lists, profiles })
    return Response.json(task)
  } catch (e) {
    if (e instanceof TaskParseError) {
      return erreur(
        "La réponse de l'IA n'a pas pu être interprétée. Reformule ta phrase.",
        422,
      )
    }
    return erreur("Erreur inattendue lors du traitement.", 500)
  }
}
