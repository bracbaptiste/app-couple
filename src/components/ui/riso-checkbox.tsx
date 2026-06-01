import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * RisoCheckbox — case à cocher du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.3 — 26×26px, radius 6px, bordure 2.5px encre, fond papier.
 * Coché : fond brique, check papier-clair stroke 3.5. Zone tap élargie à 44px (§8).
 */
type RisoCheckboxProps = Omit<
  React.ComponentProps<"button">,
  "onChange" | "type"
> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

function RisoCheckbox({
  checked = false,
  onCheckedChange,
  onClick,
  className,
  ...props
}: RisoCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-slot="riso-checkbox"
      data-state={checked ? "checked" : "unchecked"}
      onClick={(event) => {
        onCheckedChange?.(!checked)
        onClick?.(event)
      }}
      className={cn(
        // Cible tap 44px (transparente) autour de la case visible 26px
        "inline-flex size-11 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "flex size-[26px] items-center justify-center rounded-[6px] border-[2.5px] border-ink transition-colors",
          checked ? "bg-brique" : "bg-paper"
        )}
      >
        {checked && (
          <Check
            className="size-[15px] text-paper-light"
            strokeWidth={3.5}
            aria-hidden
          />
        )}
      </span>
    </button>
  )
}

export { RisoCheckbox }
