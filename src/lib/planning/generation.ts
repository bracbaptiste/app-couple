/**
 * Cœur PUR de la génération de la liste de courses de la semaine (PRD_V4 §8.5).
 *
 * Module strictement pur : aucune dépendance React ni base de données. Il ne
 * connaît ni `meal_slots`, ni `list_items`, ni la BDD — la lecture des repas, la
 * résolution des articles et l'écriture vivent dans l'action serveur
 * (`src/app/(app)/planning/actions.ts`).
 *
 * Il ne fait qu'UNE chose : étant donné les BESOINS de la semaine (les
 * contributions de chaque repas-recette, déjà ajustées au nombre de personnes —
 * ratio §8.2 appliqué EN AMONT par l'action) regroupés par clé `normaliserNom`,
 * les REPLIER contre l'état courant de la liste via {@link fusionnerQuantite}
 * (règles d'unités §6 V3, réutilisées telles quelles). Il produit, par ligne, le
 * résultat + un récap transparent étape par étape (« jamais de fusion
 * silencieuse », §6). La distinction créée / fusionnée sert la provenance (§8.5.6)
 * et le retrait ciblé du prompt 11 (§8.6).
 */

import {
  fusionnerQuantite,
  type Ajout,
  type OperationFusion,
  type QuantiteBase,
  type UniteSaisie,
} from "@/lib/recipes/fusion"

/**
 * La contribution d'UN repas-recette à un ingrédient. `quantite` est DÉJÀ
 * ajustée au nombre de personnes choisi (ratio §8.2 appliqué par l'action) ;
 * `null` = ingrédient « au goût » (jamais mis à l'échelle, §8.2). `unite` peut
 * arriver en kg/l : {@link fusionnerQuantite} la ramène en base.
 */
export type Contribution = {
  /** Case de planning d'origine (pour la provenance §8.5.6). */
  mealSlotId: string
  /** Titre de la recette du repas (« Ratatouille »), pour le récap. */
  repas: string
  /** Jour + créneau lisible (« lun. soir »), pour le récap. */
  jour: string
  quantite: number | null
  unite: UniteSaisie
}

/**
 * Toutes les contributions de la semaine pour un même produit (même clé
 * `normaliserNom`). `nom` = premier nom affiché rencontré, sert de libellé de
 * ligne (la clé, elle, reste interne §5).
 */
export type BesoinIngredient = {
  cle: string
  nom: string
  contributions: Contribution[]
}

/** Une entrée à plat avant regroupement (produite par l'action, une par ingrédient de repas). */
export type EntreeBesoin = {
  cle: string
  nom: string
  contribution: Contribution
}

/**
 * Regroupe les entrées à plat de la semaine par clé normalisée, en préservant
 * l'ordre de première apparition (récap lisible) et le premier nom affiché.
 */
export function grouperBesoins(entrees: EntreeBesoin[]): BesoinIngredient[] {
  const parCle = new Map<string, BesoinIngredient>()
  for (const e of entrees) {
    const existant = parCle.get(e.cle)
    if (existant) {
      existant.contributions.push(e.contribution)
    } else {
      parCle.set(e.cle, {
        cle: e.cle,
        nom: e.nom,
        contributions: [e.contribution],
      })
    }
  }
  return [...parCle.values()]
}

/** Une étape du repliement : ce qu'un repas a ajouté, et l'état résultant de la ligne. */
export type EtapeFusion = {
  contribution: Contribution
  operation: OperationFusion
  /** Quantités de la ligne APRÈS cette étape (pour un récap étape par étape). */
  quantitesApres: QuantiteBase[]
}

/**
 * Résultat de génération pour UNE ligne de liste.
 *   - `statut = "cree"`      : la ligne n'existait pas comme ligne active → la
 *     génération la crée (provenance `origine = 'generation'`).
 *   - `statut = "fusionne"`  : une ligne active existait déjà → les quantités y
 *     sont fusionnées (provenance `origine = 'fusion'`, « à ajuster
 *     manuellement » au retrait §8.6).
 */
export type LigneGeneree = {
  cle: string
  nom: string
  statut: "cree" | "fusionne"
  /** État de la ligne AVANT génération (`[]` si créée). */
  quantitesInitiales: QuantiteBase[]
  /** État de la ligne APRÈS repliement de toutes les contributions. */
  quantitesFinales: QuantiteBase[]
  etapes: EtapeFusion[]
}

/**
 * Replie toutes les contributions d'un besoin contre les quantités déjà
 * présentes sur la ligne (`existantes`), via {@link fusionnerQuantite} (§6). Pur :
 * `existantes` n'est jamais muté.
 *
 * `lignePreexistante` = une ligne ACTIVE (non cochée) existait déjà pour ce
 * produit avant la génération. C'est lui — pas le fait que `existantes` soit vide —
 * qui décide `cree` vs `fusionne` : une ligne active sans quantité (produit
 * ajouté « à la main » sans quantité) reste une fusion dans un article déjà
 * présent (§8.6 « l'article existait déjà avant génération »).
 */
export function foldBesoin(
  besoin: BesoinIngredient,
  existantes: QuantiteBase[],
  lignePreexistante: boolean,
): LigneGeneree {
  let courantes: QuantiteBase[] = existantes.map((q) => ({ ...q }))
  const etapes: EtapeFusion[] = []

  for (const contribution of besoin.contributions) {
    const ajout: Ajout = {
      quantite: contribution.quantite,
      unite: contribution.unite,
    }
    const { quantites, operation } = fusionnerQuantite(courantes, ajout)
    courantes = quantites
    etapes.push({ contribution, operation, quantitesApres: quantites })
  }

  return {
    cle: besoin.cle,
    nom: besoin.nom,
    statut: lignePreexistante ? "fusionne" : "cree",
    quantitesInitiales: existantes,
    quantitesFinales: courantes,
    etapes,
  }
}

/**
 * Sort d'un article engendré par un repas qu'on supprime / remplace (§8.6). C'est
 * le GARDE-FOU du retrait, isolé ici en fonction PURE (testable, sans BDD) :
 *   - `conserver` — l'article est COCHÉ : jamais touché, jamais proposé au retrait
 *     (règle absolue §8.6). Prime sur tout le reste.
 *   - `retirable`  — ligne CRÉÉE par la génération (`origine = 'generation'`) ET
 *     dont ce repas est la SEULE source : elle peut être proposée au retrait entier.
 *   - `ajuster`    — tout le reste (ligne `fusion`née dans un article préexistant,
 *     OU créée mais partagée avec un autre repas) : jamais retirée entièrement,
 *     seulement signalée « quantité à ajuster manuellement ».
 *
 * `sourceCount` = nombre de repas distincts reliés à cette ligne (provenance) :
 * > 1 ⇒ l'article « sert aussi à un autre repas » (§8.6), donc non retirable.
 */
export type CategorieRetrait = "retirable" | "ajuster" | "conserver"

export function categoriserRetrait(
  origine: "generation" | "fusion",
  checked: boolean,
  sourceCount: number,
): CategorieRetrait {
  if (checked) return "conserver"
  if (origine === "generation" && sourceCount <= 1) return "retirable"
  return "ajuster"
}
