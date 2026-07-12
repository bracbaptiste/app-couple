/**
 * Devine le rayon d'un produit à partir de son nom — V1, **sans IA**.
 *
 * Principe : une table `mot-clé → catégorie`. On normalise le nom saisi
 * (minuscules, accents retirés, pluriels simples gommés) puis on cherche une
 * correspondance. Les mots-clés composés (« pomme de terre », « papier
 * toilette ») sont testés en premier pour primer sur leurs mots isolés, et sont
 * tolérants au pluriel (« haricots verts » reconnaît « haricot vert »).
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
 *
 * Attention aux homographes : on évite d'ajouter des mots trop génériques
 * (« bar », « sole », « lieu », « pince »…) qui mal-classeraient des libellés
 * anodins. En cas d'ambiguïté fraîche/sèche, on tranche via un mot-clé composé
 * (« haricot vert » vs « haricot rouge »).
 */
const KEYWORD_TO_CATEGORY: Record<string, string> = {
  // Fruits & Légumes
  pomme: "Fruits & Légumes",
  "pomme de terre": "Fruits & Légumes",
  patate: "Fruits & Légumes",
  "patate douce": "Fruits & Légumes",
  banane: "Fruits & Légumes",
  tomate: "Fruits & Légumes",
  salade: "Fruits & Légumes",
  laitue: "Fruits & Légumes",
  roquette: "Fruits & Légumes",
  mache: "Fruits & Légumes",
  carotte: "Fruits & Légumes",
  courgette: "Fruits & Légumes",
  courge: "Fruits & Légumes",
  potiron: "Fruits & Légumes",
  potimarron: "Fruits & Légumes",
  aubergine: "Fruits & Légumes",
  poivron: "Fruits & Légumes",
  poireau: "Fruits & Légumes",
  oignon: "Fruits & Légumes",
  echalote: "Fruits & Légumes",
  ail: "Fruits & Légumes",
  betterave: "Fruits & Légumes",
  radis: "Fruits & Légumes",
  navet: "Fruits & Légumes",
  panais: "Fruits & Légumes",
  fenouil: "Fruits & Légumes",
  celeri: "Fruits & Légumes",
  chou: "Fruits & Légumes",
  "chou-fleur": "Fruits & Légumes",
  "chou fleur": "Fruits & Légumes",
  brocoli: "Fruits & Légumes",
  epinard: "Fruits & Légumes",
  blette: "Fruits & Légumes",
  endive: "Fruits & Légumes",
  "haricot vert": "Fruits & Légumes",
  "petit pois": "Fruits & Légumes",
  mais: "Fruits & Légumes",
  concombre: "Fruits & Légumes",
  champignon: "Fruits & Légumes",
  avocat: "Fruits & Légumes",
  fraise: "Fruits & Légumes",
  framboise: "Fruits & Légumes",
  myrtille: "Fruits & Légumes",
  groseille: "Fruits & Légumes",
  cerise: "Fruits & Légumes",
  citron: "Fruits & Légumes",
  orange: "Fruits & Légumes",
  clementine: "Fruits & Légumes",
  mandarine: "Fruits & Légumes",
  pamplemousse: "Fruits & Légumes",
  poire: "Fruits & Légumes",
  peche: "Fruits & Légumes",
  abricot: "Fruits & Légumes",
  raisin: "Fruits & Légumes",
  kiwi: "Fruits & Légumes",
  ananas: "Fruits & Légumes",
  mangue: "Fruits & Légumes",
  melon: "Fruits & Légumes",
  pasteque: "Fruits & Légumes",
  gingembre: "Fruits & Légumes",
  persil: "Fruits & Légumes",
  basilic: "Fruits & Légumes",
  coriandre: "Fruits & Légumes",
  menthe: "Fruits & Légumes",

  // Viande & Poisson
  poulet: "Viande & Poisson",
  boeuf: "Viande & Poisson",
  porc: "Viande & Poisson",
  veau: "Viande & Poisson",
  agneau: "Viande & Poisson",
  steak: "Viande & Poisson",
  roti: "Viande & Poisson",
  gigot: "Viande & Poisson",
  escalope: "Viande & Poisson",
  "cordon bleu": "Viande & Poisson",
  jambon: "Viande & Poisson",
  bacon: "Viande & Poisson",
  saucisse: "Viande & Poisson",
  saucisson: "Viande & Poisson",
  merguez: "Viande & Poisson",
  chipolata: "Viande & Poisson",
  lardon: "Viande & Poisson",
  viande: "Viande & Poisson",
  dinde: "Viande & Poisson",
  nugget: "Viande & Poisson",
  rillette: "Viande & Poisson",
  poisson: "Viande & Poisson",
  saumon: "Viande & Poisson",
  thon: "Viande & Poisson",
  cabillaud: "Viande & Poisson",
  colin: "Viande & Poisson",
  merlu: "Viande & Poisson",
  haddock: "Viande & Poisson",
  truite: "Viande & Poisson",
  sardine: "Viande & Poisson",
  maquereau: "Viande & Poisson",
  anchois: "Viande & Poisson",
  crevette: "Viande & Poisson",
  gambas: "Viande & Poisson",
  moule: "Viande & Poisson",
  crabe: "Viande & Poisson",
  surimi: "Viande & Poisson",

  // Crémerie & Œufs
  lait: "Crémerie & Œufs",
  yaourt: "Crémerie & Œufs",
  beurre: "Crémerie & Œufs",
  margarine: "Crémerie & Œufs",
  oeuf: "Crémerie & Œufs",
  creme: "Crémerie & Œufs",
  "creme fraiche": "Crémerie & Œufs",
  fromage: "Crémerie & Œufs",
  "fromage blanc": "Crémerie & Œufs",
  mozzarella: "Crémerie & Œufs",
  emmental: "Crémerie & Œufs",
  comte: "Crémerie & Œufs",
  chevre: "Crémerie & Œufs",
  feta: "Crémerie & Œufs",
  parmesan: "Crémerie & Œufs",
  gruyere: "Crémerie & Œufs",
  ricotta: "Crémerie & Œufs",
  mascarpone: "Crémerie & Œufs",
  camembert: "Crémerie & Œufs",
  raclette: "Crémerie & Œufs",
  "petit suisse": "Crémerie & Œufs",
  skyr: "Crémerie & Œufs",

  // Boulangerie
  pain: "Boulangerie",
  "pain de mie": "Boulangerie",
  "pain de campagne": "Boulangerie",
  "pain complet": "Boulangerie",
  baguette: "Boulangerie",
  croissant: "Boulangerie",
  "pain au chocolat": "Boulangerie",
  chocolatine: "Boulangerie",
  viennoiserie: "Boulangerie",
  brioche: "Boulangerie",
  biscotte: "Boulangerie",

  // Surgelés
  surgele: "Surgelés",
  glace: "Surgelés",
  sorbet: "Surgelés",
  esquimau: "Surgelés",
  frite: "Surgelés",
  glacon: "Surgelés",

  // Épicerie
  riz: "Épicerie",
  pate: "Épicerie",
  spaghetti: "Épicerie",
  macaroni: "Épicerie",
  tagliatelle: "Épicerie",
  ravioli: "Épicerie",
  lasagne: "Épicerie",
  nouille: "Épicerie",
  lentille: "Épicerie",
  "pois chiche": "Épicerie",
  "haricot rouge": "Épicerie",
  "haricot blanc": "Épicerie",
  quinoa: "Épicerie",
  semoule: "Épicerie",
  boulgour: "Épicerie",
  couscous: "Épicerie",
  polenta: "Épicerie",
  farine: "Épicerie",
  maizena: "Épicerie",
  levure: "Épicerie",
  chapelure: "Épicerie",
  sucre: "Épicerie",
  sel: "Épicerie",
  poivre: "Épicerie",
  huile: "Épicerie",
  vinaigre: "Épicerie",
  cafe: "Épicerie",
  the: "Épicerie",
  conserve: "Épicerie",
  bouillon: "Épicerie",
  sauce: "Épicerie",
  "sauce tomate": "Épicerie",
  "concentre de tomate": "Épicerie",
  ketchup: "Épicerie",
  mayonnaise: "Épicerie",
  moutarde: "Épicerie",
  pesto: "Épicerie",
  olive: "Épicerie",
  cornichon: "Épicerie",
  "lait de coco": "Épicerie",
  compote: "Épicerie",
  puree: "Épicerie",
  biscuit: "Épicerie",
  gateau: "Épicerie",
  cracker: "Épicerie",
  chips: "Épicerie",
  bonbon: "Épicerie",
  chocolat: "Épicerie",
  "pate a tartiner": "Épicerie",
  cereale: "Épicerie",
  muesli: "Épicerie",
  miel: "Épicerie",
  confiture: "Épicerie",
  epice: "Épicerie",
  curry: "Épicerie",
  paprika: "Épicerie",
  cumin: "Épicerie",
  cannelle: "Épicerie",
  amande: "Épicerie",
  noisette: "Épicerie",
  cacahuete: "Épicerie",
  pistache: "Épicerie",
  pruneau: "Épicerie",
  datte: "Épicerie",

  // Boissons
  eau: "Boissons",
  jus: "Boissons",
  soda: "Boissons",
  biere: "Boissons",
  vin: "Boissons",
  cidre: "Boissons",
  champagne: "Boissons",
  coca: "Boissons",
  limonade: "Boissons",
  sirop: "Boissons",
  smoothie: "Boissons",
  tisane: "Boissons",
  infusion: "Boissons",
  whisky: "Boissons",
  rhum: "Boissons",
  vodka: "Boissons",
  boisson: "Boissons",

  // Hygiène
  savon: "Hygiène",
  shampoing: "Hygiène",
  "apres shampoing": "Hygiène",
  dentifrice: "Hygiène",
  "bain de bouche": "Hygiène",
  "gel douche": "Hygiène",
  "brosse a dents": "Hygiène",
  "fil dentaire": "Hygiène",
  deodorant: "Hygiène",
  parfum: "Hygiène",
  coton: "Hygiène",
  "coton tige": "Hygiène",
  rasoir: "Hygiène",
  "mousse a raser": "Hygiène",
  "papier toilette": "Hygiène",
  "papier hygienique": "Hygiène",
  mouchoir: "Hygiène",
  lingette: "Hygiène",
  tampon: "Hygiène",
  "serviette hygienique": "Hygiène",
  "creme solaire": "Hygiène",
  "creme hydratante": "Hygiène",
  pansement: "Hygiène",
  preservatif: "Hygiène",
  peigne: "Hygiène",

  // Entretien
  lessive: "Entretien",
  adoucissant: "Entretien",
  eponge: "Entretien",
  javel: "Entretien",
  "liquide vaisselle": "Entretien",
  "tablette lave-vaisselle": "Entretien",
  nettoyant: "Entretien",
  detergent: "Entretien",
  desinfectant: "Entretien",
  "sac poubelle": "Entretien",
  "essuie-tout": "Entretien",
  sopalin: "Entretien",
  "film alimentaire": "Entretien",
  "papier aluminium": "Entretien",
  "papier cuisson": "Entretien",
  serpillere: "Entretien",
  balai: "Entretien",

  // Papeterie
  cahier: "Papeterie",
  carnet: "Papeterie",
  stylo: "Papeterie",
  crayon: "Papeterie",
  feutre: "Papeterie",
  marqueur: "Papeterie",
  surligneur: "Papeterie",
  gomme: "Papeterie",
  regle: "Papeterie",
  papier: "Papeterie",
  enveloppe: "Papeterie",
  timbre: "Papeterie",
  classeur: "Papeterie",
  agrafe: "Papeterie",
  trombone: "Papeterie",
  ciseaux: "Papeterie",
  "post-it": "Papeterie",

  // Bricolage
  vis: "Bricolage",
  clou: "Bricolage",
  cheville: "Bricolage",
  boulon: "Bricolage",
  ecrou: "Bricolage",
  peinture: "Bricolage",
  ampoule: "Bricolage",
  pile: "Bricolage",
  colle: "Bricolage",
  silicone: "Bricolage",
  scotch: "Bricolage",
  tournevis: "Bricolage",
  marteau: "Bricolage",
  "papier de verre": "Bricolage",

  // Jardinage
  terreau: "Jardinage",
  graine: "Jardinage",
  semence: "Jardinage",
  plante: "Jardinage",
  engrais: "Jardinage",
  compost: "Jardinage",
  "pot de fleur": "Jardinage",
  arrosoir: "Jardinage",
  tuteur: "Jardinage",
  secateur: "Jardinage",
  gazon: "Jardinage",
}

// Mots-clés composés (avec espace) — testés avant les mots isolés.
const COMPOUND_KEYWORDS = Object.keys(KEYWORD_TO_CATEGORY).filter((k) =>
  k.includes(" "),
)

/**
 * Décompose un nom normalisé en un ensemble de mots, en ajoutant pour chacun sa
 * forme dé-pluralisée (« tomates » → { tomates, tomate }). On garde les deux
 * formes, ce qui rend l'appariement — mots isolés ET composés — tolérant au
 * pluriel simple (s / x).
 */
function toWordSet(normalized: string): Set<string> {
  const words = new Set<string>()
  for (const word of normalized.split(/\s+/)) {
    if (!word) continue
    words.add(word)
    if (word.length > 3) words.add(word.replace(/[sx]$/, ""))
  }
  return words
}

/**
 * Renvoie le nom de catégorie deviné pour `name`, ou « Autre » par défaut.
 *
 * @example guessCategory("Lessive")           // "Entretien"
 * @example guessCategory("Lait demi-écrémé")  // "Crémerie & Œufs"
 * @example guessCategory("Lentilles vertes")  // "Épicerie"
 * @example guessCategory("Haricots verts")    // "Fruits & Légumes"
 * @example guessCategory("Bougie parfumée")   // "Autre"
 */
export function guessCategory(name: string): string {
  const normalized = normalize(name)
  if (!normalized) return FALLBACK_CATEGORY

  const words = toWordSet(normalized)

  // 1. Mots-clés composés : tous leurs mots doivent être présents. Testés avant
  //    les mots isolés pour primer (« papier toilette » → Hygiène, pas
  //    « papier » → Papeterie ; « haricot vert » → Fruits, pas « Autre »).
  for (const keyword of COMPOUND_KEYWORDS) {
    const parts = keyword.split(" ")
    if (parts.every((part) => words.has(part))) {
      return KEYWORD_TO_CATEGORY[keyword]
    }
  }

  // 2. Mots isolés (formes dé-pluralisées incluses).
  for (const word of words) {
    const category = KEYWORD_TO_CATEGORY[word]
    if (category) return category
  }

  return FALLBACK_CATEGORY
}
