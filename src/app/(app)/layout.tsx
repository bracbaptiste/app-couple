import { redirect } from "next/navigation"

import { BottomNav } from "@/components/shared/bottom-nav"
import { requireAuth } from "@/lib/supabase/auth"

/**
 * Shell de l'application connectée (listes, bibliothèque, profil).
 *
 * Double garde côté serveur :
 *  - `requireAuth` renvoie vers /login si personne n'est authentifié ;
 *  - un profil sans `couple_id` n'a pas encore d'espace partagé → /onboarding.
 *
 * Mise en page mobile-first : le fond papier + trame demi-tons est porté
 * globalement par `body` (globals.css). Ici on empile une zone de contenu
 * scrollable (padding adapté mobile) puis la BottomNav riso collée en bas.
 * Pas de sidebar desktop pour l'instant.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) {
    redirect("/onboarding")
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 px-4 pt-5 pb-6">{children}</main>
      <BottomNav />
    </div>
  )
}
