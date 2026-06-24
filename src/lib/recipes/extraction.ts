/**
 * Cœur de l'extraction de recette par IA (PRD_recettes §7.2 à §7.4).
 *
 * Ce module ne fait AUCUN appel réseau : il porte le prompt (§7.4), les types
 * du schéma de sortie (§7.3) et la fonction de parsing défensif. Il est ainsi
 * testable unitairement sans clé API ni image. L'appel à Claude vit dans la
 * route serveur (`src/app/api/recipes/extract/route.ts`).
 *
 * Règle d'or §5 : on ne fait JAMAIS confiance à l'IA pour la clé de
 * comparaison. Chaque `nom` d'ingrédient repasse systématiquement par
 * {@link normaliserNom} côté serveur pour remplir `nom_normalise`.
 */

import { normaliserNom } from "@/lib/utils/normalize-name-key"

/** Axe 1 — Type de plat (UN seul par recette), jeu fermé (§10). */
export const TYPES_PLAT = [
  "aperitif",
  "entree",
  "plat",
  "accompagnement",
  "dessert",
  "petit_dejeuner",
  "boisson",
  "sauce_base",
] as const
export type TypePlat = (typeof TYPES_PLAT)[number]

/** Axe 2 — Étiquettes (PLUSIEURS possibles), jeu fermé (§10). */
export const TAGS = [
  "vegetarien",
  "vegan",
  "riche_proteines",
  "leger",
  "gourmand",
  "faible_glucides",
  "sans_gluten",
  "sans_lactose",
  "rapide",
  "conservation",
] as const
export type Tag = (typeof TAGS)[number]

/** Unités acceptées pour une quantité d'ingrédient (§7.3). `null` = « au goût ». */
export const UNITES = ["g", "ml", "piece"] as const
export type Unite = (typeof UNITES)[number]

/**
 * Un ingrédient extrait. `nom_normalise` est ajouté côté serveur (clé §5), il ne
 * vient jamais de l'IA. `quantite`/`unite` sont `null` pour les ingrédients
 * « au goût » (sel, poivre, filet d'huile…).
 */
export interface IngredientExtrait {
  nom: string
  nom_normalise: string
  quantite: number | null
  unite: Unite | null
}

/** Recette structurée renvoyée au navigateur. Calquée sur le §7.3. */
export interface RecetteExtraite {
  titre: string
  duree_minutes: number | null
  type_plat: TypePlat
  tags: Tag[]
  nombre_personnes: number
  calories_par_portion: number | null
  proteines_g: number | null
  glucides_g: number | null
  lipides_g: number | null
  ingredients: IngredientExtrait[]
  etapes: string[]
}

/**
 * Prompt d'extraction — mode « Préserver » (§7.4). Transcription FIDÈLE : on ne
 * juge pas, on ne modifie pas, on n'ajoute aucun ingrédient. Réponse en JSON pur.
 */
export const PROMPT_EXTRACTION = `Tu es un assistant qui lit une recette de cuisine (souvent manuscrite) à partir d'une image et la transcrit fidèlement. Ne juge pas la recette, ne la modifie pas, n'ajoute aucun ingrédient. Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ou après, sans backticks.

Champs :
- "titre" : titre de la recette (déduis-en un court si absent).
- "duree_minutes" : durée totale estimée (préparation + cuisson) en minutes.
- "type_plat" : un seul choix parmi "aperitif", "entree", "plat", "accompagnement", "dessert", "petit_dejeuner", "boisson", "sauce_base".
- "tags" : zéro ou plusieurs choix parmi "vegetarien", "vegan", "riche_proteines", "leger", "gourmand", "faible_glucides", "sans_gluten", "sans_lactose", "rapide", "conservation". N'invente aucun tag hors de cette liste.
- "nombre_personnes" : nombre de personnes pour lequel la recette est écrite. Si non indiqué, mets 4.
- "calories_par_portion", "proteines_g", "glucides_g", "lipides_g" : estimation par portion à partir des ingrédients et quantités. Donne ta meilleure estimation, même approximative.
- "ingredients" : liste. Pour chaque ingrédient : "nom" au singulier, sans article (« tomate », pas « des tomates ») ; "quantite" numérique ou null ; "unite" parmi "g", "ml", "piece" ou null. Convertis les unités courantes vers g/ml/pièce quand c'est possible et sans ambiguïté. Pour les ingrédients « au goût » (sel, poivre, filet d'huile…), mets "quantite" et "unite" à null.
- "etapes" : liste des étapes de préparation, dans l'ordre, une chaîne par étape.

Si une information est illisible, fais ta meilleure interprétation plausible (l'utilisateur la corrigera).`

/** Erreur dédiée : la réponse de l'IA n'est pas un JSON exploitable. */
export class ExtractionParseError extends Error {
  constructor(
    message: string,
    /** Texte brut renvoyé par l'IA, pour debug (jamais la clé API). */
    public readonly raw: string,
  ) {
    super(message)
    this.name = "ExtractionParseError"
  }
}

/**
 * Retire un éventuel encadrement Markdown ```` ```json … ``` ```` autour du JSON,
 * puis isole le premier objet `{ … }`. L'IA est censée répondre en JSON pur
 * (§7.4) mais on ne s'y fie pas : c'est la première ligne de défense.
 */
export function extraireBlocJson(rawText: string): string {
  let s = rawText.trim()

  // Retire les fences ```json … ``` ou ``` … ``` si présents.
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) s = fence[1].trim()

  // Garde du premier « { » à la dernière « } » (ignore tout préambule/suffixe).
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1)
  }
  return s
}

/** Coerce une valeur en nombre fini, sinon `null`. */
function nombreOuNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/** Coerce une valeur en entier positif, avec repli si absent/invalide. */
function entierPositif(v: unknown, repli: number): number {
  const n = nombreOuNull(v)
  return n !== null && n > 0 ? Math.round(n) : repli
}

/** Coerce une unité vers le jeu fermé `UNITES`, sinon `null`. */
function uniteOuNull(v: unknown): Unite | null {
  return typeof v === "string" && (UNITES as readonly string[]).includes(v)
    ? (v as Unite)
    : null
}

/** Normalise un ingrédient brut de l'IA vers `IngredientExtrait` (+ clé §5). */
function coerceIngredient(raw: unknown): IngredientExtrait | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>

  const nom = typeof o.nom === "string" ? o.nom.trim() : ""
  if (!nom) return null // un ingrédient sans nom n'a aucune valeur

  return {
    nom,
    // Règle d'or §5 : la clé est TOUJOURS recalculée côté serveur.
    nom_normalise: normaliserNom(nom),
    quantite: nombreOuNull(o.quantite),
    unite: uniteOuNull(o.unite),
  }
}

/**
 * Coerce un objet JSON déjà parsé vers le schéma `RecetteExtraite` (§7.3).
 *
 * Brique PARTAGÉE entre l'extraction (mode « Préserver », §7) et la génération
 * (mode « Créer / Améliorer », §9) : les deux modes produisent le MÊME schéma de
 * recette, donc les mêmes bornes (§10) et la même règle d'or §5 (chaque `nom`
 * d'ingrédient repassé par {@link normaliserNom}). On ne fait jamais confiance à
 * l'IA pour la clé ni pour les valeurs hors jeu fermé.
 */
export function coerceRecette(o: Record<string, unknown>): RecetteExtraite {
  // type_plat : un seul choix dans l'Axe 1, repli « plat » si hors-liste.
  const type_plat: TypePlat =
    typeof o.type_plat === "string" &&
    (TYPES_PLAT as readonly string[]).includes(o.type_plat)
      ? (o.type_plat as TypePlat)
      : "plat"

  // tags : sous-ensemble de l'Axe 2, dédupliqué, valeurs hors-liste ignorées.
  const tags: Tag[] = Array.isArray(o.tags)
    ? [...new Set(o.tags)].filter((t): t is Tag =>
        (TAGS as readonly string[]).includes(t as string),
      )
    : []

  const ingredients: IngredientExtrait[] = Array.isArray(o.ingredients)
    ? o.ingredients
        .map(coerceIngredient)
        .filter((i): i is IngredientExtrait => i !== null)
    : []

  const etapes: string[] = Array.isArray(o.etapes)
    ? o.etapes
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim())
        .filter(Boolean)
    : []

  return {
    titre:
      typeof o.titre === "string" && o.titre.trim()
        ? o.titre.trim()
        : "Recette sans titre",
    duree_minutes: nombreOuNull(o.duree_minutes),
    type_plat,
    tags,
    nombre_personnes: entierPositif(o.nombre_personnes, 4),
    calories_par_portion: nombreOuNull(o.calories_par_portion),
    proteines_g: nombreOuNull(o.proteines_g),
    glucides_g: nombreOuNull(o.glucides_g),
    lipides_g: nombreOuNull(o.lipides_g),
    ingredients,
    etapes,
  }
}

/**
 * Parse défensivement la réponse texte de Claude vers `RecetteExtraite` (§7.2).
 *
 * - retire les fences et isole l'objet JSON ;
 * - `JSON.parse` dans un `try/catch` → {@link ExtractionParseError} si illisible ;
 * - coerce chaque champ via {@link coerceRecette} (schéma §7.3, bornes §10, clé §5).
 *
 * @throws ExtractionParseError si la réponse n'est pas un objet JSON valide.
 */
export function parseExtraction(rawText: string): RecetteExtraite {
  const bloc = extraireBlocJson(rawText)

  let data: unknown
  try {
    data = JSON.parse(bloc)
  } catch {
    throw new ExtractionParseError(
      "La réponse de l'IA n'est pas un JSON valide.",
      rawText,
    )
  }
  if (!data || typeof data !== "object") {
    throw new ExtractionParseError(
      "La réponse de l'IA n'est pas un objet JSON.",
      rawText,
    )
  }

  return coerceRecette(data as Record<string, unknown>)
}
