/**
 * Devine le rayon d'un produit à partir de son nom — V1, **sans IA**.
 *
 * Principe : une petite table `mot-clé → catégorie`. On normalise le nom saisi
 * (minuscules, accents retirés, pluriels simples gommés) puis on cherche une
 * correspondance. Les mots-clés composés (« pomme de terre », « papier
 * toilette ») sont testés en premier pour primer sur leurs mots isolés.
 *
 * La fonction renvoie le **nom** d'une des 12 catégories par défaut (PRD §5.2),
 * ou {@link FALLBACK_CATEGORY} (« Autre ») si rien ne correspond. Le rapprochement
 * avec l'`id` réel du rayon — qui a pu être renommé par le couple — se fait côté
 * appelant, par recherche insensible à la casse.
 */

/** Catégorie retenue quand aucun mot-clé ne correspond. */
export const FALLBACK_CATEGORY = "Autre"

/** Minuscule + suppression des accents, pour un appariement tolérant. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les diacritiques (accents)
    .toLowerCase()
    // Ligatures françaises non décomposées par NFD : « œuf » → « oeuf », « bœuf »
    // → « boeuf », sans quoi ces mots-clés courants échapperaient à la table.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .trim()
}

/**
 * Mots-clés (au singulier, sans accent) → nom de catégorie par défaut.
 * Volontairement concis en V1 ; à enrichir au fil de l'usage réel.
 */
const KEYWORD_TO_CATEGORY: Record<string, string> = {
  // Fruits & Légumes
  pomme: "Fruits & Légumes",
  "pomme de terre": "Fruits & Légumes",
  patate: "Fruits & Légumes",
  banane: "Fruits & Légumes",
  tomate: "Fruits & Légumes",
  salade: "Fruits & Légumes",
  laitue: "Fruits & Légumes",
  carotte: "Fruits & Légumes",
  courgette: "Fruits & Légumes",
  poireau: "Fruits & Légumes",
  oignon: "Fruits & Légumes",
  ail: "Fruits & Légumes",
  fraise: "Fruits & Légumes",
  citron: "Fruits & Légumes",
  orange: "Fruits & Légumes",
  poire: "Fruits & Légumes",
  raisin: "Fruits & Légumes",
  concombre: "Fruits & Légumes",
  champignon: "Fruits & Légumes",
  brocoli: "Fruits & Légumes",
  epinard: "Fruits & Légumes",
  avocat: "Fruits & Légumes",

  // Viande & Poisson
  poulet: "Viande & Poisson",
  boeuf: "Viande & Poisson",
  porc: "Viande & Poisson",
  steak: "Viande & Poisson",
  jambon: "Viande & Poisson",
  saucisse: "Viande & Poisson",
  lardon: "Viande & Poisson",
  viande: "Viande & Poisson",
  escalope: "Viande & Poisson",
  dinde: "Viande & Poisson",
  poisson: "Viande & Poisson",
  saumon: "Viande & Poisson",
  thon: "Viande & Poisson",
  crevette: "Viande & Poisson",

  // Crémerie & Œufs
  lait: "Crémerie & Œufs",
  yaourt: "Crémerie & Œufs",
  beurre: "Crémerie & Œufs",
  oeuf: "Crémerie & Œufs",
  creme: "Crémerie & Œufs",
  fromage: "Crémerie & Œufs",
  mozzarella: "Crémerie & Œufs",
  emmental: "Crémerie & Œufs",
  comte: "Crémerie & Œufs",
  skyr: "Crémerie & Œufs",

  // Boulangerie
  pain: "Boulangerie",
  "pain de mie": "Boulangerie",
  baguette: "Boulangerie",
  croissant: "Boulangerie",
  brioche: "Boulangerie",

  // Surgelés
  surgele: "Surgelés",
  glace: "Surgelés",
  frite: "Surgelés",
  glacon: "Surgelés",

  // Épicerie
  riz: "Épicerie",
  pate: "Épicerie",
  farine: "Épicerie",
  sucre: "Épicerie",
  sel: "Épicerie",
  huile: "Épicerie",
  vinaigre: "Épicerie",
  cafe: "Épicerie",
  the: "Épicerie",
  conserve: "Épicerie",
  sauce: "Épicerie",
  ketchup: "Épicerie",
  mayonnaise: "Épicerie",
  moutarde: "Épicerie",
  biscuit: "Épicerie",
  chocolat: "Épicerie",
  cereale: "Épicerie",
  miel: "Épicerie",
  confiture: "Épicerie",
  epice: "Épicerie",

  // Boissons
  eau: "Boissons",
  jus: "Boissons",
  soda: "Boissons",
  biere: "Boissons",
  vin: "Boissons",
  coca: "Boissons",
  limonade: "Boissons",
  sirop: "Boissons",
  boisson: "Boissons",

  // Hygiène
  savon: "Hygiène",
  shampoing: "Hygiène",
  dentifrice: "Hygiène",
  "gel douche": "Hygiène",
  "brosse a dents": "Hygiène",
  deodorant: "Hygiène",
  coton: "Hygiène",
  rasoir: "Hygiène",
  "papier toilette": "Hygiène",
  mouchoir: "Hygiène",

  // Entretien
  lessive: "Entretien",
  eponge: "Entretien",
  javel: "Entretien",
  "liquide vaisselle": "Entretien",
  nettoyant: "Entretien",
  "sac poubelle": "Entretien",
  "essuie-tout": "Entretien",
  adoucissant: "Entretien",
  desinfectant: "Entretien",
  balai: "Entretien",

  // Papeterie
  cahier: "Papeterie",
  stylo: "Papeterie",
  papier: "Papeterie",
  enveloppe: "Papeterie",
  timbre: "Papeterie",
  crayon: "Papeterie",
  classeur: "Papeterie",

  // Bricolage
  vis: "Bricolage",
  clou: "Bricolage",
  peinture: "Bricolage",
  ampoule: "Bricolage",
  pile: "Bricolage",
  colle: "Bricolage",
  scotch: "Bricolage",

  // Jardinage
  terreau: "Jardinage",
  graine: "Jardinage",
  plante: "Jardinage",
  engrais: "Jardinage",
}

// Mots-clés composés (avec espace) — testés avant les mots isolés.
const COMPOUND_KEYWORDS = Object.keys(KEYWORD_TO_CATEGORY).filter((k) =>
  k.includes(" "),
)

/**
 * Renvoie le nom de catégorie deviné pour `name`, ou « Autre » par défaut.
 *
 * @example guessCategory("Lessive")        // "Entretien"
 * @example guessCategory("Lait demi-écrémé") // "Crémerie & Œufs"
 * @example guessCategory("Tomates cerises") // "Fruits & Légumes"
 * @example guessCategory("Bougie parfumée") // "Autre"
 */
export function guessCategory(name: string): string {
  const normalized = normalize(name)
  if (!normalized) return FALLBACK_CATEGORY

  // 1. Mots-clés composés : présence de la séquence complète.
  for (const keyword of COMPOUND_KEYWORDS) {
    if (normalized.includes(keyword)) return KEYWORD_TO_CATEGORY[keyword]
  }

  // 2. Mots isolés (avec dé-pluralisation simple : tomates → tomate).
  const words = new Set<string>()
  for (const word of normalized.split(/\s+/)) {
    words.add(word)
    if (word.length > 3) words.add(word.replace(/[sx]$/, ""))
  }

  for (const word of words) {
    const category = KEYWORD_TO_CATEGORY[word]
    if (category) return category
  }

  return FALLBACK_CATEGORY
}
