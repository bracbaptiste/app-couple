import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * BrainButton — le cerveau partagé devient LE bouton flottant de l'app (PRD V4 §4.1).
 *
 * Fidélité au logo : on n'affiche PAS un redessin, mais le PNG d'origine détouré
 * (`/icons/brain.png`, recadré sur la bounding box de `logo-source.png`, fond rendu
 * transparent). Le PNG est parfaitement symétrique : la fissure centrale tombe pile
 * à 50 % de la largeur. On superpose donc DEUX copies identiques de l'image, chacune
 * clippée sur sa moitié (`clip-path: inset`) → superposition = logo intégral, mais
 * chaque hémisphère reste un élément distinct, animable séparément :
 *   - moitié gauche = sauge = Baptiste
 *   - moitié droite = brique = Sonia
 *
 * État « Repos » uniquement pour l'instant (§4.2) : respiration douce du logo +
 * léger bob vertical des hémisphères en opposition de phase. Les keyframes vivent
 * dans globals.css, sous `@media (prefers-reduced-motion: no-preference)` → réduit =
 * aucune animation, logo net et lisible.
 *
 * Aucune navigation branchée à ce stade (Phase 1, prompt 1). Le bouton flotte
 * au-dessus du contenu et de la BottomNav (conservée jusqu'au prompt 3).
 */
export function BrainButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Cerveau"
      className={cn(
        // Flottant bas-centre, au-dessus de la BottomNav (z-40) et du contenu.
        "fixed left-1/2 z-50 -translate-x-1/2",
        "bottom-[calc(5rem+env(safe-area-inset-bottom))]",
        // Pastille riso : rond 72px, papier clair, bordure encre, ombre décalée nette.
        "flex size-[72px] items-center justify-center rounded-full",
        "border-[2.5px] border-ink bg-paper-light shadow-riso-ink",
        "outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        className
      )}
    >
      <span
        aria-hidden
        className="brain-logo relative block size-12"
      >
        <Image
          src="/icons/brain.png"
          alt=""
          fill
          sizes="48px"
          priority
          draggable={false}
          className="brain-half brain-half-l select-none object-contain"
        />
        <Image
          src="/icons/brain.png"
          alt=""
          fill
          sizes="48px"
          draggable={false}
          className="brain-half brain-half-r select-none object-contain"
        />
      </span>
    </button>
  )
}
