import { cn } from "@/lib/utils"

/**
 * AddedByMarker — petit carré « ajouté par » du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.10 — 12×12px, bordure 1.5px encre, fond = couleur
 * de la personne. Placé à droite de chaque article. Décoratif mais porteur de
 * sens : on expose le prénom via `aria-label`/`title`.
 */
type AddedByMarkerProps = Omit<React.ComponentProps<"span">, "children" | "color"> & {
  /** Couleur d'identité de la personne, ou `null` si inconnue. */
  color: "sauge" | "brique" | null
  /** Prénom de la personne (libellé accessible). */
  name?: string
}

function AddedByMarker({ className, color, name, ...props }: AddedByMarkerProps) {
  const label = name ? `Ajouté par ${name}` : undefined
  return (
    <span
      data-slot="added-by-marker"
      aria-label={label}
      title={label}
      className={cn(
        "inline-block size-3 shrink-0 rounded-[3px] border-[1.5px] border-ink",
        color === "sauge" && "bg-sauge",
        color === "brique" && "bg-brique",
        color === null && "bg-paper-deep",
        className,
      )}
      {...props}
    />
  )
}

export { AddedByMarker }
