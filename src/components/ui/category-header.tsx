import { cn } from "@/lib/utils"

/**
 * CategoryHeader — bandeau de catégorie du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.7 — fond encre, texte papier, radius 6px, padding 6px/12px.
 * Nom en Silkscreen 15px ; compteur à droite en JetBrains Mono 11px couleur sauge.
 */
type CategoryHeaderProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Nom de la catégorie (ex : "Épicerie"). */
  label: string
  /** Compteur optionnel affiché à droite (ex : "×2"). */
  count?: React.ReactNode
}

function CategoryHeader({
  className,
  label,
  count,
  ...props
}: CategoryHeaderProps) {
  return (
    <div
      data-slot="category-header"
      className={cn(
        "flex items-center justify-between gap-3 rounded-[6px] bg-ink px-3 py-1.5 text-paper",
        className
      )}
      {...props}
    >
      <h4 className="font-display text-[15px] leading-none uppercase">
        {label}
      </h4>
      {count != null && (
        <span className="font-mono text-[11px] font-bold text-sauge">
          {count}
        </span>
      )}
    </div>
  )
}

export { CategoryHeader }
