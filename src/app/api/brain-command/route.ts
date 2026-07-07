import Anthropic from "@anthropic-ai/sdk"

import {
  construireBrainSystemPrompt,
  parseBrainCommand,
  BrainParseError,
  type BrainContext,
  type EcranContext,
  type LibraryItemContext,
  type ListeContext,
  type PlanningCaseContext,
  type RecetteContext,
} from "@/lib/brain/command-parsing"
import { jourCourantDansFuseau, type ProfileContext } from "@/lib/tasks/voice-parsing"
import {
  addDays,
  startOfWeek,
  parseDateKey,
  toDateKey,
} from "@/lib/planning/week"
import { createClient } from "@/lib/supabase/server"
import { consumeAiRateLimit } from "@/lib/ai/rate-limit"

/**
 * LA FONDATION du pilotage vocal V4 — le routeur d'intentions (PRD_V4 §5).
 *
 * Généralise `/api/parse-task` : dictée native (navigateur) → texte → cette route
 * (clé serveur) → Claude Haiku 4.5 → LISTE d'actions structurées (§5.3) parsée
 * défensivement → renvoyée au navigateur. RIEN n'est écrit en base ici : la route
 * ne fait que STRUCTURER et VALIDER (les ids résolus) ; la confirmation graduée
 * (§6) puis l'exécution vivent côté client/serveur d'exécution.
 *
 * Sécurité §3 (NON NÉGOCIABLE) : `ANTHROPIC_API_KEY` est lue côté serveur
 * uniquement, jamais préfixée `NEXT_PUBLIC_`. Le contexte (listes, profils,
 * bibliothèque, recettes) et la date du jour sont RELUS/CALCULÉS côté serveur
 * sous RLS ; le client ne transmet que `contexte_ecran` (défauts d'ambiguïté
 * §5.1), jamais pour contourner la RLS.
 */

// Le SDK Anthropic a besoin du runtime Node.js (pas Edge).
export const runtime = "nodejs"

/** Garde-fou longueur d'une phrase dictée (§3 — une commande, pas un roman). */
const TEXTE_MAX = 1000

/** Plafond d'articles bibliothèque injectés au prompt (les plus utilisés). */
const BIBLIO_MAX = 200

function erreur(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

/** Lit `contexte_ecran` du corps client, en le réduisant au strict utile (§5.1). */
function lireEcran(raw: unknown): EcranContext | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const route = typeof o.route === "string" ? o.route : null
  const liste_id = typeof o.liste_id === "string" ? o.liste_id : null
  return route || liste_id ? { route, liste_id } : null
}

export async function POST(request: Request) {
  // 1. Garde d'auth + rattachement au couple (même pattern que les routes IA :
  //    on n'expose pas une route payante en accès libre).
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

  // 3. Corps JSON : { text, contexte_ecran? }.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return erreur("Requête invalide : JSON attendu.", 400)
  }
  const o = (body ?? {}) as Record<string, unknown>
  const text = typeof o.text === "string" ? o.text.trim().slice(0, TEXTE_MAX) : ""
  if (!text) return erreur("Aucun texte à analyser.", 400)
  const ecran = lireEcran(o.contexte_ecran)
  // Biais « ajout de tâche » (§0.5, migration V2.1) : le mic de la to-do envoie
  // `mode: "task"` pour ancrer l'interprétation sur les intents `taches.*`.
  const hint = o.mode === "task" ? ("task" as const) : null

  const rate = await consumeAiRateLimit(supabase, "brain-command", 20)
  if (!rate.ok) return erreur(rate.error, rate.status)

  // Date du jour résolue côté serveur (fuseau Europe/Paris) : les dates relatives
  //    (« demain », « jeudi »…) sont calées dessus (§5.4.6). On en dérive aussi la
  //    semaine courante (lundi → dimanche) pour le contexte planning + la génération.
  const jour = jourCourantDansFuseau()
  const monday = startOfWeek(parseDateKey(jour.iso) ?? new Date())
  const weekStartKey = toDateKey(monday)
  const weekEndKey = toDateKey(addDays(monday, 6))

  // 4. Contexte relu CÔTÉ SERVEUR sous RLS (jamais fourni par le client) : listes
  //    (courses + to-do), les deux profils, articles bibliothèque (résolution des
  //    noms), recettes (id + titre) et le planning de la semaine courante (§8.7).
  const [listsRes, profilesRes, libraryRes, recipesRes, mealsRes] =
    await Promise.all([
      supabase
        .from("lists")
        .select("id, name, kind")
        .is("deleted_at", null)
        .order("position", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, display_name, color")
        .eq("couple_id", profile.couple_id),
      supabase
        .from("library_items")
        .select("id, name, nom_normalise")
        .eq("couple_id", profile.couple_id)
        .is("deleted_at", null)
        .order("usage_count", { ascending: false })
        .limit(BIBLIO_MAX),
      supabase
        .from("recipes")
        .select("id, titre")
        .eq("couple_id", profile.couple_id)
        .is("deleted_at", null),
      supabase
        .from("meal_slots")
        .select("date, creneau, type, texte, recipes(titre)")
        .eq("couple_id", profile.couple_id)
        .gte("date", weekStartKey)
        .lte("date", weekEndKey),
    ])

  const allLists = listsRes.data ?? []
  const coursesLists: ListeContext[] = allLists
    .filter((l) => l.kind === "courses")
    .map((l) => ({ id: l.id, name: l.name }))
  const todoLists: ListeContext[] = allLists
    .filter((l) => l.kind === "todo")
    .map((l) => ({ id: l.id, name: l.name }))
  const profiles: ProfileContext[] = profilesRes.data ?? []
  const libraryItems: LibraryItemContext[] = libraryRes.data ?? []
  const recettes: RecetteContext[] = recipesRes.data ?? []

  // Cases planning déjà remplies (conscience du routeur, §8.7). Le libellé = titre
  // de recette liée ou texte libre ; les cases vides ne figurent pas.
  const planningSemaine: PlanningCaseContext[] = (mealsRes.data ?? [])
    .map((m) => {
      const recette = Array.isArray(m.recipes) ? m.recipes[0] : m.recipes
      const label = m.type === "texte" ? (m.texte ?? "") : (recette?.titre ?? "")
      return {
        date: m.date,
        creneau: m.creneau === "diner" ? ("diner" as const) : ("dejeuner" as const),
        label,
      }
    })
    .filter((c) => c.label)

  const ctx: BrainContext = {
    coursesLists,
    todoLists,
    profiles,
    libraryItems,
    recettes,
    planningSemaine,
    ecran,
  }

  // 5. Prompt système (contexte relu + date du jour Europe/Paris).
  const systemPrompt = construireBrainSystemPrompt({ jour, ctx, hint })

  // 6. Appel Claude Haiku 4.5 (§3, modèle éco). Sortie JSON stricte imposée par
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

  // 7. Parsing défensif : JSON strict + validation contre le contexte serveur
  //    (aucun id halluciné accepté, noms renormalisés, §5.4). Échec → 422 propre.
  try {
    const result = parseBrainCommand(rawText, ctx)
    // `taskContext` : ce qu'il faut au client pour monter l'écran de validation
    // V2.1 EXISTANT (§5.2, `taches.ajouter` = niveau 2) sans second aller-retour —
    // to-do lists + membres, déjà relus serveur. Données du couple, jamais un
    // secret : mêmes infos que l'écran de validation a déjà côté client.
    const taskContext = {
      todoLists,
      members: profiles.map((p) => ({
        id: p.id,
        name: p.display_name,
        color: p.color,
      })),
    }
    // `planningContext` : ce qu'il faut au client pour monter l'écran de génération
    // NIVEAU 2 EXISTANT (prompt 10) sur `planning.generer_liste`, sans second
    // aller-retour — listes de courses + semaine courante, déjà relues serveur. La
    // liste cible est déjà pré-résolue dans l'action ; ceci ne fait que fournir le
    // décor (aucune écriture avant validation, §6).
    const planningContext = { coursesLists, weekStartKey }
    return Response.json({ ...result, taskContext, planningContext })
  } catch (e) {
    if (e instanceof BrainParseError) {
      return erreur("Reformule ta phrase.", 422)
    }
    return erreur("Erreur inattendue lors du traitement.", 500)
  }
}
