"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

import { getLastTool } from "@/lib/navigation/last-tool"

/**
 * Aiguille la racine `/` vers le dernier outil utilisé (PRD V4 §4.3).
 *
 * L'auth et l'onboarding sont déjà tranchés côté serveur (cf. `app/page.tsx`) :
 * ce composant n'est rendu que pour un couple configuré. La préférence vivant en
 * localStorage, la décision finale est forcément côté client ; on `replace()`
 * pour ne pas empiler `/` dans l'historique (le retour navigateur reste propre).
 */
export function LastToolRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace(getLastTool())
  }, [router])

  // Bref écran neutre le temps de la redirection client (papier + trame globaux).
  return (
    <p className="py-16 text-center font-mono text-[12px] text-ink-soft" role="status">
      Ouverture…
    </p>
  )
}
