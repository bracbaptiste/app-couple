/**
 * LA FONDATION du pilotage vocal V4 — le routeur d'intentions (PRD_V4 §5).
 *
 * Ce module GÉNÉRALISE le pattern `voice-parsing.ts` (V2.1) : une phrase dictée
 * devient une **liste d'actions structurées** (§5.3), et non plus une seule
 * tâche. Comme lui, il ne fait AUCUN appel réseau — il porte le prompt système
 * (catalogue d'intentions + contexte), les types de sortie et le parsing
 * défensif. Il est donc testable sans clé API. L'appel à Claude Haiku 4.5 vit
 * dans la route serveur (`src/app/api/brain-command/route.ts`).
 *
 * Règle d'or (§5, décision actée §2.12) : on ne fait JAMAIS confiance à l'IA.
 * - Les ids (liste, profil, recette) ne sont acceptés que s'ils figurent dans le
 *   contexte RELU côté serveur sous RLS ; tout id halluciné est ramené à `null`.
 * - Les noms d'articles repassent TOUJOURS par {@link normaliserNom} côté serveur
 *   (règle d'or V3) — jamais la clé venue de l'IA.
 * - Les dates relatives sont résolues sur le fuseau Europe/Paris côté serveur.
 * - La résolution d'ambiguïté de liste (§5.4) est DÉTERMINISTE et pilotée par le
 *   serveur : l'IA ne fabrique jamais la clarification elle-même.
 *
 * Portée de CE module : uniquement les intents de **Phase 2** (§5.2) —
 * `courses.*`, `bibliotheque.ajouter_article`, `taches.ajouter`/`cocher`,
 * `navigation.ouvrir`, `inconnu`. Les intents Recettes/Planning/Consultation
 * (Phase 6) ne sont pas encore routés.
 */

import { extraireBlocJson, UNITES, type Unite } from "@/lib/recipes/extraction"
import {
  coerceRecurrence,
  estDateIsoValide,
  type JourCourant,
  type ParsedRecurrence,
  type ProfileContext,
} from "@/lib/tasks/voice-parsing"
import { normaliserNom } from "@/lib/utils/normalize-name-key"

/** Nombre maximal d'actions dans un lot multi-intentions (§5.4.1). */
export const MAX_ACTIONS = 5

/** Réponse du Cerveau à une demande de suppression vocale (§5.2). */
export const MESSAGE_SUPPRESSION =
  "Pour supprimer, passe par l'écran — je ne supprime rien à la voix."

/** Outils navigables (§2.1) — jeu fermé, aligné sur les jetons de l'éventail. */
export const OUTILS = [
  "listes",
  "bibliotheque",
  "recettes",
  "planning",
  "profil",
] as const
export type Outil = (typeof OUTILS)[number]

/* ------------------------------------------------------------------ contexte */

/** Une liste (courses ou to-do) relue en base sous RLS. */
export interface ListeContext {
  id: string
  name: string
}

/** Un article de la bibliothèque, avec sa clé normalisée (§5, résolution noms). */
export interface LibraryItemContext {
  id: string
  name: string
  nom_normalise: string
}

/** Une recette du couple, réduite à ce dont le routeur a besoin. */
export interface RecetteContext {
  id: string
  titre: string
}

/**
 * Écran courant — SEULE information transmise par le client (§5.1). Sert
 * uniquement aux défauts d'ambiguïté (§5.4.4.2) ; jamais à contourner la RLS.
 */
export interface EcranContext {
  route?: string | null
  liste_id?: string | null
}

/** Contexte complet relu côté serveur et injecté dans le prompt + la validation. */
export interface BrainContext {
  /** Listes de courses (`kind = 'courses'`). */
  coursesLists: ListeContext[]
  /** Listes to-do (`kind = 'todo'`). */
  todoLists: ListeContext[]
  /** Les deux profils du couple. */
  profiles: ProfileContext[]
  /** Articles de la bibliothèque (résolution des noms). */
  libraryItems: LibraryItemContext[]
  /** Recettes du couple (id + titre). */
  recettes: RecetteContext[]
  /** Écran courant fourni par le client (défauts d'ambiguïté). */
  ecran?: EcranContext | null
}

/* -------------------------------------------------------------------- sortie */

/** Article à AJOUTER : nom + clé recalculée serveur + id bibliothèque résolu. */
export interface ArticleAjout {
  nom: string
  /** Clé de comparaison recalculée serveur ({@link normaliserNom}). */
  nom_normalise: string
  /** Id d'un article bibliothèque existant si la clé correspond, sinon null. */
  library_item_id: string | null
  quantite: number | null
  unite: Unite | null
}

/** Article RÉFÉRENCÉ (cocher/décocher, ajout biblio) : pas de quantité. */
export interface ArticleRef {
  nom: string
  nom_normalise: string
  library_item_id: string | null
}

/** Cible d'une navigation (§5.2, `navigation.ouvrir`). */
export type NavCible =
  | { type: "outil"; outil: Outil }
  | { type: "liste"; liste_id: string }
  | { type: "recette"; recipe_id: string }

/** Une action validée et résolue (§5.3). Union discriminée par `intent`. */
export type BrainAction =
  | {
      intent: "courses.ajouter_article"
      liste_id: string
      articles: ArticleAjout[]
    }
  | { intent: "courses.cocher_article"; liste_id: string; article: ArticleRef }
  | { intent: "courses.decocher_article"; liste_id: string; article: ArticleRef }
  | { intent: "bibliotheque.ajouter_article"; articles: ArticleRef[] }
  | {
      intent: "taches.ajouter"
      titre: string
      due_date: string | null
      recurrence: ParsedRecurrence | null
      assigne_profile_id: string | null
      liste_id: string | null
    }
  | {
      intent: "taches.cocher"
      titre: string
      /** Clé normalisée pour retrouver la tâche côté exécution. */
      titre_normalise: string
      liste_id: string | null
    }
  | { intent: "navigation.ouvrir"; cible: NavCible }
  | { intent: "inconnu"; raison: "suppression" | null }

/** Une option de clarification de liste (§5.3). */
export interface ClarificationOption {
  label: string
  liste_id: string
}

/** Demande de clarification (§5.3) — générée côté serveur, jamais par l'IA. */
export interface Clarification {
  question: string
  options: ClarificationOption[]
}

/** Résultat du routeur : soit des actions, soit une clarification (exclusif). */
export interface BrainCommandResult {
  actions: BrainAction[]
  clarification: Clarification | null
}

/** Niveau de confirmation graduée d'une action (§6). */
export type NiveauAction = 1 | 2

/**
 * Niveau (§6) d'une action exécutable : `taches.ajouter` = niveau 2 (écran de
 * validation V2.1 avant écriture) ; tout le reste du catalogue Phase 2 = niveau 1
 * (exécution directe + tampon). `inconnu` n'est pas exécutable et n'est pas classé
 * ici (traité en amont : suppression / incompréhension).
 */
export function niveauAction(a: BrainAction): NiveauAction {
  return a.intent === "taches.ajouter" ? 2 : 1
}

/** Erreur dédiée : la réponse de l'IA n'est pas un JSON exploitable. */
export class BrainParseError extends Error {
  constructor(
    message: string,
    /** Texte brut renvoyé par l'IA, pour debug (jamais la clé API). */
    public readonly raw: string,
  ) {
    super(message)
    this.name = "BrainParseError"
  }
}

/* --------------------------------------------------------- prompt système */

/** Date du jour résolue serveur (réexport du type partagé avec V2.1). */
export type { JourCourant }

/** Formate une liste `nom → "id"` pour le prompt, ou une mention « aucune ». */
function listerContexte(
  items: { id: string; label: string }[],
  vide: string,
): string {
  return items.length > 0
    ? items.map((i) => `- ${i.label} → "${i.id}"`).join("\n")
    : vide
}

/**
 * Construit le prompt SYSTÈME du routeur : cadre + catalogue d'intentions
 * (Phase 2 uniquement) + contexte relu + date du jour Europe/Paris. Le contexte
 * permet à l'IA de proposer des ids ; la validation finale reste serveur
 * ({@link parseBrainCommand}).
 */
export function construireBrainSystemPrompt(params: {
  jour: JourCourant
  ctx: BrainContext
  /**
   * Biais optionnel (§0.5, migration V2.1) : `"task"` quand l'appel vient du
   * point d'entrée « ajouter une tâche » (mic de la to-do). Le routeur reste le
   * même, mais on privilégie explicitement les intents `taches.*` pour préserver
   * le comportement historique (une dictée de tâche → une tâche, jamais courses).
   */
  hint?: "task" | null
}): string {
  const { jour, ctx, hint } = params

  const coursesTexte = listerContexte(
    ctx.coursesLists.map((l) => ({ id: l.id, label: l.name })),
    "(aucune liste de courses)",
  )
  const todoTexte = listerContexte(
    ctx.todoLists.map((l) => ({ id: l.id, label: l.name })),
    "(aucune liste de tâches)",
  )
  const profilsTexte = listerContexte(
    ctx.profiles.map((p) => ({ id: p.id, label: `${p.display_name} (${p.color})` })),
    "(aucun profil)",
  )
  const recettesTexte = listerContexte(
    ctx.recettes.map((r) => ({ id: r.id, label: r.titre })),
    "(aucune recette)",
  )
  const biblioTexte =
    ctx.libraryItems.length > 0
      ? ctx.libraryItems.map((i) => `- ${i.name}`).join("\n")
      : "(bibliothèque vide)"

  const ecranTexte = ctx.ecran?.route
    ? `Écran courant : ${ctx.ecran.route}${
        ctx.ecran.liste_id ? ` (liste ouverte "${ctx.ecran.liste_id}")` : ""
      }`
    : "Écran courant : inconnu"

  // Migration V2.1 (§0.5) : quand l'entrée est le mic « ajouter une tâche », on
  // ancre l'interprétation sur les tâches pour ne pas régresser (une dictée de
  // tâche ne doit jamais basculer en courses.*).
  const hintTexte =
    hint === "task"
      ? `\n\nINDICATION FORTE : l'utilisateur AJOUTE UNE TÂCHE (to-do). Utilise "taches.ajouter" (ou "taches.cocher" s'il s'agit de cocher une tâche existante). N'utilise NI "courses.*" NI "bibliotheque.*" NI "navigation.*".`
      : ""

  return `Tu es le routeur d'intentions vocales d'une application de gestion du foyer pour un couple (2 personnes). Tu transformes une phrase dictée en français en une LISTE d'actions structurées. Tu raisonnes sur le sens de la phrase, jamais sur des mots-clés isolés.

CONTEXTE (relu côté serveur — utilise UNIQUEMENT ces ids, n'en invente jamais)
- Date d'aujourd'hui : ${jour.label} (${jour.iso}). Résous toutes les dates relatives par rapport à cette date, fuseau Europe/Paris.
- ${ecranTexte}
- Listes de COURSES (nom → id) :
${coursesTexte}
- Listes de TÂCHES / to-do (nom → id) :
${todoTexte}
- Personnes du couple (nom → id) :
${profilsTexte}
- Recettes (titre → id) :
${recettesTexte}
- Articles déjà connus en bibliothèque (pour t'aider à bien orthographier ; NE limite PAS les articles possibles à cette liste) :
${biblioTexte}

CATALOGUE D'INTENTIONS (n'utilise QUE ces intents ; tout le reste = "inconnu")
- "courses.ajouter_article" : ajouter un ou plusieurs articles à une liste de courses. Champs : "liste_id" (id d'une liste de COURSES ou null si non précisée), "articles" (tableau de { "nom": string, "quantite": number|null, "unite": "g"|"ml"|"piece"|null }).
- "courses.cocher_article" : cocher un article. Champs : "liste_id" (ou null), "article" ({ "nom": string }).
- "courses.decocher_article" : décocher un article. Mêmes champs que cocher.
- "bibliotheque.ajouter_article" : ajouter un article au garde-manger / à la bibliothèque. Champs : "articles" (tableau de { "nom": string }).
- "taches.ajouter" : créer une tâche. Champs : "titre" (string, sans les indications de date/récurrence/personne déjà extraites), "due_date" ("YYYY-MM-DD" ou null), "recurrence" ({ "type": "daily"|"weekly"|"monthly", "interval": number>=1, "weekday": number|null (0=lundi … 6=dimanche, seulement pour weekly), "day_of_month": number|null (1–31, seulement pour monthly) } ou null), "assigne_profile_id" (id d'une personne ou null), "liste_id" (id d'une liste de TÂCHES ou null).
- "taches.cocher" : cocher/terminer une tâche existante. Champs : "titre" (string, l'intitulé de la tâche), "liste_id" (ou null).
- "navigation.ouvrir" : ouvrir un écran. Champ "cible" : soit { "type": "outil", "outil": "listes"|"bibliotheque"|"recettes"|"planning"|"profil" }, soit { "type": "liste", "liste_id": id }, soit { "type": "recette", "recipe_id": id }.
- "inconnu" : tout le reste. Si la demande est une SUPPRESSION (supprimer/vider une liste, supprimer une tâche, un article, une recette…), renvoie une action { "intent": "inconnu", "raison": "suppression" }. Sinon { "intent": "inconnu", "raison": null }.

RÈGLES
- Une phrase peut contenir plusieurs actions (maximum ${MAX_ACTIONS}), dans l'ordre où elles sont dites.
- Ne mets un "liste_id" que si la phrase DÉSIGNE explicitement une liste par son nom (correspondance tolérante à la casse et aux accents). Sinon laisse "liste_id" à null : le serveur choisira ou demandera. NE DEVINE JAMAIS une liste par défaut.
- Ne génère JAMAIS toi-même de clarification : renvoie toujours "clarification": null. Si tu hésites sur la liste, mets "liste_id" à null.
- N'invente aucun id : n'utilise que les ids listés ci-dessus. Un nom absent du contexte → id correspondant à null.
- Les noms d'articles/tâches : écris-les au singulier, sans article (« tomate », pas « des tomates »).
- Il n'existe AUCUNE intention de suppression : ne fabrique jamais d'action qui supprime. Une demande de suppression → "inconnu" avec "raison": "suppression".

SORTIE
Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises Markdown, sans backticks. Forme exacte :
{"actions": [ ...objets action... ], "clarification": null}${hintTexte}`
}

/* ------------------------------------------------------ helpers de coercition */

/** Coerce une valeur en nombre fini strictement positif, sinon `null`. */
function quantiteOuNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null
}

/** Coerce une unité vers le jeu fermé `UNITES`, sinon `null`. */
function uniteOuNull(v: unknown): Unite | null {
  return typeof v === "string" && (UNITES as readonly string[]).includes(v)
    ? (v as Unite)
    : null
}

/**
 * Résout le `library_item_id` d'un nom : clé recalculée serveur ({@link
 * normaliserNom}), puis correspondance avec un article bibliothèque existant.
 */
function normaliserArticle(
  nomBrut: unknown,
  libParCle: Map<string, string>,
): { nom: string; nom_normalise: string; library_item_id: string | null } | null {
  const nom = typeof nomBrut === "string" ? nomBrut.trim() : ""
  if (!nom) return null
  const nom_normalise = normaliserNom(nom)
  if (!nom_normalise) return null
  return {
    nom,
    nom_normalise,
    library_item_id: libParCle.get(nom_normalise) ?? null,
  }
}

/** Coerce un tableau d'articles à ajouter (avec quantité/unité). */
function coerceArticlesAjout(
  raw: unknown,
  libParCle: Map<string, string>,
): ArticleAjout[] {
  if (!Array.isArray(raw)) return []
  const out: ArticleAjout[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const base = normaliserArticle(o.nom, libParCle)
    if (!base) continue
    out.push({
      ...base,
      quantite: quantiteOuNull(o.quantite),
      unite: uniteOuNull(o.unite),
    })
  }
  return out
}

/** Coerce un tableau d'articles référencés (sans quantité). */
function coerceArticlesRef(
  raw: unknown,
  libParCle: Map<string, string>,
): ArticleRef[] {
  if (!Array.isArray(raw)) return []
  const out: ArticleRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const base = normaliserArticle((item as Record<string, unknown>).nom, libParCle)
    if (base) out.push(base)
  }
  return out
}

/** Coerce un article unique référencé (cocher/décocher). */
function coerceArticleRef(
  raw: unknown,
  libParCle: Map<string, string>,
): ArticleRef | null {
  if (!raw || typeof raw !== "object") return null
  return normaliserArticle((raw as Record<string, unknown>).nom, libParCle)
}

/** Coerce/valide une cible de navigation contre le contexte serveur. */
function coerceNavCible(
  raw: unknown,
  refs: { listeIds: Set<string>; recipeIds: Set<string> },
): NavCible | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  if (o.type === "outil") {
    return typeof o.outil === "string" &&
      (OUTILS as readonly string[]).includes(o.outil)
      ? { type: "outil", outil: o.outil as Outil }
      : null
  }
  if (o.type === "liste") {
    return typeof o.liste_id === "string" && refs.listeIds.has(o.liste_id)
      ? { type: "liste", liste_id: o.liste_id }
      : null
  }
  if (o.type === "recette") {
    return typeof o.recipe_id === "string" && refs.recipeIds.has(o.recipe_id)
      ? { type: "recette", recipe_id: o.recipe_id }
      : null
  }
  return null
}

/**
 * Résout la liste d'une action courses (§5.4.4), dans l'ordre :
 *   1. la liste nommée (id proposé par l'IA, validé contre `lists`) ;
 *   2. sinon la liste ouverte à l'écran, si elle est de ce type ;
 *   3. sinon la SEULE liste de ce type si le couple n'en a qu'une ;
 *   4. sinon `null` → le serveur demandera une clarification.
 * `lists` est déjà filtré au bon `kind`, donc l'appartenance à `lists` garantit
 * le bon type (garde-fou §5.4.4.2).
 */
function resoudreListe(
  lists: ListeContext[],
  proposedId: unknown,
  ecran: EcranContext | null | undefined,
): string | null {
  const ids = new Set(lists.map((l) => l.id))
  if (typeof proposedId === "string" && ids.has(proposedId)) return proposedId
  const screenId = ecran?.liste_id
  if (typeof screenId === "string" && ids.has(screenId)) return screenId
  if (lists.length === 1) return lists[0].id
  return null
}

/** Fabrique une clarification déterministe « Dans quelle liste ? » (§5.3). */
function clarifierListe(lists: ListeContext[]): Clarification {
  return {
    question: "Dans quelle liste ?",
    options: lists.map((l) => ({ label: l.name, liste_id: l.id })),
  }
}

/* -------------------------------------------------------------- parsing */

/**
 * Parse défensivement la réponse texte de Haiku vers {@link BrainCommandResult}.
 *
 * - retrait des fences + isolation de l'objet `{…}` + `JSON.parse` sous try/catch ;
 * - chaque action est validée/coercée contre les jeux fermés et le contexte
 *   serveur (ids réels, noms renormalisés, dates/récurrences bornées) ;
 * - résolution de liste déterministe (§5.4.4) ; la première action courses non
 *   résoluble court-circuite le lot en une {@link Clarification} (schéma §5.3
 *   exclusif : soit des actions, soit une clarification) ;
 * - lot borné à {@link MAX_ACTIONS} (§5.4.1).
 *
 * @throws BrainParseError si la réponse n'est pas un objet JSON exploitable.
 */
export function parseBrainCommand(
  rawText: string,
  ctx: BrainContext,
): BrainCommandResult {
  const bloc = extraireBlocJson(rawText)

  let data: unknown
  try {
    data = JSON.parse(bloc)
  } catch {
    throw new BrainParseError("La réponse de l'IA n'est pas un JSON valide.", rawText)
  }
  if (!data || typeof data !== "object") {
    throw new BrainParseError("La réponse de l'IA n'est pas un objet JSON.", rawText)
  }

  const o = data as Record<string, unknown>
  const rawActions = Array.isArray(o.actions) ? o.actions : []

  // Index de résolution (ids réels + clé bibliothèque → id).
  const libParCle = new Map(ctx.libraryItems.map((i) => [i.nom_normalise, i.id]))
  const profileIds = new Set(ctx.profiles.map((p) => p.id))
  const todoIds = new Set(ctx.todoLists.map((l) => l.id))
  const recipeIds = new Set(ctx.recettes.map((r) => r.id))
  const listeIds = new Set(
    [...ctx.coursesLists, ...ctx.todoLists].map((l) => l.id),
  )

  const actions: BrainAction[] = []

  for (const raw of rawActions) {
    if (actions.length >= MAX_ACTIONS) break
    if (!raw || typeof raw !== "object") continue
    const a = raw as Record<string, unknown>

    switch (a.intent) {
      case "courses.ajouter_article": {
        const articles = coerceArticlesAjout(a.articles, libParCle)
        if (articles.length === 0) continue
        const liste_id = resoudreListe(ctx.coursesLists, a.liste_id, ctx.ecran)
        // Action à conséquence : jamais de défaut arbitraire (§5.4.5).
        if (!liste_id) {
          return { actions: [], clarification: clarifierListe(ctx.coursesLists) }
        }
        actions.push({ intent: "courses.ajouter_article", liste_id, articles })
        break
      }
      case "courses.cocher_article":
      case "courses.decocher_article": {
        const article = coerceArticleRef(a.article, libParCle)
        if (!article) continue
        const liste_id = resoudreListe(ctx.coursesLists, a.liste_id, ctx.ecran)
        if (!liste_id) {
          return { actions: [], clarification: clarifierListe(ctx.coursesLists) }
        }
        actions.push({ intent: a.intent, liste_id, article })
        break
      }
      case "bibliotheque.ajouter_article": {
        const articles = coerceArticlesRef(a.articles, libParCle)
        if (articles.length === 0) continue
        actions.push({ intent: "bibliotheque.ajouter_article", articles })
        break
      }
      case "taches.ajouter": {
        const titre = typeof a.titre === "string" ? a.titre.trim() : ""
        if (!titre) continue
        actions.push({
          intent: "taches.ajouter",
          titre,
          due_date: estDateIsoValide(a.due_date) ? a.due_date : null,
          recurrence: coerceRecurrence(a.recurrence),
          assigne_profile_id:
            typeof a.assigne_profile_id === "string" &&
            profileIds.has(a.assigne_profile_id)
              ? a.assigne_profile_id
              : null,
          liste_id:
            typeof a.liste_id === "string" && todoIds.has(a.liste_id)
              ? a.liste_id
              : null,
        })
        break
      }
      case "taches.cocher": {
        const titre = typeof a.titre === "string" ? a.titre.trim() : ""
        if (!titre) continue
        actions.push({
          intent: "taches.cocher",
          titre,
          titre_normalise: normaliserNom(titre),
          liste_id:
            typeof a.liste_id === "string" && todoIds.has(a.liste_id)
              ? a.liste_id
              : null,
        })
        break
      }
      case "navigation.ouvrir": {
        const cible = coerceNavCible(a.cible, { listeIds, recipeIds })
        if (!cible) continue
        actions.push({ intent: "navigation.ouvrir", cible })
        break
      }
      case "inconnu": {
        actions.push({
          intent: "inconnu",
          raison: a.raison === "suppression" ? "suppression" : null,
        })
        break
      }
      default:
        continue
    }
  }

  return { actions, clarification: null }
}
