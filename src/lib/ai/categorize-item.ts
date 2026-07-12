import Anthropic from "@anthropic-ai/sdk"

import { createClient } from "@/lib/supabase/server"
import { consumeAiRateLimit } from "@/lib/ai/rate-limit"
import { FALLBACK_CATEGORY, guessCategory } from "@/lib/utils/guess-category"

/**
 * Repli IA de la devinette de rayon — l'« étape 3 » du trieur.
 *
 * {@link guessCategory} (dictionnaire, sans IA) reste la première passe : gratuite
 * et instantanée, elle couvre l'immense majorité des courses. Ce module n'entre en
 * jeu QUE quand le dictionnaire renvoie « Autre » (produit inconnu), et uniquement
 * à la CRÉATION d'un `library_item` : une fois le rayon écrit sur le produit, il est
 * réutilisé à chaque ajout (cf. la mémoire native de `library_items`). L'IA est donc
 * appelée au plus une fois par nouveau produit inconnu du couple.
 *
 * Sécurité : `ANTHROPIC_API_KEY` est lue côté serveur uniquement, jamais préfixée
 * `NEXT_PUBLIC_`. La liste des rayons proposés au modèle est relue sous RLS pour le
 * couple courant (rayons éventuellement renommés).
 *
 * Robustesse : ce repli ne DOIT jamais faire échouer l'ajout d'un article. Toute
 * anomalie (clé absente, quota, erreur ou lenteur de l'API, réponse inattendue)
 * retombe silencieusement sur « Autre » — exactement l'état d'avant l'IA.
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Modèle éco, aligné sur les autres routes IA du projet. */
const MODEL = "claude-haiku-4-5"

/** Coupe court : un rayon tient en quelques tokens. */
const MAX_TOKENS = 24

/** L'ajout d'un article ne doit pas traîner : on borne l'attente réseau. */
const TIMEOUT_MS = 8000

/** Plafond d'appels par minute et par utilisateur (repli, pas usage intensif). */
const RATE_LIMIT_PER_MINUTE = 30

/**
 * Rapproche la réponse brute du modèle d'un des rayons autorisés (insensible à
 * la casse et aux accents), ou `null` si rien ne correspond (« Autre » compris).
 *
 * Pure et sans I/O : c'est le garde-fou qui empêche un rayon halluciné d'être
 * écrit en base. Testée unitairement.
 */
export function pickCategoryFromReply(
  reply: string,
  categoryNames: string[],
): string | null {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()

  // Le modèle peut ajouter ponctuation ou puce : on garde la 1re ligne utile.
  const candidate = fold(reply.split("\n")[0]?.replace(/^[-*•\s]+/, "") ?? "")
  if (!candidate) return null

  for (const name of categoryNames) {
    if (fold(name) === candidate) return name
  }
  return null
}

/**
 * Demande à Claude de ranger `name` dans un des rayons `categoryNames`. Renvoie
 * le NOM exact d'un rayon existant, ou `null` (→ « Autre ») en cas d'échec.
 */
async function categorizeWithAI(
  supabase: ServerClient,
  name: string,
  categoryNames: string[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || categoryNames.length === 0) return null

  // Rate-limit AVANT l'appel payant. En cas de dépassement on n'échoue pas :
  // l'article est simplement rangé dans « Autre ».
  const rate = await consumeAiRateLimit(supabase, "categorize-item", RATE_LIMIT_PER_MINUTE)
  if (!rate.ok) return null

  const system =
    "Tu ranges des produits de courses (alimentaire, hygiène, entretien, maison) " +
    "dans le bon rayon de magasin. On te donne le nom d'un produit et la liste EXACTE " +
    "des rayons disponibles. Réponds UNIQUEMENT par le nom d'un rayon, copié à " +
    "l'identique depuis la liste, sans ponctuation ni phrase. Si aucun rayon ne " +
    "convient, réponds exactement « Autre ».\n\nRayons disponibles :\n" +
    categoryNames.map((c) => `- ${c}`).join("\n")

  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 })
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: name }],
    })

    if (response.stop_reason === "refusal") return null

    const reply = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")

    return pickCategoryFromReply(reply, categoryNames)
  } catch {
    // Erreur ou timeout de l'API : on ne bloque jamais l'ajout.
    return null
  }
}

/**
 * Devine le NOM du rayon pour `name` : dictionnaire d'abord, repli IA seulement
 * si le dictionnaire échoue (« Autre »). Remplace `guessCategory(name)` sur les
 * chemins de création interactive d'un article.
 *
 * Renvoie toujours un nom exploitable par la résolution `name → id` existante ;
 * « Autre » par défaut. Ne lève jamais.
 */
export async function resolveCategoryName(
  supabase: ServerClient,
  coupleId: string,
  name: string,
): Promise<string> {
  const guessed = guessCategory(name)
  if (guessed !== FALLBACK_CATEGORY) return guessed

  // Produit inconnu du dictionnaire. Pas de clé IA → comportement d'avant.
  if (!process.env.ANTHROPIC_API_KEY) return FALLBACK_CATEGORY

  const { data } = await supabase
    .from("categories")
    .select("name")
    .eq("couple_id", coupleId)
    .order("position", { ascending: true })

  const names = (data ?? [])
    .map((c) => c.name)
    .filter((n): n is string => Boolean(n) && n !== FALLBACK_CATEGORY)

  const ai = await categorizeWithAI(supabase, name, names)
  return ai ?? FALLBACK_CATEGORY
}
