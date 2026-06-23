/**
 * Libellés français affichés pour la taxonomie des recettes (PRD_recettes §10).
 *
 * Les CLÉS (jeu fermé) vivent dans {@link lib/recipes/extraction} — on ne les
 * redéfinit pas ici, on les habille seulement pour l'affichage. Une seule source
 * de vérité par concept : les constantes côté extraction restent l'autorité, ces
 * tables ne font que les traduire à l'écran.
 */
import type { TypePlat, Tag, Unite } from "@/lib/recipes/extraction"

/** Axe 1 — libellé affiché de chaque type de plat (§10). */
export const LABELS_TYPE_PLAT: Record<TypePlat, string> = {
  aperitif: "Apéritif / À grignoter",
  entree: "Entrée",
  plat: "Plat principal",
  accompagnement: "Accompagnement",
  dessert: "Dessert",
  petit_dejeuner: "Petit-déjeuner",
  boisson: "Boisson / Smoothie",
  sauce_base: "Sauce / Base",
}

/** Axe 2 — libellé affiché de chaque étiquette (§10). */
export const LABELS_TAG: Record<Tag, string> = {
  vegetarien: "Végétarien",
  vegan: "Végan",
  riche_proteines: "Riche en protéines",
  leger: "Léger",
  gourmand: "Gourmand / Riche",
  faible_glucides: "Faible en glucides",
  sans_gluten: "Sans gluten",
  sans_lactose: "Sans lactose",
  rapide: "Rapide (≤ 30 min)",
  conservation: "Se conserve bien",
}

/** Libellé court de chaque unité (le `<select>` ingrédient). `null` = « au goût ». */
export const LABELS_UNITE: Record<Unite, string> = {
  g: "g",
  ml: "ml",
  piece: "pièce",
}
