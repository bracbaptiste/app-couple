/**
 * LA FONDATION du module Recettes (PRD_recettes §5).
 *
 * `normaliserNom()` transforme un texte libre en une **clé de comparaison**
 * standard, déterministe et instantanée. Elle ne sert QU'À comparer : on ne
 * l'affiche jamais. Tant que la bibliothèque, la liste de courses et les
 * ingrédients de recette passent par la même fonction, deux saisies du même
 * produit produisent la même clé et se reconnaissent — c'est ce qui garantit
 * l'absence de doublons, sans IA.
 *
 * ⚠️ À ne PAS confondre avec {@link ../normalize-item-name normalizeItemName},
 * qui est le normaliseur d'AFFICHAGE (conserve accents et pluriels, met une
 * majuscule). Ici on fait l'inverse : on appauvrit volontairement le texte pour
 * en faire une clé robuste.
 *
 * @example normaliserNom("Tomates")      // "tomate"
 * @example normaliserNom("de la Crème")  // "creme"
 * @example normaliserNom("Poireaux")     // "poireau"
 * @example normaliserNom("  OIGNON  ")   // "oignon"
 */

/**
 * Mots de liaison retirés en début de chaîne (PRD §5, étape 4). Ordre important :
 * les formes les plus longues d'abord, pour que « de la » l'emporte sur « de ».
 */
const LIAISONS = [
  "de la ",
  "de l'",
  "du ",
  "des ",
  "de ",
  "d'",
  "le ",
  "la ",
  "les ",
  "l'",
  "un ",
  "une ",
]

export function normaliserNom(raw: unknown): string {
  // 1. trim + minuscules.
  let s = String(raw ?? "").trim().toLowerCase()
  if (!s) return ""

  // 2. retirer les accents (normalisation Unicode NFD puis suppression des
  //    diacritiques combinatoires). `\p{Diacritic}` évite d'écrire les marques
  //    combinantes en clair dans le source.
  s = s.normalize("NFD").replace(/\p{Diacritic}/gu, "")

  // 3. réduire les espaces multiples à un seul.
  s = s.replace(/\s+/g, " ")

  // 4. retirer un mot de liaison en début de chaîne (une seule passe : on ne
  //    retire pas en cascade — « la laitue » → « laitue », pas au-delà).
  for (const liaison of LIAISONS) {
    if (s.startsWith(liaison)) {
      s = s.slice(liaison.length)
      break
    }
  }

  // 5. mettre au singulier : si le mot se termine par « s » ou « x » et fait
  //    plus de 3 lettres, retirer la dernière lettre. La clé n'a pas à être
  //    « jolie » : seule la cohérence compte (PRD §5, règles d'or).
  if (s.length > 3 && (s.endsWith("s") || s.endsWith("x"))) {
    s = s.slice(0, -1)
  }

  // 6. trim final (la liaison retirée peut laisser un espace résiduel).
  return s.trim()
}
