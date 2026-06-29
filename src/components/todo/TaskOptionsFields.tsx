"use client"

import { cn } from "@/lib/utils"
import {
  type Recurrence,
  type RecurrenceType,
  NO_RECURRENCE,
  WEEKDAY_INITIALS,
  WEEKDAY_LABELS,
  defaultDayOfMonthFor,
  defaultWeekdayFor,
} from "@/lib/tasks/recurrence"

/** Membre du couple proposé comme assigné. */
type OptionsMember = { id: string; name: string; color: "sauge" | "brique" }

type TaskOptionsFieldsProps = {
  /** Membres du couple (pour le sélecteur d'assigné). */
  members: OptionsMember[]
  /** Assigné courant (id de profil), ou `null` (non assigné). */
  assignedTo: string | null
  onAssignedToChange: (id: string | null) => void
  /** Récurrence courante. */
  recurrence: Recurrence
  onRecurrenceChange: (r: Recurrence) => void
  /** Échéance courante (ISO « yyyy-mm-dd »), pour dériver le jour par défaut. */
  dueDate: string | null
  disabled?: boolean
}

/** Étiquette d'une sous-section (« ASSIGNÉ », « RÉCURRENCE »). */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
      {children}
    </span>
  )
}

/**
 * Bouton de groupe « segmenté » au style Riso : bordure encre 2px, coins 6px.
 * Sélectionné → fond encre / papier (ou couleur de personne via `tone`).
 */
function SegButton({
  selected,
  tone = "ink",
  disabled,
  onClick,
  children,
}: {
  selected: boolean
  /** Teinte quand sélectionné : encre (défaut) ou couleur d'une personne. */
  tone?: "ink" | "sauge" | "brique"
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-[6px] border-2 border-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase leading-none tracking-wide outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-50",
        selected
          ? tone === "sauge"
            ? "bg-sauge text-ink"
            : tone === "brique"
              ? "bg-brique text-paper-light"
              : "bg-ink text-paper"
          : "bg-paper-light text-ink-soft",
      )}
    >
      {children}
    </button>
  )
}

/**
 * TaskOptionsFields — sélecteurs « assigné » + « récurrence » du formulaire de
 * tâche (création et édition), au Design System Sauge & Brique (PRD §3.3, §3.4).
 *
 * Assigné : « Non assigné » / une pastille colorée par personne (sauge / brique)
 * avec son `display_name`. Récurrence : « Aucune » / « Tous les N jours » (champ
 * N) / « Chaque semaine » (choix du jour) / « Chaque mois » (choix du jour du
 * mois). Le composant ne décide pas du défaut d'assignation (porté par l'écran,
 * qui connaît si la liste est partagée ou perso) ; il édite les valeurs reçues.
 */
export function TaskOptionsFields({
  members,
  assignedTo,
  onAssignedToChange,
  recurrence,
  onRecurrenceChange,
  dueDate,
  disabled = false,
}: TaskOptionsFieldsProps) {
  /** Bascule de type de récurrence, en réinitialisant les champs pertinents. */
  function selectType(type: RecurrenceType) {
    switch (type) {
      case "none":
        return onRecurrenceChange({ ...NO_RECURRENCE })
      case "daily":
        return onRecurrenceChange({
          type,
          interval: recurrence.interval >= 1 ? recurrence.interval : 1,
          weekday: null,
          dayOfMonth: null,
        })
      case "weekly":
        return onRecurrenceChange({
          type,
          interval: 1,
          weekday: recurrence.weekday ?? defaultWeekdayFor(dueDate),
          dayOfMonth: null,
        })
      case "monthly":
        return onRecurrenceChange({
          type,
          interval: 1,
          weekday: null,
          dayOfMonth: recurrence.dayOfMonth ?? defaultDayOfMonthFor(dueDate),
        })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ---- Assigné ---- */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Assigné</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          <SegButton
            selected={assignedTo === null}
            disabled={disabled}
            onClick={() => onAssignedToChange(null)}
          >
            Non assigné
          </SegButton>
          {members.map((m) => (
            <SegButton
              key={m.id}
              selected={assignedTo === m.id}
              tone={m.color}
              disabled={disabled}
              onClick={() => onAssignedToChange(m.id)}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-ink",
                  m.color === "sauge" ? "bg-sauge" : "bg-brique",
                )}
              />
              {m.name}
            </SegButton>
          ))}
        </div>
      </div>

      {/* ---- Récurrence ---- */}
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Récurrence</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          <SegButton
            selected={recurrence.type === "none"}
            disabled={disabled}
            onClick={() => selectType("none")}
          >
            Aucune
          </SegButton>
          <SegButton
            selected={recurrence.type === "daily"}
            disabled={disabled}
            onClick={() => selectType("daily")}
          >
            Tous les N jours
          </SegButton>
          <SegButton
            selected={recurrence.type === "weekly"}
            disabled={disabled}
            onClick={() => selectType("weekly")}
          >
            Chaque semaine
          </SegButton>
          <SegButton
            selected={recurrence.type === "monthly"}
            disabled={disabled}
            onClick={() => selectType("monthly")}
          >
            Chaque mois
          </SegButton>
        </div>

        {/* Sous-réglage selon le type choisi. */}
        {recurrence.type === "daily" && (
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-body text-[13px] text-ink">Tous les</span>
            <input
              type="number"
              min={1}
              max={365}
              inputMode="numeric"
              disabled={disabled}
              value={recurrence.interval}
              onChange={(e) => {
                const n = Math.min(365, Math.max(1, Math.round(Number(e.target.value) || 1)))
                onRecurrenceChange({ ...recurrence, interval: n })
              }}
              aria-label="Nombre de jours entre deux occurrences"
              className="h-10 w-16 rounded-[8px] border-2 border-ink bg-paper-light px-2 text-center text-base font-medium text-ink outline-none focus-visible:shadow-riso-sauge disabled:opacity-50"
            />
            <span className="font-body text-[13px] text-ink">
              jour{recurrence.interval > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {recurrence.type === "weekly" && (
          <div className="mt-0.5 flex flex-col gap-1.5">
            <span className="font-mono text-[11px] text-ink-soft">Le jour</span>
            <div className="flex flex-wrap gap-1">
              {WEEKDAY_INITIALS.map((initial, idx) => {
                const selected = recurrence.weekday === idx
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-pressed={selected}
                    aria-label={WEEKDAY_LABELS[idx]}
                    title={WEEKDAY_LABELS[idx]}
                    disabled={disabled}
                    onClick={() => onRecurrenceChange({ ...recurrence, weekday: idx })}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-[6px] border-2 border-ink font-mono text-[12px] font-bold uppercase outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-50",
                      selected
                        ? "bg-brique text-paper-light"
                        : "bg-paper-light text-ink-soft",
                    )}
                  >
                    {initial}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {recurrence.type === "monthly" && (
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-body text-[13px] text-ink">Le</span>
            <input
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              disabled={disabled}
              value={recurrence.dayOfMonth ?? 1}
              onChange={(e) => {
                const n = Math.min(31, Math.max(1, Math.round(Number(e.target.value) || 1)))
                onRecurrenceChange({ ...recurrence, dayOfMonth: n })
              }}
              aria-label="Jour du mois"
              className="h-10 w-16 rounded-[8px] border-2 border-ink bg-paper-light px-2 text-center text-base font-medium text-ink outline-none focus-visible:shadow-riso-sauge disabled:opacity-50"
            />
            <span className="font-body text-[13px] text-ink">du mois</span>
          </div>
        )}
      </div>
    </div>
  )
}
