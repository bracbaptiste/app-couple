import { Users } from "lucide-react"

/**
 * Badge « Partagé » (DESIGN_SYSTEM_V2 §1.2 — option A « Deux personnes »).
 *
 * Petit cadre carré posé en haut à droite d'une tuile de liste pour signaler
 * qu'elle est partagée avec la conjointe. Icône `users` sauge sur fond paper,
 * bordure ink fine.
 */
export function SharedBadge() {
  return (
    <span
      className="inline-flex size-[26px] items-center justify-center rounded-[6px] border-[1.5px] border-ink bg-paper"
      aria-label="Liste partagée"
      title="Liste partagée"
    >
      <Users size={14} strokeWidth={2} className="text-sauge" aria-hidden />
    </span>
  )
}
