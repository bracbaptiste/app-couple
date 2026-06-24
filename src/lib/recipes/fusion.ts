/**
 * Logique de fusion des quantités (PRD_recettes §6 + §8.1).
 *
 * Module PUR : aucune dépendance React ni base de données. Il ne sait rien des
 * `library_items` ni des clés `nom_normalise` — le rapprochement « est-ce le
 * même produit ? » se fait EN AMONT, par {@link normaliserNom} (règle d'or §5),
 * jamais ici. Ce module ne s'occupe QUE d'une chose : étant donné les quantités
 * déjà présentes sur une ligne et une quantité à ajouter, appliquer les règles
 * d'unités du §6 et produire le tableau résultant + un récap de ce qui s'est
 * passé (« tomate : 200 + 300 = 500 g »).
 *
 * Stockage (cf. `list_items.quantities` jsonb) : un TABLEAU de quantités
 * **non additionnables** sur la même ligne, en unités de base (g, ml, piece).
 * Les multiples (kg, l) sont ramenés à la base AVANT d'entrer dans le tableau.
 */

import { UNITES, type Unite } from "@/lib/recipes/extraction"

/**
 * Une quantité stockée sur une ligne, en unité de base. `unite` peut être `null`
 * pour une quantité « sans unité » (ex. « 2 » œufs comptés sans `piece`) : deux
 * entrées `null` s'additionnent entre elles, mais jamais avec des g/ml/piece.
 */
export type QuantiteBase = {
  valeur: number
  unite: Unite | null
}

/**
 * Unité telle qu'elle peut arriver en entrée : la base (g/ml/piece/null) plus les
 * multiples convertibles (kg, l). On ne stocke jamais kg/l : ils sont réduits.
 */
export type UniteSaisie = Unite | "kg" | "l" | null

/** Quantité à fusionner dans une ligne. `quantite: null` ⇒ ingrédient « au goût ». */
export type Ajout = {
  quantite: number | null
  unite: UniteSaisie
}

/**
 * Décrit ce que la fusion a fait pour l'unité concernée, afin d'afficher un
 * récap transparent (§6 « Transparence » : jamais de fusion silencieuse).
 *   - `au_gout`     : ingrédient sans quantité, ajouté une seule fois.
 *   - `nouvelle`    : aucune quantité compatible n'existait → nouvelle entrée
 *                     (1re fois ce produit, OU unité incompatible gardée à part).
 *   - `additionnee` : une quantité de même unité existait → on a additionné.
 */
export type OperationFusion =
  | { kind: "au_gout" }
  | { kind: "nouvelle"; valeur: number; unite: Unite | null }
  | {
      kind: "additionnee"
      avant: number
      ajoutee: number
      apres: number
      unite: Unite | null
    }

/** Résultat d'une fusion : le tableau à stocker + le récap de l'opération. */
export type ResultatFusion = {
  quantites: QuantiteBase[]
  operation: OperationFusion
}

/**
 * Parse défensivement la valeur jsonb `list_items.quantities` vers `QuantiteBase[]`.
 * Source de vérité unique du décodage (réutilisée par l'action de fusion ET par
 * l'affichage de la liste de courses). Entrée invalide / partielle → ignorée.
 */
export function parseQuantites(raw: unknown): QuantiteBase[] {
  if (!Array.isArray(raw)) return []
  const out: QuantiteBase[] = []
  for (const e of raw) {
    if (!e || typeof e !== "object") continue
    const o = e as Record<string, unknown>
    const valeur =
      typeof o.valeur === "number" && Number.isFinite(o.valeur) ? o.valeur : null
    if (valeur === null) continue
    const unite: Unite | null = (UNITES as readonly string[]).includes(
      o.unite as string,
    )
      ? (o.unite as Unite)
      : null
    out.push({ valeur, unite })
  }
  return out
}

/**
 * Ramène une quantité saisie à son unité de base (§6) :
 *   - kg → g (×1000), l → ml (×1000) ;
 *   - g / ml / piece / null : inchangées.
 */
function versBase(valeur: number, unite: UniteSaisie): QuantiteBase {
  if (unite === "kg") return { valeur: valeur * 1000, unite: "g" }
  if (unite === "l") return { valeur: valeur * 1000, unite: "ml" }
  return { valeur, unite }
}

/**
 * Fusionne une quantité dans les quantités déjà présentes sur une ligne, selon
 * les règles d'unités du §6 :
 *
 * | Cas | Action |
 * |---|---|
 * | Même unité (g+g, ml+ml, piece+piece) | addition |
 * | Convertible (kg+g, l+ml) | ramené en base puis addition |
 * | Incompatible (1 piece + 200 g) | les deux gardées sur la même ligne |
 * | « au goût » (quantite null) | aucune quantité, une seule occurrence |
 *
 * Fonction pure : `existantes` n'est jamais muté, un nouveau tableau est renvoyé.
 */
export function fusionnerQuantite(
  existantes: QuantiteBase[],
  ajout: Ajout,
): ResultatFusion {
  // Copie défensive : on ne mute jamais l'entrée.
  const quantites = existantes.map((q) => ({ ...q }))

  // « Au goût » : pas de quantité à porter. La ligne existe une seule fois, le
  // tableau de quantités reste tel quel (souvent vide).
  if (ajout.quantite === null) {
    return { quantites, operation: { kind: "au_gout" } }
  }

  const { valeur, unite } = versBase(ajout.quantite, ajout.unite)

  // Cherche une quantité de MÊME unité de base (seul cas additionnable).
  const cible = quantites.find((q) => q.unite === unite)

  if (cible) {
    const avant = cible.valeur
    cible.valeur = avant + valeur
    return {
      quantites,
      operation: {
        kind: "additionnee",
        avant,
        ajoutee: valeur,
        apres: cible.valeur,
        unite,
      },
    }
  }

  // Aucune unité compatible : nouvelle entrée (1re fois, ou incompatible gardée
  // à part — « oignon : 1 pièce + 200 g »).
  quantites.push({ valeur, unite })
  return {
    quantites,
    operation: { kind: "nouvelle", valeur, unite },
  }
}
