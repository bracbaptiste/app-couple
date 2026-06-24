"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { normaliserNom } from "@/lib/utils/normalize-name-key"
import { guessCategory } from "@/lib/utils/guess-category"
import {
  TYPES_PLAT,
  TAGS,
  UNITES,
  type TypePlat,
  type Tag,
  type Unite,
} from "@/lib/recipes/extraction"
import {
  fusionnerQuantite,
  parseQuantites,
  type OperationFusion,
  type QuantiteBase,
} from "@/lib/recipes/fusion"

/** Client Supabase serveur typé (inféré du helper, cf. library/actions.ts). */
type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Résultat uniforme renvoyé au client. */
export type ActionResult =
  | { ok: true; recipeId: string }
  | { ok: false; error: string }

/**
 * Charge utile envoyée par l'écran de relecture (§7.5). Les champs sont déjà
 * corrigés par l'utilisateur ; le serveur ne FAIT JAMAIS confiance pour autant :
 * il revalide tout et RECALCULE `nom_normalise` (règle d'or §5).
 */
export type RecipeIngredientInput = {
  nom: string
  quantite: number | null
  unite: Unite | null
}

export type CreateRecipeInput = {
  titre: string
  dureeMinutes: number | null
  typePlat: TypePlat
  tags: Tag[]
  nombrePersonnes: number
  caloriesParPortion: number | null
  proteinesG: number | null
  glucidesG: number | null
  lipidesG: number | null
  ingredients: RecipeIngredientInput[]
  etapes: string[]
  source: "photo" | "manuelle" | "ia"
}

/**
 * Récupère l'utilisateur authentifié + son `couple_id`. Une Server Action étant
 * appelable directement (POST), on ne se repose jamais sur l'UI pour
 * l'autorisation ; la RLS reste la barrière finale. Identique au pattern
 * `requireMembership` de library/actions.ts.
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

/** Coerce une valeur en nombre fini, sinon `null`. */
function nombreOuNull(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

/** Coerce un entier strictement positif (repli si invalide). */
function entierPositif(v: unknown, repli: number): number {
  const n = nombreOuNull(v)
  return n !== null && n > 0 ? Math.round(n) : repli
}

/**
 * Enregistre une recette + ses ingrédients (§7.5, bouton « Enregistrer »).
 *
 * Déroulé :
 *   1. auth + `couple_id` (RLS) ;
 *   2. validation défensive : titre non vide, `type_plat`/`tags`/`unite` bornés
 *      au jeu fermé (§10), nombres coercés ;
 *   3. insert `recipes` → on récupère l'`id` ;
 *   4. insert `recipe_ingredients` avec `ordre`, en RECALCULANT `nom_normalise`
 *      côté serveur via {@link normaliserNom} (règle d'or §5 — jamais la clé du
 *      client) ;
 *   5. si l'étape 4 échoue, suppression compensatoire de la recette (supabase-js
 *      n'offre pas de transaction multi-tables : on évite l'orphelin à la main,
 *      DELETE borné par `id` + `couple_id`, cf. garde-fou DELETE).
 */
export async function createRecipe(
  input: CreateRecipeInput,
): Promise<ActionResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  // --- 2. Validation défensive -------------------------------------------
  const titre = input.titre?.trim()
  if (!titre) return { ok: false, error: "Donne un titre à la recette." }

  const typePlat: TypePlat = (TYPES_PLAT as readonly string[]).includes(
    input.typePlat,
  )
    ? input.typePlat
    : "plat"

  const tags: Tag[] = Array.isArray(input.tags)
    ? [...new Set(input.tags)].filter((t): t is Tag =>
        (TAGS as readonly string[]).includes(t),
      )
    : []

  const source = (["photo", "manuelle", "ia"] as const).includes(input.source)
    ? input.source
    : "photo"

  // Ingrédients : nom obligatoire, clé recalculée serveur (§5), unité bornée.
  const ingredients = (input.ingredients ?? [])
    .map((ing) => ({
      nom: ing.nom?.trim() ?? "",
      quantite: nombreOuNull(ing.quantite),
      unite:
        typeof ing.unite === "string" &&
        (UNITES as readonly string[]).includes(ing.unite)
          ? (ing.unite as Unite)
          : null,
    }))
    .filter((ing) => ing.nom.length > 0)

  const etapes = (input.etapes ?? [])
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter(Boolean)

  // --- 3. Insert de la recette -------------------------------------------
  const { data: recipe, error: recipeErr } = await supabase
    .from("recipes")
    .insert({
      couple_id: coupleId,
      created_by: userId,
      titre,
      // Photos non conservées : `photo_url` reste null (sert juste à l'extraction).
      duree_minutes: nombreOuNull(input.dureeMinutes),
      type_plat: typePlat,
      tags,
      nombre_personnes: entierPositif(input.nombrePersonnes, 4),
      calories_par_portion: nombreOuNull(input.caloriesParPortion),
      proteines_g: nombreOuNull(input.proteinesG),
      glucides_g: nombreOuNull(input.glucidesG),
      lipides_g: nombreOuNull(input.lipidesG),
      etapes,
      source,
    })
    .select("id")
    .single()

  if (recipeErr || !recipe) {
    return { ok: false, error: "Impossible d’enregistrer la recette. Réessaie." }
  }

  // --- 4. Insert des ingrédients (clé §5 recalculée serveur) --------------
  if (ingredients.length > 0) {
    const rows = ingredients.map((ing, index) => ({
      recipe_id: recipe.id,
      nom_affiche: ing.nom,
      nom_normalise: normaliserNom(ing.nom), // règle d'or §5
      quantite: ing.quantite,
      unite: ing.unite,
      ordre: index,
    }))

    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(rows)

    // --- 5. Compensation : pas d'orphelin si les ingrédients échouent ------
    if (ingErr) {
      await supabase
        .from("recipes")
        .delete()
        .eq("id", recipe.id)
        .eq("couple_id", coupleId)
      return {
        ok: false,
        error: "Impossible d’enregistrer les ingrédients. Réessaie.",
      }
    }
  }

  revalidatePath("/recipes")
  return { ok: true, recipeId: recipe.id }
}

/* -------------------------------------------------------------------------- */
/*  Ajout des ingrédients d'une recette à une liste de courses (§6 + §8.1)     */
/* -------------------------------------------------------------------------- */

/** Échappe les métacaractères LIKE (`%` et `_`) pour un `ilike` exact. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/**
 * Résout l'`id` du rayon du couple portant ce nom (insensible à la casse), ou
 * `null`. Permet de ranger le nouvel article dans un rayon réel (qui a pu être
 * renommé par le couple). Calqué sur `resolveCategoryId` de lists/actions.ts.
 */
async function resolveCategoryId(
  supabase: ServerClient,
  coupleId: string,
  categoryName: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("couple_id", coupleId)
    .ilike("name", escapeLike(categoryName))
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Find-or-create d'un article de la bibliothèque PAR CLÉ normalisée (§6).
 * Même mécanisme que `addItemToList`, mais le rapprochement se fait sur
 * `nom_normalise` (la clé §5) et non sur le nom affiché. L'index est non unique
 * (quasi-doublons possibles) : on prend l'article le plus utilisé.
 */
async function trouverOuCreerArticle(
  supabase: ServerClient,
  coupleId: string,
  nomAffiche: string,
  cle: string,
): Promise<string | null> {
  const { data: matches } = await supabase
    .from("library_items")
    .select("id, usage_count")
    .eq("couple_id", coupleId)
    .eq("nom_normalise", cle)
    .order("usage_count", { ascending: false })
    .limit(1)

  const existing = matches?.[0]
  if (existing) {
    await supabase
      .from("library_items")
      .update({
        usage_count: existing.usage_count + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
    return existing.id
  }

  const categoryId = await resolveCategoryId(
    supabase,
    coupleId,
    guessCategory(nomAffiche),
  )

  const { data: created } = await supabase
    .from("library_items")
    .insert({
      couple_id: coupleId,
      name: nomAffiche,
      nom_normalise: cle, // règle d'or §5 : clé fournie par l'app (JS canonique)
      category_id: categoryId,
    })
    .select("id")
    .single()

  return created?.id ?? null
}

/** Une ligne du récap de fusion renvoyée au client (§8.1). */
export type FusionRecapLigne = {
  nom: string
  operation: OperationFusion
  /** Quantités résultantes de la ligne (pour formater « 1 pièce + 200 g »). */
  quantites: QuantiteBase[]
}

export type AddIngredientsResult =
  | { ok: true; recap: FusionRecapLigne[]; listId: string }
  | { ok: false; error: string }

/**
 * Ajoute les ingrédients d'une recette à une liste de courses, avec fusion (§6,
 * §8.1).
 *
 * Déroulé, pour chaque ingrédient (dans l'ordre) :
 *   1. auth + couple (RLS) ; la recette ET la liste appartiennent au couple ;
 *      la liste n'est pas une liste to-do ;
 *   2. clé `normaliserNom(nom_affiche)` RECALCULÉE serveur (règle d'or §5) ;
 *   3. find-or-create de l'article de bibliothèque par cette clé ;
 *   4. recherche de la ligne ACTIVE (non cochée) de la liste pour ce produit ;
 *   5. {@link fusionnerQuantite} applique les règles d'unités (§6) ;
 *   6. update de la ligne existante, ou insert d'une nouvelle ;
 *   7. on accumule un récap transparent (§6 « jamais de fusion silencieuse »).
 *
 * Ajustement par nombre de personnes (§8.2) : `nombrePersonnes` est le N choisi
 * sur la fiche. On RECALCULE le ratio (N / nombre_personnes de base) côté serveur
 * depuis la BDD — jamais les quantités envoyées par le client — puis on l'applique
 * à chaque quantité AVANT la fusion. « au goût » (`null`) n'est jamais mis à
 * l'échelle. Omis / invalide ⇒ ratio 1 (quantités de base).
 *
 * Sélection partielle (§8.1) : `ingredientIds` restreint l'ajout aux seuls
 * ingrédients cochés sur la fiche. Omis / vide ⇒ tous les ingrédients (rétro-
 * compatible). On filtre côté serveur sur l'`id` réel (jamais sur le nom).
 */
export async function addRecipeIngredientsToList(
  recipeId: string,
  listId: string,
  nombrePersonnes?: number,
  ingredientIds?: string[],
): Promise<AddIngredientsResult> {
  const { supabase, userId, coupleId } = await requireMembership()

  // 1. Recette du couple ? On lit aussi son nombre de personnes de base pour
  //    calculer le ratio d'ajustement (§8.2) côté serveur.
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id, nombre_personnes")
    .eq("id", recipeId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!recipe) return { ok: false, error: "Recette introuvable." }

  // Ratio d'ajustement (§8.2). Base bornée à ≥ 1 (donnée ancienne), N choisi
  // borné de même ; absent ⇒ on retombe sur la base (ratio 1).
  const base = entierPositif(recipe.nombre_personnes, 4)
  const cible = entierPositif(nombrePersonnes, base)
  const ratio = cible / base

  // 1bis. Liste cible du couple, et bien une liste de courses ?
  const { data: list } = await supabase
    .from("lists")
    .select("id, kind")
    .eq("id", listId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!list) return { ok: false, error: "Liste introuvable." }
  if (list.kind === "todo") {
    return { ok: false, error: "Cette liste n’est pas une liste de courses." }
  }

  // 2. Ingrédients de la recette, dans l'ordre d'affichage.
  const { data: ingData } = await supabase
    .from("recipe_ingredients")
    .select("id, nom_affiche, quantite, unite, ordre")
    .eq("recipe_id", recipe.id)
    .order("ordre", { ascending: true })

  let ingredients = ingData ?? []
  if (ingredients.length === 0) {
    return { ok: false, error: "Cette recette n’a aucun ingrédient." }
  }

  // Sélection partielle (§8.1) : on ne garde que les ingrédients cochés. Un
  // tableau vide/absent vaut « tous » (rétro-compatible). On filtre sur l'`id`
  // réel pour ne jamais faire confiance à un nom ou une position envoyés.
  if (Array.isArray(ingredientIds) && ingredientIds.length > 0) {
    const choisis = new Set(ingredientIds)
    ingredients = ingredients.filter((ing) => choisis.has(ing.id))
    if (ingredients.length === 0) {
      return { ok: false, error: "Aucun ingrédient sélectionné." }
    }
  }

  const recap: FusionRecapLigne[] = []

  for (const ing of ingredients) {
    const nom = (ing.nom_affiche ?? "").trim()
    if (!nom) continue
    const cle = normaliserNom(nom) // règle d'or §5 : jamais la clé stockée
    if (!cle) continue

    // 3. Article de bibliothèque (find-or-create par clé).
    const libraryItemId = await trouverOuCreerArticle(supabase, coupleId, nom, cle)
    if (!libraryItemId) {
      return { ok: false, error: "Impossible d’ajouter un ingrédient. Réessaie." }
    }

    // 4. Ligne active de la liste pour ce produit (on ne fusionne pas dans une
    //    ligne déjà cochée : elle appartient au passé, cf. addItemToList).
    const { data: existant } = await supabase
      .from("list_items")
      .select("id, quantities")
      .eq("list_id", listId)
      .eq("library_item_id", libraryItemId)
      .eq("is_checked", false)
      .maybeSingle()

    // 5. Fusion des quantités (§6). L'unité stockée est bornée à g/ml/piece/null
    //    (l'extraction convertit déjà kg/l en amont) ; on la re-borne par sûreté.
    const unite: Unite | null = (UNITES as readonly string[]).includes(
      ing.unite as string,
    )
      ? (ing.unite as Unite)
      : null
    // Ajustement §8.2 : on met la quantité à l'échelle (ratio recalculé serveur)
    // AVANT la fusion. « au goût » (null) n'est jamais multiplié. Le stockage
    // reste exact (pas d'arrondi) ; seul l'affichage de la fiche arrondit.
    const quantiteAjustee =
      ing.quantite === null ? null : ing.quantite * ratio
    const { quantites, operation } = fusionnerQuantite(
      parseQuantites(existant?.quantities),
      { quantite: quantiteAjustee, unite },
    )

    // 6. Écriture : update si la ligne existe, sinon insert.
    if (existant) {
      const { error } = await supabase
        .from("list_items")
        .update({ quantities: quantites })
        .eq("id", existant.id)
        .eq("list_id", listId)
      if (error) {
        return { ok: false, error: "Impossible de mettre à jour la liste. Réessaie." }
      }
    } else {
      const { error } = await supabase.from("list_items").insert({
        list_id: listId,
        library_item_id: libraryItemId,
        added_by: userId,
        quantities: quantites,
      })
      if (error) {
        return { ok: false, error: "Impossible d’ajouter à la liste. Réessaie." }
      }
    }

    // 7. Récap transparent.
    recap.push({ nom, operation, quantites })
  }

  revalidatePath(`/lists/${listId}`)
  return { ok: true, recap, listId }
}

/* -------------------------------------------------------------------------- */
/*  Transfert d'un ingrédient vers la bibliothèque (§8.4 + §6)                  */
/* -------------------------------------------------------------------------- */

export type AddToLibraryResult =
  | { ok: true; created: boolean; nom: string }
  | { ok: false; error: string }

/**
 * Ajoute un ingrédient d'une recette à la bibliothèque du couple (§8.4), via le
 * MÊME mécanisme de rapprochement que la fusion (§6) : la clé `normaliserNom`
 * (règle d'or §5) recalculée serveur. Si un article de cette clé existe déjà, on
 * NE crée RIEN (§6 « SI un article avec ce nom_normalise existe déjà → ne rien
 * créer ») et on ne touche pas à son `usage_count` : l'ajout à la bibliothèque
 * n'est pas un usage. `created` distingue les deux cas pour un retour transparent
 * (« ajouté » vs « déjà dans ta bibliothèque »).
 */
export async function addIngredientToLibrary(
  recipeId: string,
  ingredientId: string,
): Promise<AddToLibraryResult> {
  const { supabase, coupleId } = await requireMembership()

  // 1. Recette du couple ? (borne le recipeId reçu du client, double la RLS)
  const { data: recipe } = await supabase
    .from("recipes")
    .select("id")
    .eq("id", recipeId)
    .eq("couple_id", coupleId)
    .maybeSingle()
  if (!recipe) return { ok: false, error: "Recette introuvable." }

  // 2. Ingrédient bien rattaché à cette recette ?
  const { data: ing } = await supabase
    .from("recipe_ingredients")
    .select("nom_affiche")
    .eq("id", ingredientId)
    .eq("recipe_id", recipe.id)
    .maybeSingle()

  const nom = (ing?.nom_affiche ?? "").trim()
  if (!nom) return { ok: false, error: "Ingrédient introuvable." }

  const cle = normaliserNom(nom) // règle d'or §5 : jamais une clé du client
  if (!cle) return { ok: false, error: "Ingrédient introuvable." }

  // 3. Déjà dans la bibliothèque (même clé normalisée) ? → ne rien créer (§6).
  const { data: existant } = await supabase
    .from("library_items")
    .select("id")
    .eq("couple_id", coupleId)
    .eq("nom_normalise", cle)
    .limit(1)
    .maybeSingle()

  if (existant) return { ok: true, created: false, nom }

  // 4. Nouveau produit : rangé dans le rayon deviné (sans IA), clé fournie §5.
  const categoryId = await resolveCategoryId(supabase, coupleId, guessCategory(nom))

  const { error } = await supabase.from("library_items").insert({
    couple_id: coupleId,
    name: nom,
    nom_normalise: cle,
    category_id: categoryId,
  })

  if (error) {
    return { ok: false, error: "Impossible d’ajouter à la bibliothèque. Réessaie." }
  }

  revalidatePath("/library")
  return { ok: true, created: true, nom }
}
