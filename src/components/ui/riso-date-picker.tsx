"use client"

import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"

/**
 * RisoDatePicker — sélecteur de date « imprimé » du Design System Sauge & Brique.
 *
 * Remplace le `<input type="date">` natif (dont le rendu — roue iOS, popup
 * Android — jure avec la trame risographie de l'appli, et dont l'ouverture via
 * `showPicker()` est capricieuse sur mobile/PWA).
 *
 * Un bouton calendrier ouvre une feuille modale centrée : grille mensuelle
 * (lundi en tête), navigation mois précédent / suivant, repère « aujourd'hui »
 * (anneau sauge) et jour sélectionné (pastille brique). La valeur entrée/sortie
 * reste au format « yyyy-mm-dd » pour rester compatible avec l'existant.
 */
type RisoDatePickerProps = {
  /** Échéance courante au format « yyyy-mm-dd », ou "" si aucune. */
  value: string
  /** Remonte la date choisie (« yyyy-mm-dd ») ou "" si effacée. */
  onChange: (value: string) => void
  /** Désactive le bouton (mutation en cours). */
  disabled?: boolean
  /** Taille de la cible tactile du bouton. */
  size?: "default" | "sm"
  /** Libellé accessible du bouton d'ouverture. */
  triggerLabel?: string
}

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"] as const

const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
})

/** Construit une `Date` locale (minuit) à partir de « yyyy-mm-dd ». */
function parseValue(value: string): Date | null {
  if (!value) return null
  const [y, m, d] = value.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Formate une `Date` locale en « yyyy-mm-dd » (sans décalage de fuseau). */
function formatValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Indice lundi-en-tête (0 = lundi … 6 = dimanche). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7
}

function RisoDatePicker({
  value,
  onChange,
  disabled = false,
  size = "default",
  triggerLabel = "Choisir une échéance",
}: RisoDatePickerProps) {
  const [open, setOpen] = useState(false)
  // Mois affiché dans la grille (1er du mois courant ou de la valeur).
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const v = parseValue(value)
    const base = v ?? new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  // Sélection « en cours » dans la modale : permet de faire bouger la pastille
  // de suite au tap, avant la fermeture (la valeur remontée au parent ne change
  // qu'à ce moment-là). Resynchronisée à chaque ouverture.
  const [draft, setDraft] = useState(value)
  const panelRef = useRef<HTMLDivElement>(null)
  // Minuterie de fermeture différée (laisse voir la sélection se déplacer).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selected = parseValue(draft)
  const today = new Date()

  // À l'ouverture : on recale la grille sur la date choisie (ou le mois courant)
  // et on resynchronise la sélection en cours.
  function openPicker() {
    const v = parseValue(value)
    const base = v ?? new Date()
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1))
    setDraft(value)
    setOpen(true)
  }

  function close() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpen(false)
  }

  // Pendant l'ouverture : focus dans la modale + fermeture à la touche Échap.
  // Au démontage / à la fermeture, on purge la minuterie en attente.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      if (closeTimer.current) {
        clearTimeout(closeTimer.current)
        closeTimer.current = null
      }
    }
  }, [open])

  function changeMonth(delta: number) {
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  }

  function pick(day: Date) {
    const v = formatValue(day)
    // La pastille saute aussitôt sur la date tapée ET on remonte la valeur tout
    // de suite : la donnée est ainsi à l'abri même si le composant se démonte
    // avant la fermeture (ex. « OK » tapé très vite dans un formulaire d'édition).
    setDraft(v)
    onChange(v)
    // Le délai ne sert plus qu'au visuel : on laisse voir la pastille se poser,
    // puis on ferme. S'il est annulé (démontage), la valeur est déjà remontée.
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null
      setOpen(false)
    }, 180)
  }

  // Grille : cases vides avant le 1er (offset lundi) puis les jours du mois.
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
  ).getDate()
  const leadingBlanks = mondayIndex(firstOfMonth)
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
    ),
  ]

  const triggerSize = size === "sm" ? "size-9" : "size-11"

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex items-center justify-center rounded-[8px] text-ink outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-50",
          triggerSize,
        )}
      >
        <CalendarPlus className="size-5" strokeWidth={2.5} aria-hidden />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Choisir une échéance"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          >
            {/* Voile encre */}
            <button
              type="button"
              aria-label="Fermer"
              tabIndex={-1}
              onClick={close}
              className="absolute inset-0 bg-ink/40"
            />

            {/* Feuille calendrier */}
            <div
              ref={panelRef}
              tabIndex={-1}
              className="relative w-full max-w-[244px] rounded-[12px] border-2 border-ink bg-paper-light p-3 shadow-riso-ink-lg outline-none"
            >
              {/* En-tête : mois + navigation */}
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label="Mois précédent"
                  className="inline-flex size-7 items-center justify-center rounded-[6px] border-2 border-ink bg-paper text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
                >
                  <ChevronLeft className="size-4" strokeWidth={2.5} aria-hidden />
                </button>
                <span className="font-display text-[11px] uppercase leading-none text-ink">
                  {monthFormatter.format(viewMonth)}
                </span>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label="Mois suivant"
                  className="inline-flex size-7 items-center justify-center rounded-[6px] border-2 border-ink bg-paper text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
                >
                  <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden />
                </button>
              </div>

              {/* Jours de la semaine */}
              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((d, i) => (
                  <span
                    key={i}
                    className="flex h-5 items-center justify-center font-mono text-[10px] uppercase text-ink-soft"
                  >
                    {d}
                  </span>
                ))}
              </div>

              {/* Grille des jours */}
              <div className="grid grid-cols-7 gap-0.5">
                {cells.map((day, i) =>
                  day === null ? (
                    <span key={i} aria-hidden />
                  ) : (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pick(day)}
                      aria-label={day.toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                      aria-pressed={!!selected && isSameDay(day, selected)}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-[6px] border-[1.5px] text-[12px] font-medium leading-none outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px",
                        selected && isSameDay(day, selected)
                          ? "border-ink bg-brique text-paper-light"
                          : isSameDay(day, today)
                            ? "border-sauge bg-paper text-ink"
                            : "border-transparent bg-transparent text-ink hover:border-ink hover:bg-paper",
                      )}
                    >
                      {day.getDate()}
                    </button>
                  ),
                )}
              </div>

              {/* Actions */}
              <div className="mt-3 flex items-center justify-between gap-2">
                <RisoButton
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange("")
                    close()
                  }}
                >
                  Effacer
                </RisoButton>
                <RisoButton
                  variant="secondary"
                  size="sm"
                  onClick={() => pick(new Date())}
                >
                  Aujourd’hui
                </RisoButton>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export { RisoDatePicker }
