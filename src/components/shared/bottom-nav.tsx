"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ListChecks, ShoppingCart, User, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

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
  icon: LucideIcon
  /** Masque le texte sous l'icône (l'icône porte déjà l'identité de l'onglet). */
  hideLabel?: boolean
}

const DEFAULT_ITEMS: BottomNavItem[] = [
  { href: "/lists", label: "Listes", icon: ListChecks, hideLabel: true },
  { href: "/library", label: "Biblio", icon: ShoppingCart, hideLabel: true },
  { href: "/profile", label: "Profil", icon: User, hideLabel: true },
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
        "sticky bottom-0 z-40 border-t-[2.5px] border-ink bg-paper-light px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {/* Le trait encré court d'un bord à l'autre, mais les onglets restent
          calés sur la même colonne max-w-sm que le contenu (alignés sur tablette). */}
      <div className="mx-auto flex w-full max-w-sm items-stretch gap-1.5">
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
              <Icon
                className={hideLabel ? "size-[26px]" : "size-[21px]"}
                strokeWidth={2.5}
                aria-hidden
              />
              {!hideLabel && label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export { BottomNav }
