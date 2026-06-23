"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { normaliserNom } from "@/lib/utils/normalize-name-key"
import {
  TYPES_PLAT,
  TAGS,
  UNITES,
  type TypePlat,
  type Tag,
  type Unite,
} from "@/lib/recipes/extraction"

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
