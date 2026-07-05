/**
 * Cœur de la PROPOSITION IA DE SEMAINE (PRD_V4 §8.4).
 *
 * Comme `generation.ts` (recettes) et `command-parsing.ts` (routeur), ce module
 * ne fait AUCUN appel réseau : il porte le prompt système (Opus 4.8, §3), le
 * contrat de sortie JSON et le parsing défensif — donc testable sans clé API.
 * L'appel Opus vit dans la route serveur (`/api/planning/propose-week`).
 *
 * Règles fondatrices reprises du cadrage :
 *   - PRIORITÉ aux recettes EXISTANTES du couple (référencées par leur id, validé
 *     contre le contexte — jamais un id halluciné, §2.12) ;
 *   - l'IA peut proposer de NOUVELLES recettes (schéma recette complet, §7.3),
 *     marquées « nouvelle recette » et créées via l'écran de relecture V3 si
 *     acceptées (§8.2 source `ia`) ;
 *   - l'IA ne remplit QUE les cases LIBRES fournies (elle ne réécrit pas un repas
 *     déjà posé) ; le placement réel reste soumis à validation case par case (§8.4).
 */

import {
  coerceRecette,
  extraireBlocJson,
  type RecetteExtraite,
} from "@/lib/recipes/extraction"

/** Les deux créneaux d'un jour (§8.1). */
export type Creneau = "dejeuner" | "diner"

/** Une recette du carnet, réduite à ce qu'il faut pour guider la proposition. */
export interface PropositionRecette {
  id: string
  titre: string
  type_plat: string
  tags: string[]
}

/** Une case LIBRE que l'IA peut remplir (jamais une case déjà occupée). */
export interface PropositionCaseLibre {
  date: string
  creneau: Creneau
  /** Libellé humain (« jeudi soir »), pour le prompt et l'écran de validation. */
  label: string
}

/** Contexte relu serveur, injecté au prompt ET à la validation. */
export interface PropositionContext {
  recettes: PropositionRecette[]
  casesLibres: PropositionCaseLibre[]
}

/**
 * Un placement proposé (validé). Soit une recette EXISTANTE (référence), soit une
 * NOUVELLE recette (à créer via la relecture V3 si acceptée). `label` = libellé de
 * la case (« jeudi soir »).
 */
export type PropositionPlacement = {
  date: string
  creneau: Creneau
  label: string
} & (
  | { kind: "existante"; recipe_id: string; titre: string }
  | { kind: "nouvelle"; recette: RecetteExtraite }
)

/** Erreur dédiée : la réponse d'Opus n'est pas un JSON exploitable. */
export class PropositionParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message)
    this.name = "PropositionParseError"
  }
}

/** Prompt système Opus (§3, §8.4) : cadre + contrat de sortie JSON strict. */
export const PROMPT_PROPOSITION_SYSTEM = `Tu es un chef qui compose le menu de la semaine d'un couple (2 personnes par défaut). On te donne des contraintes, la liste des recettes DÉJÀ dans leur carnet, et les créneaux LIBRES de la semaine (jour + midi/soir).

Règles :
- PRIVILÉGIE FORTEMENT les recettes existantes du carnet : réutilise-les dès qu'elles conviennent, en les référençant par leur id.
- Tu peux proposer de NOUVELLES recettes quand le carnet ne suffit pas à respecter les contraintes ; fournis alors la recette complète.
- Ne place des repas QUE sur les créneaux libres fournis (au plus un repas par créneau). Tu n'es pas obligé de tout remplir : respecte d'abord les contraintes (ex. « 3 dîners végétariens » = 3 dîners, pas forcément toute la semaine).
- Varie les plats, évite de répéter la même recette dans la semaine.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans backticks :
{"placements": [ ...objets placement... ]}

Chaque placement est un objet :
- "date" : "YYYY-MM-DD" (doit être un créneau libre fourni).
- "creneau" : "dejeuner" (midi) ou "diner" (soir).
- "type" : "existante" ou "nouvelle".
- Si "existante" : "recipe_id" = l'id d'une recette du carnet.
- Si "nouvelle" : "recette" = un objet recette avec les champs : "titre", "duree_minutes" (nombre|null), "type_plat" (un parmi "aperitif","entree","plat","accompagnement","dessert","petit_dejeuner","boisson","sauce_base"), "tags" (sous-ensemble de "vegetarien","vegan","riche_proteines","leger","gourmand","faible_glucides","sans_gluten","sans_lactose","rapide","conservation"), "nombre_personnes" (nombre), "calories_par_portion","proteines_g","glucides_g","lipides_g" (estimations par portion), "ingredients" (liste de { "nom" au singulier, "quantite" nombre|null, "unite" "g"|"ml"|"piece"|null }), "etapes" (liste de chaînes).`

/** Sérialise une recette du carnet pour le prompt (« id → titre (type · tags) »). */
function ligneRecette(r: PropositionRecette): string {
  const meta = [r.type_plat, ...(r.tags ?? [])].filter(Boolean).join(" · ")
  return `- "${r.id}" → ${r.titre}${meta ? ` (${meta})` : ""}`
}

/** Construit le message UTILISATEUR : contraintes + carnet + cases libres. */
export function construireMessageProposition(params: {
  contraintes: string
  ctx: PropositionContext
}): string {
  const { contraintes, ctx } = params
  const carnet =
    ctx.recettes.length > 0
      ? ctx.recettes.map(ligneRecette).join("\n")
      : "(carnet vide — propose des nouvelles recettes)"
  const cases =
    ctx.casesLibres.length > 0
      ? ctx.casesLibres
          .map((c) => `- ${c.label} → date "${c.date}", creneau "${c.creneau}"`)
          .join("\n")
      : "(aucune case libre)"
  const demande = contraintes.trim() || "un menu équilibré et varié pour la semaine"

  return `Contraintes : ${demande}

Recettes DÉJÀ dans le carnet (réutilise-les en priorité, référence par id) :
${carnet}

Créneaux LIBRES à remplir (ne place que sur ceux-ci) :
${cases}`
}

/**
 * Parse défensivement la réponse d'Opus vers une liste de {@link
 * PropositionPlacement} validés :
 *   - la case (date + créneau) doit être une case LIBRE fournie (sinon rejetée) ;
 *   - au plus un placement par case (le premier gagne) ;
 *   - `existante` : `recipe_id` validé contre le carnet (jamais halluciné) ;
 *   - `nouvelle` : recette coercée via {@link coerceRecette} (bornes §10, clé §5).
 *
 * @throws PropositionParseError si la réponse n'est pas un objet JSON exploitable.
 */
export function parseProposition(
  rawText: string,
  ctx: PropositionContext,
): PropositionPlacement[] {
  const bloc = extraireBlocJson(rawText)
  let data: unknown
  try {
    data = JSON.parse(bloc)
  } catch {
    throw new PropositionParseError("Réponse IA non JSON.", rawText)
  }
  if (!data || typeof data !== "object") {
    throw new PropositionParseError("Réponse IA non objet.", rawText)
  }

  const rawPlacements = Array.isArray((data as Record<string, unknown>).placements)
    ? ((data as Record<string, unknown>).placements as unknown[])
    : []

  // Index des cases libres (clé « date|creneau » → label) et des recettes du carnet.
  const casesParCle = new Map(
    ctx.casesLibres.map((c) => [`${c.date}|${c.creneau}`, c]),
  )
  const recettesById = new Map(ctx.recettes.map((r) => [r.id, r]))

  const placements: PropositionPlacement[] = []
  const dejaPlace = new Set<string>()

  for (const raw of rawPlacements) {
    if (!raw || typeof raw !== "object") continue
    const o = raw as Record<string, unknown>
    const date = typeof o.date === "string" ? o.date : ""
    const creneau = o.creneau === "diner" ? "diner" : o.creneau === "dejeuner" ? "dejeuner" : null
    if (!creneau) continue
    const cle = `${date}|${creneau}`
    const caseLibre = casesParCle.get(cle)
    // Case inconnue / déjà occupée / déjà remplie par cette proposition → ignorée.
    if (!caseLibre || dejaPlace.has(cle)) continue

    if (o.type === "existante") {
      const recipeId = typeof o.recipe_id === "string" ? o.recipe_id : ""
      const recette = recettesById.get(recipeId)
      if (!recette) continue // id halluciné → ignoré
      placements.push({
        date,
        creneau,
        label: caseLibre.label,
        kind: "existante",
        recipe_id: recipeId,
        titre: recette.titre,
      })
      dejaPlace.add(cle)
    } else if (o.type === "nouvelle") {
      if (!o.recette || typeof o.recette !== "object") continue
      const recette = coerceRecette(o.recette as Record<string, unknown>)
      if (recette.ingredients.length === 0) continue // recette vide → inutile
      placements.push({
        date,
        creneau,
        label: caseLibre.label,
        kind: "nouvelle",
        recette,
      })
      dejaPlace.add(cle)
    }
  }

  return placements
}
