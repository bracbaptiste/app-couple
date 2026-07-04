"use client"

import { useCallback, useEffect, useState, type CSSProperties } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ListChecks,
  ShoppingCart,
  ChefHat,
  Calendar,
  User,
  Check,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * BrainButton — le cerveau partagé est LE bouton flottant de l'app (PRD V4 §4.1).
 *
 * Fidélité au logo : on n'affiche PAS un redessin, mais le PNG d'origine détouré
 * (`/icons/brain.png`). Deux copies superposées, chacune clippée sur sa moitié
 * (`clip-path: inset`) → superposition = logo intégral, chaque hémisphère (gauche
 * = sauge = Baptiste, droite = brique = Sonia) reste animable séparément. Keyframes
 * de respiration dans globals.css, gated `prefers-reduced-motion: no-preference`.
 *
 * ── ÉVENTAIL (§4.2 état « Éventail » + §4.3) ──────────────────────────────────
 * Tap court sur le cerveau → 5 jetons ronds icône seule FUSENT EN ÉTOILE depuis le
 * centre du cerveau et se répartissent sur un demi-cercle au-dessus (angles 30° →
 * 150°, un jeton toutes les 30°, rayon = 2× le diamètre du cerveau). La navigation
 * actuelle À L'IDENTIQUE (mêmes routes / icônes lucide que `bottom-nav.tsx`) + le
 * jeton Planning (nouveau). Aucun libellé texte ; `aria-label` sur chaque jeton.
 * Voile encre ~30 % derrière les jetons. Fermeture : re-tap cerveau, tap voile,
 * sélection d'un jeton (qui navigue), ou Échap.
 *
 * L'appui long (écoute vocale, §4.2) arrive en Phase 2 : ici seul le tap est câblé.
 */

const BRAIN_SIZE = 72 // px — diamètre du cerveau (cf. §4.1)
const FAN_RADIUS = BRAIN_SIZE * 2 // rayon de l'arc ≈ 2× le diamètre (§4.3)
const STAGGER = 22 // ms entre jetons (déploiement centre → extérieur)

type FanChip = {
  href: string
  label: string
  icon: LucideIcon
  /** Angle sur le demi-cercle (degrés, 0° = droite, 90° = sommet, 180° = gauche). */
  angle: number
}

/**
 * Ordre imposé par le PRD §4.3 : Listes (extrémité gauche) → Profil (extrémité
 * droite). Routes et icônes reprises EXACTEMENT de `bottom-nav.tsx`, + Planning.
 */
const FAN_CHIPS: FanChip[] = [
  { href: "/lists", label: "Listes", icon: ListChecks, angle: 150 },
  { href: "/library", label: "Biblio", icon: ShoppingCart, angle: 120 },
  { href: "/recipes", label: "Recettes", icon: ChefHat, angle: 90 },
  { href: "/planning", label: "Planning", icon: Calendar, angle: 60 },
  { href: "/profile", label: "Profil", icon: User, angle: 30 },
]

const CENTER_INDEX = (FAN_CHIPS.length - 1) / 2 // 2 → le jeton du sommet

/**
 * Style inline d'un jeton, calculé à partir de son angle et de l'état ouvert.
 *
 * On calcule le `transform` COMPLET en JS (pas de var CSS) : plus robuste face au
 * pipeline Next/Turbopack + Tailwind v4 (une transform inline ne peut pas être
 * silencieusement invalidée par une custom property non résolue). Le déploiement
 * / repli et le stagger vivent donc entièrement ici ; globals.css ne porte plus
 * que le timing de transition (désactivé sous `prefers-reduced-motion`).
 */
function chipStyle(chip: FanChip, index: number, open: boolean): CSSProperties {
  const rad = (chip.angle * Math.PI) / 180
  const dx = FAN_RADIUS * Math.cos(rad)
  const dy = -FAN_RADIUS * Math.sin(rad) // négatif = vers le haut (repère écran)
  const rot = index % 2 === 0 ? -3 : 3 // désaxage ±3° « imprimé à la main » (§4.3)
  const distanceFromCenter = Math.abs(index - CENTER_INDEX)
  // Ouverture : centre d'abord, extrémités ensuite. Repli : stagger inversé.
  const delay = open
    ? distanceFromCenter * STAGGER
    : (CENTER_INDEX - distanceFromCenter) * STAGGER

  return {
    transform: open
      ? // fusé sur l'arc : centrage puis translation vers (dx, dy)
        `translate(-50%, -50%) translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot}deg) scale(1)`
      : // au repos : blotti au centre du cerveau, réduit et invisible
        `translate(-50%, -50%) rotate(${rot}deg) scale(0.5)`,
    opacity: open ? 1 : 0,
    transitionDelay: `${delay}ms`,
    pointerEvents: open ? "auto" : "none",
  }
}

/** Clé localStorage du coach mark (§4.3) : posé au premier affichage, jamais réaffiché. */
const COACH_SEEN_KEY = "brain-coach-seen"

export function BrainButton({ className }: { className?: string }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Coach mark unique au premier lancement post-V4 (§4.3). Faux au SSR ; on
  // décide au montage client selon le flag localStorage (jamais réaffiché).
  const [showCoach, setShowCoach] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  // Marque le coach mark comme vu et le retire (idempotent, tolérant au stockage).
  const dismissCoach = useCallback(() => {
    setShowCoach(false)
    try {
      localStorage.setItem(COACH_SEEN_KEY, "1")
    } catch {
      // localStorage indisponible : le coach mark ne réapparaîtra pas ce cycle,
      // sans gravité (au pire il se remontre au prochain lancement).
    }
  }, [])

  // Au tout premier lancement (aucun flag), on affiche le coach mark. Le
  // setState est différé (setTimeout) pour ne pas déclencher de rendu en
  // cascade synchrone dans l'effet (et rester SSR-safe : décidé côté client).
  useEffect(() => {
    let unseen = false
    try {
      unseen = !localStorage.getItem(COACH_SEEN_KEY)
    } catch {
      // pas de stockage lisible : on s'abstient d'afficher (comportement sûr).
    }
    if (!unseen) return
    const timer = setTimeout(() => setShowCoach(true), 0)
    return () => clearTimeout(timer)
  }, [])

  // Échap ferme l'éventail (équivalent clavier du tap sur le voile).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close])

  return (
    <>
      {/* Voile encre ~30 % derrière les jetons (§4.2). Tap = fermeture. */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 motion-safe:transition-opacity motion-safe:duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Ancre fixe : boîte de 72 px centrée sur le cerveau. Les jetons se
          positionnent sur son centre (left/top 50 %) et fusent vers l'arc. */}
      <div
        className={cn(
          "fixed left-1/2 z-50 size-[72px] -translate-x-1/2",
          // Bas de l'écran : la BottomNav ayant disparu (§4.7), le cerveau se
          // pose bas (safe-area incluse) au lieu de flotter à mi-hauteur.
          "bottom-[calc(1.5rem+env(safe-area-inset-bottom))]",
          className
        )}
      >
        {/* Calque des jetons — chaque jeton porte son transform inline. */}
        <div className="pointer-events-none absolute inset-0">
          {FAN_CHIPS.map((chip, index) => {
            const Icon = chip.icon
            const active =
              pathname === chip.href || pathname.startsWith(`${chip.href}/`)

            return (
              <Link
                key={chip.href}
                href={chip.href}
                aria-label={chip.label}
                aria-current={active ? "page" : undefined}
                aria-hidden={!open}
                tabIndex={open ? 0 : -1}
                onClick={close}
                style={chipStyle(chip, index, open)}
                className={cn(
                  "brain-fan-chip flex size-16 items-center justify-center rounded-full",
                  "border-2 border-ink bg-paper-light text-ink",
                  "outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
                  // Outil courant : ombre réduite « enfoncée ». Sinon ombres riso
                  // décalées alternées brique / sauge (§4.3).
                  active
                    ? "shadow-riso-ink-sm"
                    : index % 2 === 0
                      ? "shadow-riso-brique"
                      : "shadow-riso-sauge"
                )}
              >
                <Icon className="size-[26px]" strokeWidth={2.5} aria-hidden />
                {active && (
                  // Coche marquant l'outil courant (§4.3).
                  <span
                    aria-hidden
                    className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full border border-paper-light bg-ink text-paper-light"
                  >
                    <Check className="size-2.5" strokeWidth={3} />
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* Coach mark unique (§4.3) : bulle papier au-dessus du cerveau au tout
            premier lancement. Tap dessus (ou ouverture de l'éventail) = vu, plus
            jamais réaffiché. `role="status"` pour l'annonce ; l'info reste
            purement additionnelle (le cerveau est utilisable sans elle). */}
        {showCoach && !open && (
          <button
            type="button"
            onClick={dismissCoach}
            className="absolute bottom-full left-1/2 mb-3 w-max max-w-[220px] -translate-x-1/2 rounded-[12px] border-2 border-ink bg-paper px-3 py-2 text-left shadow-riso-ink-sm outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            <span role="status" className="block font-mono text-[11px] leading-snug text-ink">
              <span className="font-bold">Tap</span> = outils ·{" "}
              <span className="font-bold">appui long</span> = parler
            </span>
            <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-ink-soft">
              Toucher pour fermer
            </span>
            {/* Petit ergot encre pointant vers le cerveau. */}
            <span
              aria-hidden
              className="absolute left-1/2 top-full size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b-2 border-r-2 border-ink bg-paper"
            />
          </button>
        )}

        {/* Le cerveau lui-même : tap = ouvre / ferme l'éventail. */}
        <button
          type="button"
          aria-label="Ouvrir les outils"
          aria-expanded={open}
          onClick={() => {
            if (showCoach) dismissCoach()
            setOpen((value) => !value)
          }}
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full",
            "border-[2.5px] border-ink bg-paper-light shadow-riso-ink",
            "outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          )}
        >
          <span aria-hidden className="brain-logo relative block size-12">
            <Image
              src="/icons/brain.png"
              alt=""
              fill
              sizes="48px"
              priority
              draggable={false}
              className="brain-half brain-half-l select-none object-contain"
            />
            <Image
              src="/icons/brain.png"
              alt=""
              fill
              sizes="48px"
              draggable={false}
              className="brain-half brain-half-r select-none object-contain"
            />
          </span>
        </button>
      </div>
    </>
  )
}
