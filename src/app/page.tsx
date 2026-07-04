import { redirect } from "next/navigation"

import { LastToolRedirect } from "@/components/shared/last-tool-redirect"
import { createClient } from "@/lib/supabase/server"
import { LISTS_PATH, resolveLandingPath } from "@/lib/supabase/redirects"

/**
 * Racine `/` — point d'entrée qui aiguille vers le bon écran :
 *   - non connecté             → /login              (redirection serveur)
 *   - connecté sans couple      → /onboarding         (redirection serveur)
 *   - connecté avec couple       → dernier outil utilisé (redirection client)
 *
 * L'auth et l'onboarding restent tranchés côté serveur. Le « dernier outil »
 * (PRD V4 §4.3) est une préférence locale (localStorage) : on ne peut la lire
 * que côté client, d'où le relais `<LastToolRedirect>` pour un couple configuré.
 */
export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  const landing = await resolveLandingPath(supabase, user.id)

  // Onboarding non terminé : redirection serveur immédiate, comme avant.
  if (landing !== LISTS_PATH) redirect(landing)

  // Couple configuré : le client rejoue le dernier outil (Listes par défaut).
  return <LastToolRedirect />
}
