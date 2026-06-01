import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * RisoButton — bouton "imprimé" du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.1 — Silkscreen 12px MAJ, padding 11px/18px, radius 8px,
 * bordure 2px encre, ombre décalée nette. Au tap, le bouton s'enfonce dans le papier
 * (translation +1px + ombre annulée) — jamais d'ombre floue.
 */
const risoButtonVariants = cva(
  "group/riso-button inline-flex shrink-0 items-center justify-center gap-2 rounded-[8px] border-2 border-ink font-display text-xs uppercase leading-none tracking-tight whitespace-nowrap outline-none transition-[transform,box-shadow] select-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brique text-paper-light shadow-riso-ink-sm",
        secondary: "bg-paper-light text-ink shadow-riso-sauge",
        ghost: "border-dashed bg-transparent text-ink shadow-none active:translate-x-0 active:translate-y-0",
      },
      size: {
        default: "px-[18px] py-[11px]",
        sm: "px-3 py-2 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

type RisoButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof risoButtonVariants>

function RisoButton({
  className,
  variant,
  size,
  type = "button",
  ...props
}: RisoButtonProps) {
  return (
    <button
      type={type}
      data-slot="riso-button"
      className={cn(risoButtonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { RisoButton, risoButtonVariants }
