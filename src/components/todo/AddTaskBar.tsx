"use client"

import { CalendarPlus, Plus, X } from "lucide-react"
import { useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { getDueLabel } from "@/lib/hooks/useTaskState"

/**
 * AddTaskBar — champ d'ajout de tâche d'une to-do list (DESIGN_SYSTEM_V2 §2.7).
 *
 * Reprend l'`add-bar` V1 (fond sauge, bordure 2px encre, radius 10, ombre
 * encre), icône `+` à gauche, placeholder « Ajouter une tâche… ».
 *
 * À droite, un mini-bouton calendrier ouvre un sélecteur de date natif
 * (`<input type="date">`, le plus simple en l'absence de DatePicker shadcn).
 * La date choisie s'affiche en badge supprimable. À la création, on envoie le
 * titre + la date (ou rien).
 */
type AddTaskBarProps = {
  /** Ajoute une tâche, avec une échéance optionnelle. */
  onAdd: (title: string, dueDate?: Date) => void
  /** Désactive le champ pendant une mutation en cours. */
  disabled?: boolean
}

const TITLE_MAX = 120

/** Parse « yyyy-mm-dd » en `Date` (minuit UTC, stable au format ISO). */
function parseDateInput(value: string): Date {
  return new Date(value)
}

function AddTaskBar({ onAdd, disabled = false }: AddTaskBarProps) {
  const [title, setTitle] = useState("")
  // Échéance au format « yyyy-mm-dd » (valeur d'un <input type="date">).
  const [due, setDue] = useState("")
  const dateInputRef = useRef<HTMLInputElement>(null)
  const trimmed = title.trim()

  function openDatePicker() {
    const el = dateInputRef.current
    if (!el) return
    // showPicker() (navigateurs récents) ; sinon focus déclenche l'ouverture.
    if (typeof el.showPicker === "function") el.showPicker()
    else el.focus()
  }

  function submit() {
    if (!trimmed) return
    onAdd(trimmed, due ? parseDateInput(due) : undefined)
    setTitle("")
    setDue("")
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-sauge px-3 shadow-riso-ink focus-within:shadow-riso-sauge"
    >
      <Plus className="size-5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
      <input
        type="text"
        value={title}
        disabled={disabled}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ajouter une tâche…"
        maxLength={TITLE_MAX}
        aria-label="Ajouter une tâche"
        className="h-12 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-body placeholder:text-ink/55 disabled:opacity-50"
      />

      {/* Badge de la date choisie — supprimable. */}
      {due && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border-[1.5px] border-ink bg-paper-light px-1.5 py-[3px] font-display text-[10px] uppercase leading-none text-ink-soft">
          {getDueLabel(due)}
          <button
            type="button"
            onClick={() => setDue("")}
            disabled={disabled}
            aria-label="Retirer l’échéance"
            className="-mr-0.5 inline-flex items-center justify-center rounded-[3px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <X className="size-3" strokeWidth={3} aria-hidden />
          </button>
        </span>
      )}

      {/* Bouton calendrier + input date natif (masqué, ouvert via le bouton). */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={openDatePicker}
          disabled={disabled}
          aria-label="Choisir une échéance"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-50",
            due && "text-brique",
          )}
        >
          <CalendarPlus className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={due}
          disabled={disabled}
          onChange={(e) => setDue(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute bottom-0 right-0 size-0 opacity-0"
        />
      </div>
    </form>
  )
}

export { AddTaskBar }
