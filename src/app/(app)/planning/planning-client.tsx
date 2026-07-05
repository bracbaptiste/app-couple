"use client"

import Link from "next/link"
import { CalendarDays, ChevronLeft, ChevronRight, Utensils } from "lucide-react"

import { useRealtimePlanning } from "@/lib/realtime"
import { formatWeekLabel, parseDateKey } from "@/lib/planning/week"
import { cn } from "@/lib/utils"

/** Un repas placé dans une case (déjeuner ou dîner d'un jour). */
export type MealSlotView = {
  id: string
  creneau: "dejeuner" | "diner"
  type: "recette" | "texte"
  /** Titre de la recette liée ou texte libre — ce qui s'affiche dans la case. */
  label: string
}

/** Une colonne = un jour de la semaine, avec ses deux créneaux (null = vide). */
export type DayColumn = {
  dateKey: string
  /** Nom du jour en toutes lettres (« lundi »). */
  weekday: string
  dayNumber: number
  isToday: boolean
  dejeuner: MealSlotView | null
  diner: MealSlotView | null
}

/** Libellés courts des deux créneaux (PRD_V4 §8.1). */
const CRENEAU_LABEL: Record<"dejeuner" | "diner", string> = {
  dejeuner: "Déjeuner",
  diner: "Dîner",
}

/**
 * Grille du Planning : 7 jours (lundi → dimanche) × 2 créneaux (§8.1).
 *
 * Mobile-first (une colonne de jours empilés) : chaque jour porte son étiquette
 * (mise en évidence si c'est aujourd'hui) puis ses deux cases déjeuner / dîner.
 * Une case VIDE est nativement en pointillés (§4.6 « ce qui n'existe pas encore »),
 * et c'est un état NORMAL — une semaine peut rester en grande partie vide.
 *
 * Le PLACEMENT d'un repas (remplir une case) arrive au prompt 9 : ici les cases
 * sont en lecture seule. Le temps réel est déjà câblé — un repas placé par l'un
 * (via le prompt 9 ou une insertion directe) s'affiche instantanément chez l'autre.
 */
export function PlanningGrid({
  coupleId,
  columns,
  weekStartKey,
  prevWeekKey,
  nextWeekKey,
  currentWeekKey,
}: {
  coupleId: string
  columns: DayColumn[]
  weekStartKey: string
  prevWeekKey: string
  nextWeekKey: string
  /** Lundi de la semaine « courante » (pour l'affordance « revenir »). */
  currentWeekKey: string
}) {
  // Temps réel : un repas placé/retiré côté partenaire rafraîchit la grille de la
  // semaine affichée, sans refresh manuel (§8.1).
  useRealtimePlanning(coupleId)

  const monday = parseDateKey(weekStartKey)
  const weekLabel = monday ? formatWeekLabel(monday) : ""
  const onCurrentWeek = weekStartKey === currentWeekKey

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl uppercase text-ink">Planning</h1>
        {!onCurrentWeek && (
          <Link
            href="/planning"
            className="rounded-full border-2 border-ink px-2.5 py-0.5 font-mono text-[11px] uppercase text-ink outline-none transition-colors hover:bg-sauge focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Cette semaine
          </Link>
        )}
      </div>

      {/* Navigation semaine précédente / libellé / semaine suivante. Ce sont des
          liens (navigation serveur) : l'URL change (?debut=…), donc la semaine
          affichée est partageable et survit au router.refresh() du temps réel. */}
      <nav
        aria-label="Navigation des semaines"
        className="flex items-center justify-between gap-2"
      >
        <WeekArrow
          href={`/planning?debut=${prevWeekKey}`}
          label="Semaine précédente"
          dir="prev"
        />
        <span className="flex items-center gap-1.5 font-display text-sm uppercase text-ink">
          <CalendarDays className="size-4 text-ink-soft" strokeWidth={2.5} aria-hidden />
          {weekLabel}
        </span>
        <WeekArrow
          href={`/planning?debut=${nextWeekKey}`}
          label="Semaine suivante"
          dir="next"
        />
      </nav>

      <ol className="flex flex-col gap-2.5">
        {columns.map((col) => (
          <li key={col.dateKey} className="flex items-stretch gap-2">
            {/* Étiquette du jour (jour courant mis en évidence : encre pleine). */}
            <div
              className={cn(
                "flex w-14 shrink-0 flex-col items-center justify-center rounded-[10px] border-2 py-1.5",
                col.isToday
                  ? "border-ink bg-ink text-paper-light"
                  : "border-ink/25 bg-paper-light text-ink",
              )}
            >
              <span className="font-mono text-[10px] uppercase leading-none opacity-80">
                {col.weekday.slice(0, 3)}
              </span>
              <span className="font-display text-lg leading-tight">
                {col.dayNumber}
              </span>
            </div>

            {/* Les deux créneaux du jour. */}
            <div className="grid flex-1 grid-cols-2 gap-2">
              <SlotCell creneau="dejeuner" slot={col.dejeuner} today={col.isToday} />
              <SlotCell creneau="diner" slot={col.diner} today={col.isToday} />
            </div>
          </li>
        ))}
      </ol>

      <p className="px-1 font-mono text-[11px] leading-snug text-ink-soft">
        Les cases en pointillés attendent un repas — placer un plat arrive bientôt.
      </p>
    </div>
  )
}

/** Flèche de navigation entre semaines (cible tactile ≥ 44px). */
function WeekArrow({
  href,
  label,
  dir,
}: {
  href: string
  label: string
  dir: "prev" | "next"
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-[10px] border-2 border-ink bg-paper-light text-ink outline-none transition-[transform,background-color] hover:bg-sauge active:translate-x-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none"
    >
      <Icon className="size-5" strokeWidth={2.5} aria-hidden />
    </Link>
  )
}

/**
 * Une case de la grille. Vide → pointillés (§4.6). Remplie → carte encrée avec
 * le libellé du repas. En lecture seule pour l'instant (placement au prompt 9).
 */
function SlotCell({
  creneau,
  slot,
  today,
}: {
  creneau: "dejeuner" | "diner"
  slot: MealSlotView | null
  today: boolean
}) {
  const creneauLabel = CRENEAU_LABEL[creneau]

  if (!slot) {
    // Case vide, native en pointillés : « ce qui n'existe pas encore ».
    return (
      <div
        className={cn(
          "flex min-h-[64px] flex-col justify-center gap-1 rounded-[10px] border-2 border-dashed px-2 py-1.5",
          today ? "border-ink-soft/70" : "border-ink-soft/45",
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft/70">
          {creneauLabel}
        </span>
      </div>
    )
  }

  // Case remplie : carte encrée avec ombre riso courte + libellé du repas.
  return (
    <div className="flex min-h-[64px] flex-col justify-between gap-1 rounded-[10px] border-2 border-ink bg-paper-light px-2 py-1.5 shadow-riso-ink-sm">
      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
        {slot.type === "recette" && (
          <Utensils className="size-3" strokeWidth={2.5} aria-hidden />
        )}
        {creneauLabel}
      </span>
      <span className="line-clamp-2 text-[13px] font-medium leading-tight text-ink">
        {slot.label}
      </span>
    </div>
  )
}
