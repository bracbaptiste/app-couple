"use client"

import { Plus, X } from "lucide-react"
import { useRef, useState } from "react"

import { RisoDatePicker } from "@/components/ui/riso-date-picker"
import { getDueLabel } from "@/lib/hooks/useTaskState"

/**
 * AddTaskBar — champ d'ajout de tâche d'une to-do list (DESIGN_SYSTEM_V2 §2.7).
 *
 * Reprend l'`add-bar` V1 (fond sauge, bordure 2px encre, radius 10, ombre
 * encre), icône `+` à gauche, placeholder « Ajouter une tâche… ».
 *
 * À droite, un mini-bouton calendrier ouvre le `RisoDatePicker` (calendrier
 * maison aux couleurs de l'appli). La date choisie s'affiche en badge
 * supprimable. À la création, on envoie le titre + la date (ou rien). Sur
 * mobile, choisir une date alors qu'un nom est saisi enregistre directement la
 * tâche (le calendrier étant la dernière étape).
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
  // Échéance au format « yyyy-mm-dd » (valeur du RisoDatePicker).
  const [due, setDue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = title.trim()

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
        ref={inputRef}
        type="text"
        value={title}
        disabled={disabled}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ajouter une tâche…"
        maxLength={TITLE_MAX}
        aria-label="Ajouter une tâche"
        className="h-12 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-body placeholder:text-ink-soft disabled:opacity-50"
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
            className="relative -mr-0.5 inline-flex items-center justify-center rounded-[3px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
          >
            <X className="size-3" strokeWidth={3} aria-hidden />
          </button>
        </span>
      )}

      {/* Calendrier maison aux couleurs de l'appli (remplace le picker natif). */}
      <RisoDatePicker
        value={due}
        onChange={(v) => {
          // Si une date est choisie et qu'un nom est déjà saisi, on enregistre
          // directement la tâche (le calendrier étant la dernière étape sur mobile).
          if (v && trimmed) {
            onAdd(trimmed, parseDateInput(v))
            setTitle("")
            setDue("")
            requestAnimationFrame(() => inputRef.current?.focus())
            return
          }
          setDue(v)
          // Sinon (nom vide), on rend le focus au champ pour qu'« Entrée » enregistre.
          requestAnimationFrame(() => inputRef.current?.focus())
        }}
        disabled={disabled}
      />
    </form>
  )
}

export { AddTaskBar }
