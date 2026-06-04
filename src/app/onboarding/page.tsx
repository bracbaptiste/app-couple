import { redirect } from "next/navigation"

import { requireAuth } from "@/lib/supabase/auth"

import { OnboardingFlow } from "./onboarding-client"

/**
 * Onboarding couple. Accessible uniquement connecté (requireAuth). Un profil
 * déjà rattaché à un couple n'a rien à faire ici → renvoyé vers ses listes.
 * Le reste du parcours (créer / rejoindre) vit dans le composant client.
 */
export default async function OnboardingPage() {
  const { profile } = await requireAuth()

  if (profile?.couple_id) {
    redirect("/lists")
  }

  return <OnboardingFlow />
}
