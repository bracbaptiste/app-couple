import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * RisoCard — conteneur "imprimé" du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §4 + §5.9 — fond papier-clair, bordure encre 2/2.5px,
 * ombre décalée nette alternée (sauge ↔ brique pour rythmer, encre pour le neutre),
 * coins arrondis 8-14px. Aucun dégradé, aucune ombre floue.
 */
const risoCardVariants = cva(
  "border-ink bg-paper-light text-ink rounded-[12px]",
  {
    variants: {
      shadow: {
        sauge: "shadow-riso-sauge",
        brique: "shadow-riso-brique",
        ink: "shadow-riso-ink",
        none: "shadow-none",
      },
      border: {
        default: "border-2",
        strong: "border-[2.5px]",
      },
      padding: {
        default: "p-4",
        sm: "p-[13px]",
        lg: "p-6",
        none: "p-0",
      },
    },
    defaultVariants: {
      shadow: "sauge",
      border: "default",
      padding: "default",
    },
  }
)

type RisoCardProps = React.ComponentProps<"div"> &
  VariantProps<typeof risoCardVariants>

function RisoCard({
  className,
  shadow,
  border,
  padding,
  ...props
}: RisoCardProps) {
  return (
    <div
      data-slot="riso-card"
      className={cn(risoCardVariants({ shadow, border, padding, className }))}
      {...props}
    />
  )
}

export { RisoCard, risoCardVariants }
