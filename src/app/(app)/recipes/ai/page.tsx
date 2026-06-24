import { redirect } from "next/navigation"

import { requireAuth } from "@/lib/supabase/auth"

import { AiCreateClient } from "./ai-create-client"

/**
 * Page « Créer avec l'IA » (PRD_recettes §9.1 — entrée « créer »).
 *
 * Server Component : garde d'auth + rattachement à un couple (comme le reste de
 * l'app connectée). L'autorisation réelle reste portée par la RLS, par la route
 * de génération (§9.2) et par la Server Action `createRecipe`.
 */
export default async function CreateWithAiPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  return <AiCreateClient />
}
