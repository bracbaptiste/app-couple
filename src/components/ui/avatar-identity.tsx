import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * AvatarIdentity — pastille d'identité du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.4 — 40×40px, bordure 2.5px encre, ombre riso-ink-sm,
 * Silkscreen 15px. La couleur EST l'identité :
 *   sauge = toi (texte encre) · brique = la conjointe (texte papier-clair).
 * On affiche l'initiale du prénom (1 caractère).
 */
const avatarIdentityVariants = cva(
  "inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] border-[2.5px] border-ink font-display text-[15px] leading-none uppercase shadow-riso-ink-sm",
  {
    variants: {
      identity: {
        toi: "bg-sauge text-ink",
        elle: "bg-brique text-paper-light",
      },
    },
    defaultVariants: {
      identity: "toi",
    },
  }
)

type AvatarIdentityProps = Omit<React.ComponentProps<"span">, "children"> &
  VariantProps<typeof avatarIdentityVariants> & {
    /** Prénom complet ; seule l'initiale est rendue. */
    name: string
  }

function AvatarIdentity({
  className,
  identity,
  name,
  ...props
}: AvatarIdentityProps) {
  const initial = name.trim().charAt(0).toUpperCase()

  return (
    <span
      data-slot="avatar-identity"
      aria-label={name}
      title={name}
      className={cn(avatarIdentityVariants({ identity, className }))}
      {...props}
    >
      {initial}
    </span>
  )
}

export { AvatarIdentity, avatarIdentityVariants }
