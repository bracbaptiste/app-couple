/**
 * Cœur du mode « Créer / Améliorer » par IA (PRD_recettes §9).
 *
 * Mode strictement séparé du mode « Préserver » (§2.4) : ici l'IA est créative.
 * Comme `extraction.ts`, ce module ne fait AUCUN appel réseau — il porte le cadre
 * culinaire (§9.2, instructions système), le contrat de sortie JSON et le parsing
 * défensif. L'appel à Claude Opus 4.8 vit dans la route serveur
 * (`src/app/api/recipes/generate/route.ts`).
 *
 * La sortie réutilise le MÊME schéma de recette que l'extraction (§7.3) afin
 * d'atterrir dans le même écran de relecture éditable (§7.5) puis de s'enregistrer
 * avec `source = 'ia'` (§9.3). Règle d'or §5 : chaque `nom` d'ingrédient est
 * repassé par `normaliserNom` côté serveur (assuré par {@link coerceRecette}).
 */

import {
  coerceRecette,
  extraireBlocJson,
  type RecetteExtraite,
} from "@/lib/recipes/extraction"

/** Les deux entrées du mode créatif (§9.1). */
export type GenerationMode = "create" | "improve"

/**
 * Cadre culinaire du §9.2, passé à l'IA comme INSTRUCTIONS SYSTÈME (« en
 * coulisse, pas affiché »). Repris mot pour mot du PRD. Aucune interface de
 * notation : l'IA s'en sert pour raisonner et ne ressort que des suggestions
 * concrètes.
 */
export const PROMPT_GENERATION_CADRE = `Tu es un chef qui aide à composer ou améliorer une recette de cuisine maison. Raisonne (sans l'afficher) selon 5 rôles : sujet (l'ingrédient/préparation principal), soutien (ce qui renforce sa saveur/profondeur), correcteur (acidité, amertume, fraîcheur, salinité pour éviter la saturation), contraste (texture ou température différente), lien (sauce, jus, assaisonnement qui réunit l'ensemble). Vérifie aussi mentalement : le sujet est-il identifiable ? les éléments sont-ils cohérents entre eux ? une dominante excessive est-elle compensée ? chaque élément a-t-il une fonction (sinon le retirer) ? le plat reste-t-il agréable jusqu'à la dernière bouchée ?

Restitue une recette claire (titre, ingrédients avec quantités, étapes) et, si pertinent, 2–3 suggestions concrètes d'amélioration en langage simple (ex. « ajoute un trait de citron pour alléger la crème »). Reste dans le registre de la cuisine maison, sans jargon prétentieux.`

/**
 * Contrat de SORTIE ajouté au cadre §9.2 : on impose le même schéma JSON que
 * l'extraction (§7.3), enrichi d'un tableau `suggestions`. Le cadre culinaire
 * reste « en coulisse » ; seules les suggestions concrètes ressortent à l'écran.
 */
const PROMPT_GENERATION_FORMAT = `Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ou après, sans backticks.

Champs :
- "titre" : titre court et appétissant de la recette.
- "duree_minutes" : durée totale estimée (préparation + cuisson) en minutes.
- "type_plat" : un seul choix parmi "aperitif", "entree", "plat", "accompagnement", "dessert", "petit_dejeuner", "boisson", "sauce_base".
- "tags" : zéro ou plusieurs choix parmi "vegetarien", "vegan", "riche_proteines", "leger", "gourmand", "faible_glucides", "sans_gluten", "sans_lactose", "rapide", "conservation". N'invente aucun tag hors de cette liste.
- "nombre_personnes" : nombre de personnes visé (4 par défaut si non précisé).
- "calories_par_portion", "proteines_g", "glucides_g", "lipides_g" : estimation par portion. Donne ta meilleure estimation, même approximative.
- "ingredients" : liste. Pour chaque ingrédient : "nom" au singulier, sans article (« tomate », pas « des tomates ») ; "quantite" numérique ou null ; "unite" parmi "g", "ml", "piece" ou null. Pour les ingrédients « au goût » (sel, poivre, filet d'huile…), mets "quantite" et "unite" à null.
- "etapes" : liste des étapes de préparation, dans l'ordre, une chaîne par étape.
- "suggestions" : 0 à 3 chaînes, suggestions concrètes d'amélioration en langage simple (vide si rien de pertinent).`

/** Prompt système complet (cadre §9.2 + contrat de sortie). */
export const PROMPT_GENERATION_SYSTEM = `${PROMPT_GENERATION_CADRE}\n\n${PROMPT_GENERATION_FORMAT}`

/**
 * Recette d'une recette existante à améliorer, telle que relue en base par la
 * route serveur (jamais fournie par le client comme source de vérité).
 */
export interface RecetteASerialiser {
  titre: string
  duree_minutes: number | null
  type_plat: string
  tags: string[]
  nombre_personnes: number
  ingredients: { nom: string; quantite: number | null; unite: string | null }[]
  etapes: string[]
}

/** Une quantité d'ingrédient en texte lisible pour le prompt (« 200 g », « au goût »). */
function quantiteTexte(quantite: number | null, unite: string | null): string {
  if (quantite === null) return "au goût"
  return unite ? `${quantite} ${unite}` : String(quantite)
}

/**
 * Sérialise une recette existante en texte clair, à insérer dans le message
 * utilisateur du mode « améliorer ». On donne à l'IA une base lisible plutôt que
 * du JSON brut, pour la laisser raisonner librement (§9.2).
 */
export function serialiserRecette(r: RecetteASerialiser): string {
  const lignesIng = r.ingredients
    .map((i) => `- ${i.nom} : ${quantiteTexte(i.quantite, i.unite)}`)
    .join("\n")
  const lignesEtapes = r.etapes.map((e, i) => `${i + 1}. ${e}`).join("\n")
  const meta = [
    r.duree_minutes ? `Durée : ${r.duree_minutes} min` : null,
    `Pour ${r.nombre_personnes} personnes`,
  ]
    .filter(Boolean)
    .join(" · ")

  return [
    `Titre : ${r.titre}`,
    meta,
    "",
    "Ingrédients :",
    lignesIng || "(aucun)",
    "",
    "Étapes :",
    lignesEtapes || "(aucune)",
  ].join("\n")
}

/**
 * Construit le message UTILISATEUR envoyé à l'IA selon le mode (§9.1).
 * - create : la demande en langage naturel.
 * - improve : la recette existante sérialisée + l'éventuelle consigne.
 */
export function construireMessageUtilisateur(params: {
  mode: GenerationMode
  demande?: string
  recetteExistante?: RecetteASerialiser
}): string {
  const demande = (params.demande ?? "").trim()

  if (params.mode === "improve") {
    if (!params.recetteExistante) {
      throw new Error("Recette à améliorer manquante.")
    }
    const consigne = demande
      ? `Consigne d'amélioration : ${demande}`
      : "Améliore cette recette (rends-la plus intéressante tout en respectant son esprit)."
    return `${consigne}\n\nRecette à améliorer :\n\n${serialiserRecette(
      params.recetteExistante,
    )}`
  }

  // create
  return `Crée une recette à partir de cette demande :\n\n${demande}`
}

/** Résultat du parsing : la recette (schéma §7.3) + les suggestions à afficher. */
export interface GenerationResult {
  recette: RecetteExtraite
  suggestions: string[]
}

/** Erreur dédiée : la réponse de l'IA n'est pas un JSON exploitable. */
export class GenerationParseError extends Error {
  constructor(
    message: string,
    /** Texte brut renvoyé par l'IA, pour debug (jamais la clé API). */
    public readonly raw: string,
  ) {
    super(message)
    this.name = "GenerationParseError"
  }
}

/**
 * Parse défensivement la réponse texte d'Opus vers {@link GenerationResult}.
 * Même robustesse que `parseExtraction` : on retire les fences, on isole l'objet,
 * `JSON.parse` sous `try/catch`, puis {@link coerceRecette} (bornes §10 + clé §5).
 * Les `suggestions` sont coercées vers un tableau de chaînes non vides (max 3).
 *
 * @throws GenerationParseError si la réponse n'est pas un objet JSON valide.
 */
export function parseGeneration(rawText: string): GenerationResult {
  const bloc = extraireBlocJson(rawText)

  let data: unknown
  try {
    data = JSON.parse(bloc)
  } catch {
    throw new GenerationParseError(
      "La réponse de l'IA n'est pas un JSON valide.",
      rawText,
    )
  }
  if (!data || typeof data !== "object") {
    throw new GenerationParseError(
      "La réponse de l'IA n'est pas un objet JSON.",
      rawText,
    )
  }

  const o = data as Record<string, unknown>
  const recette = coerceRecette(o)

  const suggestions: string[] = Array.isArray(o.suggestions)
    ? o.suggestions
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3)
    : []

  return { recette, suggestions }
}
