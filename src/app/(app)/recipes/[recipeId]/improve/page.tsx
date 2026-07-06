import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

import { ImproveClient } from "./improve-client"

/**
 * Page « Améliorer avec l'IA » (PRD_recettes §9.1 — entrée « améliorer »).
 *
 * Server Component : garde d'auth + vérifie que la recette appartient bien au
 * couple (404 sinon). On ne charge ici que l'`id` et le titre pour le contexte
 * d'écran ; la relecture complète de la recette pour l'IA se fait dans la route
 * de génération (§9.2), scopée au couple.
 */
export default async function ImproveRecipePage({
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
    .select("id, titre")
    .eq("id", recipeId)
    .eq("couple_id", profile.couple_id)
    .is("deleted_at", null)
    .maybeSingle()

  if (!recipe) notFound()

  return <ImproveClient recipeId={recipe.id} titreOriginal={recipe.titre} />
}
