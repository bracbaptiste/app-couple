import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * RisoBadge — compteur du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.2 — Silkscreen 13px, min-width 34px, height 34px,
 * bordure 2px encre, ombre riso-ink-sm.
 *   brique : compteur principal (texte papier-clair)
 *   sauge  : listes secondaires (texte encre)
 *   empty  : état "tout coché" sur papier (texte encre)
 */
const risoBadgeVariants = cva(
  "inline-flex h-[34px] min-w-[34px] items-center justify-center rounded-[8px] border-2 border-ink px-[9px] font-display text-[13px] leading-none shadow-riso-ink-sm",
  {
    variants: {
      variant: {
        brique: "bg-brique text-paper-light",
        sauge: "bg-sauge text-ink",
        empty: "bg-paper text-ink",
      },
    },
    defaultVariants: {
      variant: "brique",
    },
  }
)

type RisoBadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof risoBadgeVariants>

function RisoBadge({ className, variant, ...props }: RisoBadgeProps) {
  return (
    <span
      data-slot="riso-badge"
      className={cn(risoBadgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { RisoBadge, risoBadgeVariants }
