"use client"

import { useEffect } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section className="mx-auto w-full max-w-sm">
      <RisoCard shadow="brique" padding="lg">
        <h1 className="mb-2 font-display text-lg uppercase text-ink">
          Données indisponibles
        </h1>
        <p className="mb-5 text-[13px] leading-snug text-ink-soft">
          L’application n’a pas pu charger les données. Vérifie ta connexion puis
          réessaie.
        </p>
        <RisoButton className="w-full" onClick={reset}>
          Réessayer
        </RisoButton>
      </RisoCard>
    </section>
  )
}
