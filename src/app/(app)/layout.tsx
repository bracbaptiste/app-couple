import { redirect } from "next/navigation"

import { BrainButton } from "@/components/shared/brain-button"
import { LastToolTracker } from "@/components/shared/last-tool-tracker"
import { OfflineIndicator } from "@/components/shared/offline-indicator"
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
 * scrollable (padding adapté mobile) ; la navigation passe entièrement par le
 * cerveau flottant (PRD V4 §4.7 — plus de BottomNav). Le `pb` du contenu dégage
 * la place du cerveau (qui flotte en bas au centre) pour ne rien masquer.
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
      {/* Bandeau discret « hors ligne / synchro » + rejeu de la file au retour
          du réseau. Sticky en haut, non bloquant (cf. OfflineIndicator). */}
      <OfflineIndicator />
      {/* Persiste l'outil courant pour rouvrir l'app dessus (PRD V4 §4.3). */}
      <LastToolTracker />
      {/* pb : le contenu scrolle au-dessus du cerveau flottant sans être masqué
          par lui (le cerveau occupe ~72px à 1.5rem du bas + safe-area). */}
      <main className="flex-1 px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      {/* Cerveau flottant : UNIQUE moyen de navigation (§4.7). Tap = éventail. */}
      <BrainButton />
    </div>
  )
}
