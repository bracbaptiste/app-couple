import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { resolveLandingPath } from "@/lib/supabase/redirects"

/**
 * Racine `/` — point d'entrée qui aiguille immédiatement vers le bon écran :
 *   - non connecté            → /login
 *   - connecté sans couple     → /onboarding
 *   - connecté avec couple     → /lists
 *
 * Ne rend aucun contenu : c'est une simple redirection serveur. (L'ancien
 * placeholder « Setup OK » servait à valider les tokens du Design System.)
 */
export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  redirect(await resolveLandingPath(supabase, user.id))
}
