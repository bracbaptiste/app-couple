import Anthropic from "@anthropic-ai/sdk"

import {
  PROMPT_GENERATION_SYSTEM,
  construireMessageUtilisateur,
  parseGeneration,
  GenerationParseError,
  type GenerationMode,
  type RecetteASerialiser,
} from "@/lib/recipes/generation"
import { createClient } from "@/lib/supabase/server"
import { consumeAiRateLimit } from "@/lib/ai/rate-limit"

/**
 * Route du mode « Créer / Améliorer » (PRD_recettes §9).
 *
 * Flux : navigateur → cette route (clé serveur) → Claude Opus 4.8 → JSON parsé
 * défensivement (schéma §7.3 + suggestions) → renvoyé au navigateur. RIEN n'est
 * enregistré ici : l'enregistrement se fait après l'écran de relecture (§7.5),
 * avec `source = 'ia'` (§9.3).
 *
 * Sécurité §3 (NON NÉGOCIABLE) : `ANTHROPIC_API_KEY` est lue côté serveur
 * uniquement, jamais préfixée `NEXT_PUBLIC_`, jamais transmise au navigateur. En
 * mode « améliorer », la recette de référence est RELUE EN BASE (scopée au
 * couple), jamais prise depuis le corps de la requête.
 */

// Le SDK Anthropic a besoin du runtime Node.js (pas Edge).
export const runtime = "nodejs"

/** Longueur max d'une demande en langage naturel (garde-fou prompt). */
const DEMANDE_MAX = 2000

function erreur(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  // 1. Garde d'auth + rattachement au couple (on n'expose pas une route IA
  //    payante en accès libre ; même pattern que les Server Actions du foyer).
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

  // 3. Corps JSON : { mode, demande?, recipeId? }.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return erreur("Requête invalide : JSON attendu.", 400)
  }
  const o = (body ?? {}) as Record<string, unknown>
  const mode = o.mode as GenerationMode
  if (mode !== "create" && mode !== "improve") {
    return erreur("Mode invalide (attendu : create | improve).", 400)
  }

  const demande =
    typeof o.demande === "string" ? o.demande.trim().slice(0, DEMANDE_MAX) : ""

  // En mode « créer », une demande est nécessaire (l'IA part de rien).
  if (mode === "create" && !demande) {
    return erreur("Décris la recette que tu veux créer.", 400)
  }

  // 4. Mode « améliorer » : on RELIT la recette en base, scopée au couple (RLS +
  //    filtre explicite). Le client ne fournit que l'`id` — jamais le contenu.
  let recetteExistante: RecetteASerialiser | undefined
  if (mode === "improve") {
    const recipeId = typeof o.recipeId === "string" ? o.recipeId : ""
    if (!recipeId) return erreur("Recette à améliorer manquante.", 400)

    const { data: recipe } = await supabase
      .from("recipes")
      .select(
        "id, titre, duree_minutes, type_plat, tags, nombre_personnes, etapes",
      )
      .eq("id", recipeId)
      .eq("couple_id", profile.couple_id)
      .maybeSingle()
    if (!recipe) return erreur("Recette introuvable.", 404)

    const { data: ingData } = await supabase
      .from("recipe_ingredients")
      .select("nom_affiche, quantite, unite, ordre")
      .eq("recipe_id", recipe.id)
      .order("ordre", { ascending: true })

    recetteExistante = {
      titre: recipe.titre,
      duree_minutes: recipe.duree_minutes,
      type_plat: recipe.type_plat,
      tags: Array.isArray(recipe.tags) ? recipe.tags : [],
      nombre_personnes: recipe.nombre_personnes,
      ingredients: (ingData ?? []).map((i) => ({
        nom: i.nom_affiche,
        quantite: i.quantite,
        unite: i.unite,
      })),
      etapes: Array.isArray(recipe.etapes)
        ? recipe.etapes.filter((e): e is string => typeof e === "string")
        : [],
    }
  }

  const rate = await consumeAiRateLimit(supabase, "recipes-generate", 6)
  if (!rate.ok) return erreur(rate.error, rate.status)

  // 5. Appel Claude Opus 4.8 (§3) : cadre culinaire §9.2 en système, demande/
  //    recette en message utilisateur.
  const messageUtilisateur = construireMessageUtilisateur({
    mode,
    demande,
    recetteExistante,
  })

  const client = new Anthropic({ apiKey })
  let rawText: string
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      system: PROMPT_GENERATION_SYSTEM,
      messages: [{ role: "user", content: messageUtilisateur }],
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

  // 6. Parsing défensif + normalisation des noms (§5) — dans le module dédié.
  try {
    const result = parseGeneration(rawText)
    return Response.json(result)
  } catch (e) {
    if (e instanceof GenerationParseError) {
      return erreur(
        "La réponse de l'IA n'a pas pu être interprétée. Reformule ta demande.",
        422,
      )
    }
    return erreur("Erreur inattendue lors du traitement.", 500)
  }
}
