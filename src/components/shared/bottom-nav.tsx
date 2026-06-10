"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ListChecks, User, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { BiblioCartIcon } from "@/components/shared/biblio-cart-icon"

/**
 * BottomNav — barre de navigation basse du Design System Sauge & Brique.
 * Réf : DESIGN_SYSTEM.md §5.11 — fond papier-clair, bordure haute 2.5px encre, 3 items.
 * Item actif : fond brique, texte papier-clair, bordure 2px encre, ombre riso-ink-sm,
 * radius 8px. Item inactif : texte encre-soft, transparent. Labels Silkscreen 9px MAJ.
 * Icônes 20-22px stroke 2.5 (style trait, jamais de remplissage).
 */
export type BottomNavItem = {
  href: string
  label: string
  icon: LucideIcon | typeof BiblioCartIcon
  /** Masque le texte sous l'icône (l'icône porte déjà l'identité de l'onglet). */
  hideLabel?: boolean
}

const DEFAULT_ITEMS: BottomNavItem[] = [
  { href: "/lists", label: "Listes", icon: ListChecks },
  { href: "/library", label: "Biblio", icon: BiblioCartIcon, hideLabel: true },
  { href: "/profile", label: "Profil", icon: User },
]

type BottomNavProps = {
  items?: BottomNavItem[]
  className?: string
}

function BottomNav({ items = DEFAULT_ITEMS, className }: BottomNavProps) {
  const pathname = usePathname()

  return (
    <nav
      data-slot="bottom-nav"
      className={cn(
        "sticky bottom-0 z-40 flex items-stretch gap-1.5 border-t-[2.5px] border-ink bg-paper-light px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {items.map(({ href, label, icon: Icon, hideLabel }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            aria-label={hideLabel ? label : undefined}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-[8px] border-2 py-1.5 font-display text-[9px] uppercase leading-none transition-colors",
              active
                ? "border-ink bg-brique text-paper-light shadow-riso-ink-sm"
                : "border-transparent text-ink-soft"
            )}
          >
            <Icon className="size-[21px]" strokeWidth={2.5} aria-hidden />
            {!hideLabel && label}
          </Link>
        )
      })}
    </nav>
  )
}

export { BottomNav }
