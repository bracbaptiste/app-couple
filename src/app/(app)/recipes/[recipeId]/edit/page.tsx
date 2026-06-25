import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import {
  TYPES_PLAT,
  TAGS,
  UNITES,
  type RecetteExtraite,
  type TypePlat,
  type Tag,
  type Unite,
} from "@/lib/recipes/extraction"

import { EditRecipeClient } from "./edit-recipe-client"

/**
 * Page « Modifier une recette » (/recipes/[recipeId]/edit — édition manuelle,
 * Option A).
 *
 * Server Component (sous RLS) : on recharge la recette du couple (404 sinon) et
 * ses ingrédients triés, puis on les mappe vers `RecetteExtraite` — le MÊME
 * schéma que la relecture du flux d'ajout (§7.5) — pour réutiliser tel quel le
 * `ReviewForm`. L'écriture passe par la Server Action `updateRecipe`, qui revalide
 * et reborne tout (jamais confiance à l'UI).
 */
export default async function EditRecipePage({
  params,
}: {
  // Next 16 : les params de route sont asynchrones.
  params: Promise<{ recipeId: string }>
}) {
  const { recipeId } = await params
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, titre, duree_minutes, type_plat, tags, nombre_personnes, calories_par_portion, proteines_g, glucides_g, lipides_g, etapes",
    )
    .eq("id", recipeId)
    .eq("couple_id", profile.couple_id)
    .maybeSingle()

  if (!recipe) notFound()

  const { data: ingredientsData } = await supabase
    .from("recipe_ingredients")
    .select("nom_affiche, nom_normalise, quantite, unite")
    .eq("recipe_id", recipe.id)
    .order("ordre", { ascending: true })

  // Bornes défensives §10 (donnée ancienne / import hors-liste), comme la fiche.
  const typePlat: TypePlat = (TYPES_PLAT as readonly string[]).includes(
    recipe.type_plat,
  )
    ? (recipe.type_plat as TypePlat)
    : "plat"
  const tags: Tag[] = Array.isArray(recipe.tags)
    ? recipe.tags.filter((t): t is Tag => (TAGS as readonly string[]).includes(t))
    : []
  const etapes: string[] = Array.isArray(recipe.etapes)
    ? recipe.etapes.filter(
        (e): e is string => typeof e === "string" && e.trim() !== "",
      )
    : []

  const recette: RecetteExtraite = {
    titre: recipe.titre,
    duree_minutes: recipe.duree_minutes,
    type_plat: typePlat,
    tags,
    nombre_personnes: recipe.nombre_personnes,
    calories_par_portion: recipe.calories_par_portion,
    proteines_g: recipe.proteines_g,
    glucides_g: recipe.glucides_g,
    lipides_g: recipe.lipides_g,
    ingredients: (ingredientsData ?? []).map((i) => ({
      nom: i.nom_affiche,
      // La clé §5 est recalculée serveur à l'enregistrement ; ici on relit la
      // valeur stockée pour satisfaire le type (le ReviewForm ne l'utilise pas).
      nom_normalise: i.nom_normalise,
      quantite: i.quantite,
      unite: (UNITES as readonly string[]).includes(i.unite as string)
        ? (i.unite as Unite)
        : null,
    })),
    etapes,
  }

  return <EditRecipeClient recipeId={recipe.id} recette={recette} />
}
