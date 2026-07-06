"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { type Json } from "@/types/database"
import { addDays, parseDateKey, startOfWeek, toDateKey } from "@/lib/planning/week"
import { normaliserNom } from "@/lib/utils/normalize-name-key"
import { guessCategory } from "@/lib/utils/guess-category"
import { UNITES, type Unite } from "@/lib/recipes/extraction"
import {
  parseQuantites,
  type QuantiteBase,
} from "@/lib/recipes/fusion"
import { decrireFusion } from "@/lib/recipes/format"
import {
  categoriserRetrait,
  foldBesoin,
  grouperBesoins,
  type EntreeBesoin,
  type LigneGeneree,
} from "@/lib/planning/generation"

/** Client Supabase serveur typé (inféré du helper, comme task-actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé aux handlers client. */
export type ActionResult = { ok: true } | { ok: false; error: string }

/** Longueur max d'un repas « texte libre » (« restes », « pizza surgelée »…). */
const TEXTE_MAX = 80

/** Les deux créneaux d'un jour (§8.1). */
const CRENEAUX = ["dejeuner", "diner"] as const
type Creneau = (typeof CRENEAUX)[number]

/**
 * Récupère l'utilisateur authentifié + son couple_id. Les Server Actions étant
 * appelables directement (POST), on ne se repose jamais sur l'UI pour
 * l'autorisation ; la RLS reste la barrière finale (même pattern task-actions).
 */
async function requireMembership(): Promise<{
  supabase: ServerClient
  userId: string
  coupleId: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .single()

  if (!profile?.couple_id) redirect("/onboarding")

  return { supabase, userId: user.id, coupleId: profile.couple_id }
}

/** Borne défensive : la clé date d'URL/formulaire est-elle un jour valide ? */
function isValidDateKey(dateKey: unknown): dateKey is string {
  return typeof dateKey === "string" && parseDateKey(dateKey) !== null
}

/** Borne défensive : le créneau reçu appartient-il au jeu fermé ? */
function isValidCreneau(creneau: unknown): creneau is Creneau {
  return CRENEAUX.includes(creneau as Creneau)
}

/* -------------------------------------------------------------------------- */
/*  Placement d'un repas sur une case (§8.2)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Source d'un repas (§8.2) : recette du carnet OU texte libre. La proposition IA
 * (§8.4) arrive en Phase 6 ; elle deviendra une recette normale (`type = recette`)
 * une fois validée, donc rien à prévoir de spécial ici.
 */
export type MealSource =
  | { kind: "recette"; recipeId: string }
  | { kind: "texte"; texte: string }

/**
 * Place (ou remplace) un repas sur une case (couple, jour, créneau). L'unicité
 * `(couple_id, date, creneau)` fait qu'on n'empile jamais deux repas sur le même
 * créneau : placer là où il y a déjà quelque chose REMPLACE (upsert, §8.1).
 *
 * Défense en profondeur : jour/créneau bornés au jeu fermé, et un `recipeId` n'est
 * accepté que s'il désigne une recette DU COUPLE courant (la RLS le garantit déjà,
 * on double la vérification côté action). Le CHECK `meal_slots_content_coherent`
 * garantit en base qu'exactement une des deux formes (recette / texte) est posée.
 *
 * NB : le retrait des articles engendrés par le repas REMPLACÉ (§8.6) ne se fait
 * jamais ici. Il passe par {@link previewMealRemoval} + {@link confirmMealRemoval}
 * (confirmation explicite niveau 3), qui posent le nouveau repas APRÈS le retrait
 * éventuel. `placeMeal` reste le placement « nu » (case vide, ou remplacement déjà
 * confirmé).
 */
export async function placeMeal(
  dateKey: string,
  creneau: string,
  source: MealSource,
): Promise<ActionResult> {
  if (!isValidDateKey(dateKey) || !isValidCreneau(creneau)) {
    return { ok: false, error: "Case de planning invalide." }
  }

  const { supabase, userId, coupleId } = await requireMembership()

  // Contenu selon la source, en respectant le CHECK de cohérence type ↔ contenu.
  let type: "recette" | "texte"
  let recipeId: string | null = null
  let texte: string | null = null

  if (source.kind === "recette") {
    // L'id de recette ne vient jamais d'un endroit de confiance : on vérifie
    // qu'il appartient bien au couple avant de le référencer (garde-fou §2.12).
    const { data: recipe } = await supabase
      .from("recipes")
      .select("id")
      .eq("id", source.recipeId)
      .eq("couple_id", coupleId)
      .is("deleted_at", null)
      .maybeSingle()
    if (!recipe) return { ok: false, error: "Recette introuvable." }
    type = "recette"
    recipeId = recipe.id
  } else {
    const clean = source.texte.trim().slice(0, TEXTE_MAX)
    if (!clean) return { ok: false, error: "Entre le repas (ex. « restes »)." }
    type = "texte"
    texte = clean
  }

  const { error } = await supabase.from("meal_slots").upsert(
    {
      couple_id: coupleId,
      date: dateKey,
      creneau,
      type,
      recipe_id: recipeId,
      texte,
      created_by: userId,
    },
    { onConflict: "couple_id,date,creneau" },
  )

  if (error) {
    return { ok: false, error: "Impossible de placer ce repas. Réessaie." }
  }

  revalidatePath("/planning")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Retrait d'un repas (case vidée)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Vide une case (retire le repas planifié). Filtré par `id` ET `couple_id` :
 * garde-fou global (jamais de DELETE sans filtre couple/id sur une table
 * multi-couples). La RLS empêcherait déjà de toucher la case d'un autre couple ;
 * le filtre explicite double la protection.
 */
export async function clearMeal(slotId: string): Promise<ActionResult> {
  const { supabase, coupleId } = await requireMembership()

  const { error } = await supabase
    .from("meal_slots")
    .delete()
    .eq("id", slotId)
    .eq("couple_id", coupleId)

  if (error) {
    return { ok: false, error: "Impossible de retirer ce repas. Réessaie." }
  }

  revalidatePath("/planning")
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Cochage d'une tâche depuis le planning (§8.3)                              */
/* -------------------------------------------------------------------------- */

/**
 * Coche / décoche une tâche affichée dans le planning (§8.3 : « cochable sur
 * place »). Même écriture que `toggleTask` de l'outil Listes (mémorise qui l'a
 * faite et quand), mais on borne d'abord la tâche à une to-do list DU COUPLE :
 * la tâche ne porte pas de `couple_id`, son rattachement dérive de la liste.
 *
 * Cocher une tâche récurrente déclenche en base la génération de l'occurrence
 * suivante (trigger `tasks_generate_next_occurrence`) : rien à faire ici, la
 * nouvelle ligne apparaîtra d'elle-même (Realtime + refresh).
 *
 * On revalide `/planning` ET la to-do list d'origine : les deux vues reflètent
 * le même état de la tâche.
 */
export async function togglePlanningTask(
  listId: string,
  taskId: string,
  done: boolean,
): Promise<ActionResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  // La liste appartient-elle au couple et est-elle bien une to-do ? (double RLS)
  const { data: list } = await supabase
    .from("lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .is("deleted_at", null)
    .maybeSingle()
  if (list?.kind !== "todo") return { ok: false, error: "Tâche introuvable." }

  const { error } = await supabase
    .from("tasks")
    .update({
      is_done: done,
      done_by: done ? userId : null,
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("list_id", listId)

  if (error) {
    return { ok: false, error: "Action impossible. Réessaie." }
  }

  revalidatePath("/planning")
  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

/* -------------------------------------------------------------------------- */
/*  Génération de la liste de courses de la semaine (§8.5)                      */
/* -------------------------------------------------------------------------- */

/** Libellé « jour + créneau » d'une case (« lun. midi », « mar. soir »). */
const CRENEAU_JOUR: Record<Creneau, string> = { dejeuner: "midi", diner: "soir" }
const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short" })
function labelJour(dateKey: string, creneau: Creneau): string {
  const d = parseDateKey(dateKey)
  const wd = d ? weekdayFmt.format(d).replace(".", "") : dateKey
  return `${wd} ${CRENEAU_JOUR[creneau]}`
}

/** Coerce un entier strictement positif (repli si invalide), cf. recipes/actions. */
function entierPositif(v: unknown, repli: number): number {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : repli
}

/* --- Types renvoyés au client (sérialisables) ----------------------------- */

/** Une ligne du récapitulatif de génération (créée ou fusionnée). */
export type GenerationLigneView = {
  /** Clé normalisée (§5) — identifie la ligne pour le retrait au récap (§8.5.5). */
  cle: string
  nom: string
  quantitesInitiales: QuantiteBase[]
  quantitesFinales: QuantiteBase[]
  /** Décompte transparent : ce que chaque repas apporte (§6). */
  detail: { jour: string; repas: string; texte: string }[]
}

/** Un repas non traité par la génération (§8.5.4), avec sa raison. */
export type RepasIgnoreView = {
  jour: string
  libelle: string
  raison: "texte" | "sans_ingredient" | "deja_genere"
}

/** Récapitulatif complet AVANT écriture (validation niveau 2, §6/§8.5.5). */
export type GenerationApercu = {
  listId: string
  listName: string
  cible: number
  creees: GenerationLigneView[]
  fusionnees: GenerationLigneView[]
  ignores: RepasIgnoreView[]
  /** Lignes à écrire (créées + fusionnées). 0 ⇒ rien à générer cette semaine. */
  aEcrire: number
}

export type PreviewWeekListResult =
  | { ok: true; apercu: GenerationApercu }
  | { ok: false; error: string }

export type CommitWeekListResult =
  | { ok: true; apercu: GenerationApercu }
  | { ok: false; error: string }

/**
 * Origine « Cerveau » d'une génération (§8.7) : quand la commande vient de la voix,
 * on JOURNALISE la génération dans le ticket de caisse (§7 — périmètre : commandes
 * du Cerveau uniquement ; la génération TACTILE, elle, n'y figure jamais). La
 * phrase dictée est journalisée telle quelle.
 */
export type BrainGenerationOrigin = { texteDicte: string }

type WeekCommitRow = {
  key: string
  createdListItem: boolean
  previousQuantities: QuantiteBase[]
  quantities: QuantiteBase[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseWeekCommitRows(raw: Json | null): WeekCommitRow[] {
  if (!Array.isArray(raw)) return []
  const rows: WeekCommitRow[] = []
  for (const item of raw) {
    const o = asRecord(item)
    if (!o || typeof o.key !== "string") continue
    rows.push({
      key: o.key,
      createdListItem: o.created_list_item === true,
      previousQuantities: parseQuantites(o.previous_quantities),
      quantities: parseQuantites(o.quantities),
    })
  }
  return rows
}

function parseTouchedListIds(raw: Json | null): string[] {
  const o = asRecord(raw)
  const ids = o?.touched_list_ids
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
}

/* --- Rassemblement des besoins (LECTURE SEULE, partagé preview/commit) ----- */

/** Un besoin agrégé + l'état courant de sa ligne cible (lu, jamais modifié). */
type BesoinRassemble = {
  besoin: ReturnType<typeof grouperBesoins>[number]
  /** Article de bibliothèque trouvé (null ⇒ à créer au commit). */
  libraryItemId: string | null
  usageCount: number | null
  /** Ligne de liste ACTIVE existante à mettre à jour (null ⇒ insert au commit). */
  listItemId: string | null
  existantes: QuantiteBase[]
  lignePreexistante: boolean
}

type Rassemblement = {
  list: { id: string; name: string }
  cible: number
  besoins: BesoinRassemble[]
  ignores: RepasIgnoreView[]
}

/**
 * Lit tout ce qu'il faut pour générer la liste de la semaine, SANS RIEN ÉCRIRE :
 * la liste cible, les repas-recette de la semaine affichée, leurs ingrédients
 * ajustés au nombre de personnes (ratio §8.2 recalculé serveur), agrégés par clé
 * `normaliserNom` (§5), et l'état courant de chaque ligne cible. Partagé par la
 * prévisualisation ET l'écriture : le commit RE-LIT tout (jamais le récap du
 * client), garantissant que ce qui est écrit correspond à l'état réel (§2.12).
 *
 * Garde-fou anti double-génération : un repas déjà relié à CETTE liste (table de
 * provenance) est exclu et signalé « déjà générée » — sinon une seconde
 * génération doublerait silencieusement les quantités (viole §6 « jamais de
 * fusion silencieuse »).
 */
async function rassemblerBesoins(
  supabase: ServerClient,
  coupleId: string,
  listId: string,
  personnes: number | undefined,
  weekStartKey: string,
): Promise<{ ok: true; data: Rassemblement } | { ok: false; error: string }> {
  // 1. Liste cible du couple, et bien une liste de courses ?
  const { data: list } = await supabase
    .from("lists")
    .select("id, name, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .is("deleted_at", null)
    .maybeSingle()
  if (!list) return { ok: false, error: "Liste introuvable." }
  if (list.kind === "todo") {
    return { ok: false, error: "Choisis une liste de courses." }
  }

  const cible = entierPositif(personnes, 2) // défaut 2 (§8.5.2)

  // 2. Bornes de la semaine affichée (normalisées au lundi, cf. la page).
  const parsed = parseDateKey(weekStartKey)
  if (!parsed) return { ok: false, error: "Semaine invalide." }
  const monday = startOfWeek(parsed)
  const mondayKey = toDateKey(monday)
  const sundayKey = toDateKey(addDays(monday, 6))

  // 3. Repas de la semaine.
  const { data: meals, error: mealsErr } = await supabase
    .from("meal_slots")
    .select("id, date, creneau, type, texte, recipe_id")
    .eq("couple_id", coupleId)
    .gte("date", mondayKey)
    .lte("date", sundayKey)
  if (mealsErr) return { ok: false, error: "Impossible de lire les repas." }

  const ignores: RepasIgnoreView[] = []
  const recetteMeals: {
    id: string
    date: string
    creneau: Creneau
    recipeId: string
  }[] = []

  for (const m of meals ?? []) {
    const creneau: Creneau = m.creneau === "diner" ? "diner" : "dejeuner"
    if (m.type === "texte") {
      // Repas texte libre : ne génère rien (§8.5.4).
      ignores.push({
        jour: labelJour(m.date, creneau),
        libelle: m.texte ?? "Texte libre",
        raison: "texte",
      })
    } else if (m.recipe_id) {
      recetteMeals.push({ id: m.id, date: m.date, creneau, recipeId: m.recipe_id })
    }
  }

  const recetteMealIds = recetteMeals.map((m) => m.id)
  const recipeIds = [...new Set(recetteMeals.map((m) => m.recipeId))]

  // 4. Recettes + ingrédients (bornés au couple), et provenance déjà en place.
  const [recipesRes, ingredientsRes, listItemsRes] = await Promise.all([
    recipeIds.length
      ? supabase
          .from("recipes")
          .select("id, titre, nombre_personnes")
          .in("id", recipeIds)
          .eq("couple_id", coupleId)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; titre: string; nombre_personnes: number }[] }),
    recipeIds.length
      ? supabase
          .from("recipe_ingredients")
          .select("recipe_id, nom_affiche, quantite, unite, ordre")
          .in("recipe_id", recipeIds)
          .order("ordre", { ascending: true })
      : Promise.resolve({ data: [] as { recipe_id: string; nom_affiche: string; quantite: number | null; unite: string | null; ordre: number }[] }),
    supabase
      .from("list_items")
      .select("id")
      .eq("list_id", listId)
      .is("deleted_at", null),
  ])

  const recipesById = new Map(
    (recipesRes.data ?? []).map((r) => [r.id, r]),
  )
  const ingredientsByRecipe = new Map<string, typeof ingredientsRes.data>()
  for (const ing of ingredientsRes.data ?? []) {
    const bucket = ingredientsByRecipe.get(ing.recipe_id) ?? []
    bucket.push(ing)
    ingredientsByRecipe.set(ing.recipe_id, bucket)
  }

  // Garde-fou double-génération : quels repas ont déjà engendré un article de
  // CETTE liste ? (provenance × articles de la liste)
  const listItemIds = (listItemsRes.data ?? []).map((r) => r.id)
  let dejaGeneres = new Set<string>()
  if (listItemIds.length && recetteMealIds.length) {
    const { data: srcs } = await supabase
      .from("meal_slot_sources")
      .select("meal_slot_id")
      .in("meal_slot_id", recetteMealIds)
      .in("list_item_id", listItemIds)
    dejaGeneres = new Set((srcs ?? []).map((s) => s.meal_slot_id))
  }

  // 5. Construit les entrées à plat (ratio §8.2 appliqué ici, serveur).
  const entrees: EntreeBesoin[] = []
  for (const meal of recetteMeals) {
    const recipe = recipesById.get(meal.recipeId)
    if (!recipe) continue // recette supprimée entre-temps (défensif)
    const jour = labelJour(meal.date, meal.creneau)

    if (dejaGeneres.has(meal.id)) {
      ignores.push({ jour, libelle: recipe.titre, raison: "deja_genere" })
      continue
    }

    const ings = ingredientsByRecipe.get(meal.recipeId) ?? []
    if (ings.length === 0) {
      ignores.push({ jour, libelle: recipe.titre, raison: "sans_ingredient" })
      continue
    }

    const base = entierPositif(recipe.nombre_personnes, 4)
    const ratio = cible / base

    for (const ing of ings) {
      const nom = (ing.nom_affiche ?? "").trim()
      if (!nom) continue
      const cle = normaliserNom(nom) // règle d'or §5 : jamais la clé stockée
      if (!cle) continue
      const unite: Unite | null = (UNITES as readonly string[]).includes(
        ing.unite as string,
      )
        ? (ing.unite as Unite)
        : null
      // « au goût » (null) n'est jamais mis à l'échelle (§8.2).
      const quantite = ing.quantite === null ? null : ing.quantite * ratio
      entrees.push({
        cle,
        nom,
        contribution: { mealSlotId: meal.id, repas: recipe.titre, jour, quantite, unite },
      })
    }
  }

  const groupes = grouperBesoins(entrees)

  // 6. État courant de chaque ligne cible (find-only : aucune création ici).
  const besoins: BesoinRassemble[] = []
  for (const besoin of groupes) {
    const { data: matches } = await supabase
      .from("library_items")
      .select("id, usage_count")
      .eq("couple_id", coupleId)
      .eq("nom_normalise", besoin.cle)
      .order("usage_count", { ascending: false })
      .limit(1)
    const lib = matches?.[0]

    if (!lib) {
      besoins.push({
        besoin,
        libraryItemId: null,
        usageCount: null,
        listItemId: null,
        existantes: [],
        lignePreexistante: false,
      })
      continue
    }

    // Ligne ACTIVE (non cochée) : on ne fusionne jamais dans une ligne cochée.
    const { data: lines } = await supabase
      .from("list_items")
      .select("id, quantities")
      .eq("list_id", listId)
      .eq("library_item_id", lib.id)
      .eq("is_checked", false)
      .limit(1)
    const line = lines?.[0]

    besoins.push({
      besoin,
      libraryItemId: lib.id,
      usageCount: lib.usage_count,
      listItemId: line?.id ?? null,
      existantes: parseQuantites(line?.quantities),
      lignePreexistante: Boolean(line),
    })
  }

  return {
    ok: true,
    data: { list: { id: list.id, name: list.name }, cible, besoins, ignores },
  }
}

/** Projette une ligne repliée vers sa vue client (récap transparent §6). */
function ligneView(l: LigneGeneree): GenerationLigneView {
  return {
    cle: l.cle,
    nom: l.nom,
    quantitesInitiales: l.quantitesInitiales,
    quantitesFinales: l.quantitesFinales,
    detail: l.etapes.map((e) => ({
      jour: e.contribution.jour,
      repas: e.contribution.repas,
      texte: decrireFusion(e.operation, e.quantitesApres),
    })),
  }
}

/**
 * NIVEAU 2 — Prévisualisation de la génération (§8.5.5). LECTURE SEULE : agrège,
 * ajuste et fusionne EN MÉMOIRE, puis renvoie le récapitulatif complet (articles
 * créés, fusions détaillées, repas ignorés). RIEN n'est écrit — l'écriture
 * n'arrive qu'après validation via {@link commitWeekList}.
 */
export async function previewWeekList(
  listId: string,
  personnes: number | undefined,
  weekStartKey: string,
): Promise<PreviewWeekListResult> {
  const { supabase, coupleId } = await requireMembership()

  const r = await rassemblerBesoins(supabase, coupleId, listId, personnes, weekStartKey)
  if (!r.ok) return r
  const data = r.data

  const creees: GenerationLigneView[] = []
  const fusionnees: GenerationLigneView[] = []
  for (const b of data.besoins) {
    const ligne = foldBesoin(b.besoin, b.existantes, b.lignePreexistante)
    const view = ligneView(ligne)
    if (ligne.statut === "cree") creees.push(view)
    else fusionnees.push(view)
  }

  return {
    ok: true,
    apercu: {
      listId: data.list.id,
      listName: data.list.name,
      cible: data.cible,
      creees,
      fusionnees,
      ignores: data.ignores,
      aEcrire: creees.length + fusionnees.length,
    },
  }
}

/**
 * NIVEAU 2 — Écriture de la génération, APRÈS validation (§8.5.5/§8.5.6). RE-LIT
 * tout côté serveur (jamais le récap du client, §2.12) puis, pour chaque besoin :
 *   1. article de bibliothèque (trouvé au rassemblement, créé ici si absent) ;
 *   2. ligne de liste : update de la ligne active existante, sinon insert ;
 *   3. provenance : un lien `(case, article)` par repas contributeur, marqué
 *      `origine = 'generation'` (ligne créée) ou `'fusion'` (ligne préexistante) —
 *      indispensable au retrait ciblé du prompt 11 (§8.6).
 * Renvoie le même récapitulatif que la prévisualisation, pour l'écran de succès.
 */
export async function commitWeekList(
  listId: string,
  personnes: number | undefined,
  weekStartKey: string,
  /** Présent si la génération est déclenchée par le Cerveau (§8.7) → journalisée (§7). */
  brain?: BrainGenerationOrigin,
  /**
   * Articles RETIRÉS au récapitulatif (§8.5.5) : clés normalisées (§5) que
   * l'utilisateur a écartées d'un swipe avant validation. On les saute purement
   * et simplement à l'écriture — aucun article, aucune ligne, aucune provenance.
   * Recalculé serveur (jamais le récap du client, §2.12) : la clé est comparée à
   * `besoin.cle`, seul un besoin réel peut donc être exclu.
   */
  excludedCles?: string[],
): Promise<CommitWeekListResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  const r = await rassemblerBesoins(supabase, coupleId, listId, personnes, weekStartKey)
  if (!r.ok) return r
  const data = r.data

  const exclus = new Set(
    Array.isArray(excludedCles)
      ? excludedCles.filter((c): c is string => typeof c === "string")
      : [],
  )

  const creees: GenerationLigneView[] = []
  const fusionnees: GenerationLigneView[] = []
  const lignesACommit: {
    besoin: BesoinRassemble["besoin"]
    payload: Record<string, unknown>
  }[] = []

  for (const b of data.besoins) {
    // Article retiré au récap : on ne l'écrit pas (ni ligne, ni provenance).
    if (exclus.has(b.besoin.cle)) continue
    lignesACommit.push({
      besoin: b.besoin,
      payload: {
        key: b.besoin.cle,
        name: b.besoin.nom,
        category: guessCategory(b.besoin.nom),
        additions: b.besoin.contributions.map((c) => ({
          quantite: c.quantite,
          unite: c.unite,
        })),
        meal_slot_ids: [...new Set(b.besoin.contributions.map((c) => c.mealSlotId))],
      },
    })
  }

  if (lignesACommit.length > 0) {
    const { data: committed, error } = await supabase.rpc("commit_week_list_lines", {
      p_list_id: listId,
      p_added_by: userId,
      p_lines: lignesACommit.map((l) => l.payload) as unknown as Json,
    })

    if (error) {
      return { ok: false, error: "Impossible de générer la liste. Réessaie." }
    }

    const rowsByKey = new Map(parseWeekCommitRows(committed).map((row) => [row.key, row]))
    for (const item of lignesACommit) {
      const row = rowsByKey.get(item.besoin.cle)
      if (!row) {
        return { ok: false, error: "La génération est incomplète. Réessaie." }
      }

      const ligne = foldBesoin(item.besoin, row.previousQuantities, !row.createdListItem)
      const view = ligneView(ligne)
      view.quantitesFinales = row.quantities
      if (row.createdListItem) creees.push(view)
      else fusionnees.push(view)
    }
  }

  revalidatePath(`/lists/${listId}`)
  revalidatePath("/planning")

  // Journalisation (§7) UNIQUEMENT si la commande vient du Cerveau (§8.7). Le
  // ticket est descriptif ; `undo_data` est null : une génération ne s'annule pas
  // en bloc via le journal — sa modification passe par le retrait ciblé (§8.6).
  const aEcrire = creees.length + fusionnees.length
  if (brain && aEcrire > 0) {
    const lignes = [
      ...creees.map((l) => ({ nom: l.nom, detail: "ajouté" })),
      ...fusionnees.map((l) => ({ nom: l.nom, detail: "fusionné" })),
    ]
    const groups = [{ label: `Liste « ${data.list.name} » générée`, lignes }]
    await supabase.from("brain_commands").insert({
      couple_id: coupleId,
      user_id: userId,
      texte_dicte: brain.texteDicte.trim().slice(0, 1000),
      actions: groups as unknown as Json,
      statut: "fait",
      undo_data: null,
    })
    revalidatePath("/profile/journal")
  }

  return {
    ok: true,
    apercu: {
      listId: data.list.id,
      listName: data.list.name,
      cible: data.cible,
      creees,
      fusionnees,
      ignores: data.ignores,
      aEcrire,
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Retrait ciblé des articles d'un repas supprimé / remplacé (§8.6)           */
/* -------------------------------------------------------------------------- */

/** Un article proposé au retrait entier (ligne créée, non cochée, source unique). */
export type RetraitLigneView = {
  listItemId: string
  nom: string
  quantites: QuantiteBase[]
}

/** Un article NON retirable, seulement signalé « à ajuster manuellement » (§8.6). */
export type AjustementLigneView = {
  nom: string
  quantites: QuantiteBase[]
  /** `fusion` = existait déjà avant la génération ; `partage` = sert aussi ailleurs. */
  raison: "fusion" | "partage"
  /** Autres repas partageant l'article (« mar. soir · Curry »), pour `partage`. */
  partageAvec: string[]
}

/** Un article coché engendré par ce repas : jamais touché, signalé pour transparence. */
export type ConserveLigneView = {
  nom: string
  quantites: QuantiteBase[]
}

/** Récapitulatif AVANT confirmation du retrait (niveau 3, §8.6). */
export type MealRemovalPreview = {
  slotId: string
  /** Libellé du repas concerné (« Lasagnes »), pour la question. */
  repasLabel: string
  retirables: RetraitLigneView[]
  ajustements: AjustementLigneView[]
  conserves: ConserveLigneView[]
}

export type PreviewMealRemovalResult =
  | { ok: true; preview: MealRemovalPreview }
  | { ok: false; error: string }

/** Comment terminer après le retrait éventuel : vider la case, ou y poser un repas. */
export type MealRemovalMode =
  | { kind: "clear" }
  | { kind: "replace"; source: MealSource }

/** Un article engendré par le repas visé, avec tout ce qu'il faut pour le classer. */
type ArticleRepas = {
  listItemId: string
  listId: string
  nom: string
  quantites: QuantiteBase[]
  checked: boolean
  origine: "generation" | "fusion"
  /** Nombre de repas distincts reliés à cet article (provenance). */
  sourceCount: number
  /** Libellés des AUTRES repas qui l'engendrent aussi (pour le détail « partage »). */
  autresRepas: string[]
}

/**
 * Rassemble, pour un repas planifié, tous les articles de liste qu'il a engendrés
 * (via `meal_slot_sources`) et l'état RÉEL de chacun (coché ? créé/fusionné ?
 * partagé avec un autre repas ?). LECTURE SEULE, bornée au couple. Base commune de
 * la prévisualisation ET de la confirmation : la confirmation RE-CLASSE à partir
 * d'ici (jamais depuis la liste envoyée par le client, §2.12) — un article coché
 * entre-temps bascule donc en `conserver` et échappe au retrait.
 *
 * Renvoie `null` si la case n'existe pas / n'est pas au couple.
 */
async function rassemblerArticlesRepas(
  supabase: ServerClient,
  coupleId: string,
  slotId: string,
): Promise<{ label: string; articles: ArticleRepas[] } | null> {
  // 1. La case, bornée au couple (garde-fou : jamais d'accès hors couple).
  const { data: slot } = await supabase
    .from("meal_slots")
    .select("id, type, texte, recipe_id")
    .eq("id", slotId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!slot) return null

  let label = slot.texte ?? "Ce repas"
  if (slot.type === "recette" && slot.recipe_id) {
    const { data: r } = await supabase
      .from("recipes")
      .select("titre")
      .eq("id", slot.recipe_id)
      .eq("couple_id", coupleId)
      .maybeSingle()
    label = r?.titre ?? "Ce repas"
  }

  // 2. Articles engendrés par CETTE case + leur origine (créé / fusionné).
  const { data: myLinks } = await supabase
    .from("meal_slot_sources")
    .select("list_item_id, origine")
    .eq("meal_slot_id", slotId)
  const links = myLinks ?? []
  if (links.length === 0) return { label, articles: [] }

  const origineByItem = new Map(
    links.map((l) => [l.list_item_id, l.origine as "generation" | "fusion"]),
  )
  const itemIds = [...origineByItem.keys()]

  // 3. État courant des articles (RLS = cloisonnement couple) + leur libellé.
  // Une ligne déjà soft-deleted n'est jamais reproposée au retrait (§4.3/§4.4).
  const { data: items } = await supabase
    .from("list_items")
    .select("id, list_id, quantities, is_checked, library_item_id")
    .in("id", itemIds)
    .is("deleted_at", null)

  const libIds = [
    ...new Set((items ?? []).map((i) => i.library_item_id).filter(Boolean)),
  ] as string[]
  const { data: libs } = libIds.length
    ? await supabase.from("library_items").select("id, name").in("id", libIds)
    : { data: [] as { id: string; name: string }[] }
  const nameByLib = new Map((libs ?? []).map((l) => [l.id, l.name]))

  // 4. Provenance COMPLÈTE de ces articles : combien de repas les engendrent, et
  //    lesquels (pour signaler « sert aussi à … » sur les articles partagés).
  const { data: allSrc } = await supabase
    .from("meal_slot_sources")
    .select("meal_slot_id, list_item_id")
    .in("list_item_id", itemIds)
  const slotsByItem = new Map<string, Set<string>>()
  for (const s of allSrc ?? []) {
    const set = slotsByItem.get(s.list_item_id) ?? new Set<string>()
    set.add(s.meal_slot_id)
    slotsByItem.set(s.list_item_id, set)
  }

  // 5. Libellés « jour · repas » des AUTRES cases partageant un de ces articles.
  const otherSlotIds = [
    ...new Set((allSrc ?? []).map((s) => s.meal_slot_id)),
  ].filter((id) => id !== slotId)
  const labelBySlot = new Map<string, string>()
  if (otherSlotIds.length) {
    const { data: others } = await supabase
      .from("meal_slots")
      .select("id, date, creneau, type, texte, recipe_id")
      .in("id", otherSlotIds)
      .eq("couple_id", coupleId)
    const otherRecipeIds = [
      ...new Set((others ?? []).map((o) => o.recipe_id).filter(Boolean)),
    ] as string[]
    const { data: orecipes } = otherRecipeIds.length
      ? await supabase
          .from("recipes")
          .select("id, titre")
          .in("id", otherRecipeIds)
          .eq("couple_id", coupleId)
      : { data: [] as { id: string; titre: string }[] }
    const titleById = new Map((orecipes ?? []).map((r) => [r.id, r.titre]))
    for (const o of others ?? []) {
      const creneau: Creneau = o.creneau === "diner" ? "diner" : "dejeuner"
      const nom =
        o.type === "recette" && o.recipe_id
          ? titleById.get(o.recipe_id) ?? "Repas"
          : o.texte ?? "Repas"
      labelBySlot.set(o.id, `${labelJour(o.date, creneau)} · ${nom}`)
    }
  }

  // 6. Assemblage.
  const articles: ArticleRepas[] = []
  for (const it of items ?? []) {
    const origine = origineByItem.get(it.id)
    if (origine !== "generation" && origine !== "fusion") continue
    const slotSet = slotsByItem.get(it.id) ?? new Set([slotId])
    const autresRepas = [...slotSet]
      .filter((id) => id !== slotId)
      .map((id) => labelBySlot.get(id))
      .filter((v): v is string => Boolean(v))
    articles.push({
      listItemId: it.id,
      listId: it.list_id,
      nom: nameByLib.get(it.library_item_id ?? "") ?? "Article",
      quantites: parseQuantites(it.quantities),
      checked: Boolean(it.is_checked),
      origine,
      sourceCount: slotSet.size,
      autresRepas,
    })
  }

  return { label, articles }
}

/**
 * NIVEAU 3 (§8.6) — Prévisualise ce que la suppression / le remplacement d'un
 * repas planifié ferait à la liste de courses. LECTURE SEULE : classe chaque
 * article engendré via {@link categoriserRetrait} (garde-fou pur) et renvoie les
 * trois listes (à retirer / à ajuster / conservés). RIEN n'est écrit ; le retrait
 * réel n'a lieu qu'après confirmation explicite via {@link confirmMealRemoval}.
 */
export async function previewMealRemoval(
  slotId: string,
): Promise<PreviewMealRemovalResult> {
  const { supabase, coupleId } = await requireMembership()

  const rassemble = await rassemblerArticlesRepas(supabase, coupleId, slotId)
  if (!rassemble) return { ok: false, error: "Repas introuvable." }

  const retirables: RetraitLigneView[] = []
  const ajustements: AjustementLigneView[] = []
  const conserves: ConserveLigneView[] = []

  for (const a of rassemble.articles) {
    switch (categoriserRetrait(a.origine, a.checked, a.sourceCount)) {
      case "retirable":
        retirables.push({ listItemId: a.listItemId, nom: a.nom, quantites: a.quantites })
        break
      case "ajuster":
        ajustements.push({
          nom: a.nom,
          quantites: a.quantites,
          raison: a.origine === "fusion" ? "fusion" : "partage",
          partageAvec: a.autresRepas,
        })
        break
      case "conserver":
        conserves.push({ nom: a.nom, quantites: a.quantites })
        break
    }
  }

  return {
    ok: true,
    preview: { slotId, repasLabel: rassemble.label, retirables, ajustements, conserves },
  }
}

/**
 * NIVEAU 3 (§8.6) — Applique la décision de retrait APRÈS confirmation explicite.
 * RE-CLASSE tout côté serveur (jamais la liste du client, §2.12) : seuls les
 * articles ENCORE `retirable` (créés par la génération, non cochés, source unique)
 * ET explicitement demandés (`listItemIds`) sont supprimés. Un article coché ou
 * fusionné entre-temps est ignoré en silence — garde-fou absolu : on ne touche
 * jamais un article coché, jamais de retrait non demandé.
 *
 * Ensuite, selon `mode` :
 *   - `clear`   — vide la case (cascade : la provenance restante disparaît) ;
 *   - `replace` — purge la provenance résiduelle de la case (l'upsert garde le même
 *     id : les liens de l'ancien repas n'ont plus de sens), puis pose le nouveau
 *     repas via {@link placeMeal}. Les courses manquantes du nouveau repas
 *     s'ajouteront à la prochaine « génération de la semaine » (le garde-fou
 *     anti-double-génération ne saute que les repas DÉJÀ générés, §8.5).
 */
export async function confirmMealRemoval(
  slotId: string,
  listItemIds: string[],
  mode: MealRemovalMode,
): Promise<ActionResult> {
  const { supabase, userId } = await requireMembership()

  let recipeId: string | null = null
  let texte: string | null = null

  if (mode.kind === "replace") {
    if (mode.source.kind === "recette") {
      recipeId = mode.source.recipeId
    } else {
      texte = mode.source.texte.trim().slice(0, TEXTE_MAX)
      if (!texte) return { ok: false, error: "Entre le repas (ex. « restes »)." }
    }
  }

  const { data, error } = await supabase.rpc("confirm_meal_removal", {
    p_slot_id: slotId,
    p_list_item_ids: listItemIds.filter((id): id is string => typeof id === "string"),
    p_mode: mode.kind,
    // La fonction SQL accepte `null` (mode "remove" ne fixe ni l'un ni l'autre) ;
    // les types générés ne l'exposent plus après régénération (§6.5).
    p_recipe_id: recipeId as string,
    p_texte: texte as string,
    p_created_by: userId,
  })

  if (error) {
    return { ok: false, error: "Impossible d’appliquer ce changement. Réessaie." }
  }

  revalidatePath("/planning")
  for (const listId of parseTouchedListIds(data)) revalidatePath(`/lists/${listId}`)
  return { ok: true }
}
