import { RisoCard } from "@/components/ui/riso-card"

/**
 * Placeholder /lists — l'écran des listes partagées sera construit à l'étape
 * suivante. On valide ici seulement que le shell connecté + la nav fonctionnent.
 */
export default function ListsPage() {
  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">Listes</h1>
      <RisoCard shadow="sauge">
        <p className="text-sm text-ink-soft">
          Vos listes partagées arriveront ici.
        </p>
      </RisoCard>
    </section>
  )
}
