/**
 * Petits formateurs d'affichage des recettes (durée, quantité d'ingrédient),
 * partagés par la liste (§7.6) et la fiche détaillée. Logique pure, sans React :
 * une seule source de vérité pour « 25 min », « 1 h 15 » ou « 2 pièces ».
 */
import { LABELS_UNITE } from "@/lib/recipes/labels"
import type { Unite } from "@/lib/recipes/extraction"
import type { OperationFusion, QuantiteBase } from "@/lib/recipes/fusion"

/** Durée en minutes → libellé court (« 25 min », « 1 h », « 1 h 15 »). */
export function formatDuree(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const reste = m % 60
  return reste === 0 ? `${h} h` : `${h} h ${reste.toString().padStart(2, "0")}`
}

/**
 * Quantité + unité d'un ingrédient → libellé lisible. `null/null` → « au goût ».
 * Pluralise « pièce » au-delà de 1 ; g/ml restent invariables.
 */
export function formatQuantite(
  quantite: number | null,
  unite: Unite | null,
): string {
  if (quantite === null) return "au goût"
  // Nombre « propre » : entier sans décimale superflue (200, 1.5).
  const n = Number.isInteger(quantite) ? String(quantite) : String(quantite)
  if (unite === null) return n
  if (unite === "piece") return `${n} ${quantite > 1 ? "pièces" : "pièce"}`
  return `${n} ${LABELS_UNITE[unite]}`
}

/**
 * Quantité de base d'un ingrédient ajustée par le nombre de personnes (§8.2) →
 * libellé lisible. `ratio` = N choisi / nombre_personnes de base ; on multiplie
 * la quantité avant de la formater. « au goût » (`null`) n'est jamais mis à
 * l'échelle. L'arrondi à 2 décimales évite les « 1.3333 pièce » disgracieux —
 * le stockage à l'ajout, lui, reste exact (cf. addRecipeIngredientsToList).
 */
export function formatQuantiteAjustee(
  quantite: number | null,
  unite: Unite | null,
  ratio: number,
): string {
  if (quantite === null) return "au goût"
  return formatQuantite(Math.round(quantite * ratio * 100) / 100, unite)
}

/** Arrondit à au plus 2 décimales, sans zéros superflus (« 1.5 », « 2 »). */
function nombrePropre(v: number): string {
  return String(Math.round(v * 100) / 100)
}

/**
 * Une quantité de base → libellé lisible, avec reformatage « joli » du §6 :
 * ≥ 1000 g → kg, ≥ 1000 ml → l. Le stockage reste en unité de base ; ceci ne
 * touche que l'affichage. `unite: null` → le nombre seul.
 */
export function formatQuantiteBase(q: QuantiteBase): string {
  if (q.unite === "g" && q.valeur >= 1000) return `${nombrePropre(q.valeur / 1000)} kg`
  if (q.unite === "ml" && q.valeur >= 1000) return `${nombrePropre(q.valeur / 1000)} l`
  if (q.unite === null) return nombrePropre(q.valeur)
  return formatQuantite(q.valeur, q.unite)
}

/**
 * Plusieurs quantités non additionnables d'une même ligne → « 1 pièce + 200 g ».
 * Tableau vide → « (sans quantité) » (cas d'un ingrédient « au goût » isolé).
 */
export function formatQuantites(quantites: QuantiteBase[]): string {
  if (quantites.length === 0) return "(sans quantité)"
  return quantites.map(formatQuantiteBase).join(" + ")
}

/** Suffixe d'unité pour le récap d'addition (« g », « ml », « pièces », ou rien). */
function suffixeUnite(unite: Unite | null, pluriel: boolean): string {
  if (unite === null) return ""
  if (unite === "piece") return ` ${pluriel ? "pièces" : "pièce"}`
  return ` ${LABELS_UNITE[unite]}`
}

/**
 * Membre droit du récap de fusion (§6 « Transparence »), à préfixer du nom du
 * produit par l'appelant (« tomate : » + ce texte) :
 *   - au goût          → « au goût »
 *   - addition         → « 200 + 300 = 500 g »
 *   - nouvelle (seule) → « 300 g »
 *   - incompatible     → « 1 pièce + 200 g » (la ligne entière, gardée à part)
 *
 * `quantites` est le tableau résultant : il sert à distinguer une 1re saisie
 * (une seule entrée) d'un ajout incompatible (plusieurs entrées sur la ligne).
 */
export function decrireFusion(
  operation: OperationFusion,
  quantites: QuantiteBase[],
): string {
  if (operation.kind === "au_gout") return "au goût"

  if (operation.kind === "additionnee") {
    const u = suffixeUnite(operation.unite, operation.apres > 1)
    return `${nombrePropre(operation.avant)} + ${nombrePropre(operation.ajoutee)} = ${nombrePropre(operation.apres)}${u}`
  }

  // « nouvelle » : seule sur la ligne → la quantité ; sinon → toute la ligne
  // (unité incompatible conservée à côté de l'existante).
  return quantites.length > 1
    ? formatQuantites(quantites)
    : formatQuantiteBase({ valeur: operation.valeur, unite: operation.unite })
}
