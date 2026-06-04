import { cn } from "@/lib/utils"

/**
 * RisoInput — champ de saisie "imprimé" du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §4 (bordure encre 2px, fond papier-clair, coins 8px).
 * Mobile-first : hauteur de tap confortable (48px) et `text-base` (16px) pour
 * empêcher le zoom auto de Safari iOS au focus.
 */
function RisoInput({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="riso-input"
      className={cn(
        "h-12 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3.5 text-base text-ink",
        "placeholder:text-ink-soft/60 font-body",
        "outline-none transition-[box-shadow] focus-visible:shadow-riso-sauge",
        "disabled:pointer-events-none disabled:opacity-50",
        "aria-[invalid=true]:border-brique aria-[invalid=true]:focus-visible:shadow-riso-brique",
        className,
      )}
      {...props}
    />
  )
}

export { RisoInput }
