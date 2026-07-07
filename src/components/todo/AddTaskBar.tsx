"use client"

import { Plus, SlidersHorizontal, X } from "lucide-react"
import { useRef, useState } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoDatePicker } from "@/components/ui/riso-date-picker"
import { cn } from "@/lib/utils"
import { getDueLabel } from "@/lib/hooks/useTaskState"
import { type Recurrence, NO_RECURRENCE } from "@/lib/tasks/recurrence"

import { TaskOptionsFields } from "./TaskOptionsFields"

/** Membre du couple proposé comme assigné. */
type AddTaskMember = { id: string; name: string; color: "sauge" | "brique" }

/** Options d'une tâche créée (échéance · assigné · récurrence). */
export type AddTaskOptions = {
  dueDate?: Date
  assignedTo: string | null
  recurrence: Recurrence
}

/**
 * AddTaskBar — champ d'ajout de tâche d'une to-do list (DESIGN_SYSTEM_V2 §2.7).
 *
 * Reprend l'`add-bar` V1 (fond sauge, bordure 2px encre, radius 10, ombre
 * encre), icône `+` à gauche, placeholder « Ajouter une tâche… ».
 *
 * La barre reste minimale : le champ, puis UN SEUL bouton « réglages » (icône
 * curseurs) au bout. Ce bouton déplie sous la barre un unique panneau qui
 * regroupe toutes les options d'une tâche — ÉCHÉANCE (via {@link RisoDatePicker}),
 * ASSIGNÉ et RÉCURRENCE (PRD §3.3, §3.4) — et un bouton « Ajouter » pour valider
 * sans revenir au champ.
 *
 * L'assigné par défaut est porté par l'écran (`defaultAssignee` : non assigné
 * pour une liste partagée, le propriétaire pour une liste perso) ; échéance,
 * assigné et récurrence sont remis à leur défaut après chaque ajout.
 */
type AddTaskBarProps = {
  /** Ajoute une tâche, avec ses options (échéance · assigné · récurrence). */
  onAdd: (title: string, opts: AddTaskOptions) => void
  /** Désactive le champ pendant une mutation en cours. */
  disabled?: boolean
  /** Membres du couple (pour le sélecteur d'assigné). */
  members: AddTaskMember[]
  /** Assigné par défaut à la création (null = non assigné). */
  defaultAssignee: string | null
}

const TITLE_MAX = 120

/** Parse « yyyy-mm-dd » en `Date` (minuit UTC, stable au format ISO). */
function parseDateInput(value: string): Date {
  return new Date(value)
}

function AddTaskBar({
  onAdd,
  disabled = false,
  members,
  defaultAssignee,
}: AddTaskBarProps) {
  const [title, setTitle] = useState("")
  // Échéance au format « yyyy-mm-dd » (valeur du RisoDatePicker).
  const [due, setDue] = useState("")
  const [assignedTo, setAssignedTo] = useState<string | null>(defaultAssignee)
  const [recurrence, setRecurrence] = useState<Recurrence>(NO_RECURRENCE)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = title.trim()

  /** Remet les options à leur défaut après un ajout. */
  function resetOptions() {
    setDue("")
    setAssignedTo(defaultAssignee)
    setRecurrence(NO_RECURRENCE)
  }

  /** Émet l'ajout avec les options courantes, puis réinitialise le formulaire. */
  function emit(name: string, dueValue: string) {
    onAdd(name, {
      dueDate: dueValue ? parseDateInput(dueValue) : undefined,
      assignedTo,
      recurrence,
    })
    setTitle("")
    resetOptions()
    // Panneau refermé après un ajout : on repart sur une barre nette.
    setOptionsOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function submit() {
    if (!trimmed) return
    emit(trimmed, due)
  }

  return (
    <div className="flex flex-col gap-2">
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

        {/* Bouton unique « réglages » : regroupe échéance + assigné + récurrence. */}
        <button
          type="button"
          onClick={() => setOptionsOpen((v) => !v)}
          aria-expanded={optionsOpen}
          aria-label="Options de la tâche (échéance, assigné, récurrence)"
          disabled={disabled}
          className={cn(
            "relative inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] border-2 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-50",
            optionsOpen
              ? "border-ink bg-ink text-paper"
              : "border-transparent text-ink hover:border-ink hover:bg-paper-light",
          )}
        >
          <SlidersHorizontal className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      </form>

      {/* Panneau unique : échéance + assigné + récurrence + bouton d'ajout. */}
      {optionsOpen && (
        <div className="flex flex-col gap-3 rounded-[10px] border-2 border-ink bg-paper-light p-3">
          {/* ---- Échéance (le calendrier, désormais dans le panneau) ---- */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Échéance
            </span>
            <div className="flex items-center gap-2">
              <RisoDatePicker
                value={due}
                onChange={setDue}
                size="sm"
                disabled={disabled}
              />
              {due ? (
                <span className="inline-flex items-center gap-1 rounded-[4px] border-[1.5px] border-ink bg-paper-light px-1.5 py-[3px] font-display text-[10px] uppercase leading-none text-ink-soft">
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
              ) : (
                <span className="font-body text-[13px] text-ink-soft">
                  Aucune
                </span>
              )}
            </div>
          </div>

          {/* ---- Assigné + récurrence ---- */}
          <TaskOptionsFields
            members={members}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            recurrence={recurrence}
            onRecurrenceChange={setRecurrence}
            dueDate={due || null}
            disabled={disabled}
          />

          {/* Validation depuis le panneau (sans revenir au champ). */}
          <div className="flex justify-end">
            <RisoButton
              type="button"
              size="sm"
              onClick={submit}
              disabled={disabled || !trimmed}
            >
              Ajouter
            </RisoButton>
          </div>
        </div>
      )}
    </div>
  )
}

export { AddTaskBar }
