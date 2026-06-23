import { redirect } from "next/navigation"

import { requireAuth } from "@/lib/supabase/auth"

import { NewRecipeClient } from "./new-recipe-client"

/**
 * Page « Ajouter une recette » (PRD_recettes §7.1).
 *
 * Server Component : garde d'auth + rattachement à un couple (comme le reste de
 * l'app connectée). L'autorisation réelle reste portée par la RLS et la Server
 * Action `createRecipe`. Les photos n'étant pas conservées, le client n'a besoin
 * d'aucune donnée du foyer ici.
 */
export default async function NewRecipePage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  return <NewRecipeClient />
}
