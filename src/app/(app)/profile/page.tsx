import { RisoCard } from "@/components/ui/riso-card"

/**
 * Placeholder /profile — réglages du profil et du couple à venir. Sert pour
 * l'instant à vérifier la navigation basse entre les trois onglets.
 */
export default function ProfilePage() {
  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">Profil</h1>
      <RisoCard shadow="ink">
        <p className="text-sm text-ink-soft">
          Vos réglages de profil et de couple arriveront ici.
        </p>
      </RisoCard>
    </section>
  )
}
