import { RisoCard } from "@/components/ui/riso-card"

/**
 * Placeholder /library — la bibliothèque (articles récurrents, catégories)
 * viendra plus tard. Ici on ne valide que la structure du shell connecté.
 */
export default function LibraryPage() {
  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">
        Bibliothèque
      </h1>
      <RisoCard shadow="brique">
        <p className="text-sm text-ink-soft">
          Vos articles et catégories réutilisables arriveront ici.
        </p>
      </RisoCard>
    </section>
  )
}
