"use client"

import { ChevronDown, Plus, Repeat, SlidersHorizontal, X } from "lucide-react"
import { useRef, useState } from "react"

import { RisoDatePicker } from "@/components/ui/riso-date-picker"
import { cn } from "@/lib/utils"
import { getDueLabel } from "@/lib/hooks/useTaskState"
import { type Recurrence, NO_RECURRENCE } from "@/lib/tasks/recurrence"

import { TaskOptionsFields } from "./TaskOptionsFields"
import { VoiceAddTask } from "./VoiceAddTask"

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
 * À droite, un mini-bouton calendrier ouvre le `RisoDatePicker` (calendrier
 * maison aux couleurs de l'appli). La date choisie s'affiche en badge
 * supprimable. À la création, on envoie le titre + la date (ou rien). Sur
 * mobile, choisir une date alors qu'un nom est saisi enregistre directement la
 * tâche (le calendrier étant la dernière étape).
 *
 * Sous la barre, un volet repliable « Options » expose l'ASSIGNÉ et la
 * RÉCURRENCE (PRD §3.3, §3.4). L'assigné par défaut est porté par l'écran
 * (`defaultAssignee` : non assigné pour une liste partagée, le propriétaire
 * pour une liste perso) ; il est remis à ce défaut après chaque ajout.
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
  /** Toutes les to-do lists du couple (sélecteur de liste cible de l'ajout vocal). */
  lists: { id: string; name: string }[]
  /** Liste affichée — liste cible par défaut de l'ajout vocal. */
  currentListId: string
  /** Ajoute une tâche par la voix sur la liste choisie (chemin d'insertion normal). */
  onVoiceAdd: (listId: string, title: string, opts: AddTaskOptions) => void
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
  lists,
  currentListId,
  onVoiceAdd,
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
  }

  function submit() {
    if (!trimmed) return
    emit(trimmed, due)
  }

  // Récap visible quand le volet est replié mais que des options non neutres
  // sont définies : pastille d'assigné + indicateur de récurrence.
  const assignee = assignedTo
    ? members.find((m) => m.id === assignedTo) ?? null
    : null
  const isRecurring = recurrence.type !== "none"

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

        {/* Ajout vocal : micro → dictée native du clavier → écran de validation. */}
        <VoiceAddTask
          lists={lists}
          currentListId={currentListId}
          members={members}
          defaultAssignee={defaultAssignee}
          disabled={disabled}
          onConfirm={onVoiceAdd}
        />

        {/* Calendrier maison aux couleurs de l'appli (remplace le picker natif). */}
        <RisoDatePicker
          value={due}
          onChange={(v) => {
            // Si une date est choisie et qu'un nom est déjà saisi, on enregistre
            // directement la tâche (le calendrier étant la dernière étape sur mobile).
            if (v && trimmed) {
              emit(trimmed, v)
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

      {/* Volet « Options » repliable : assigné + récurrence. */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOptionsOpen((v) => !v)}
          aria-expanded={optionsOpen}
          disabled={disabled}
          className="inline-flex items-center gap-2 self-start rounded-[8px] px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px disabled:opacity-50"
        >
          <SlidersHorizontal className="size-3.5" strokeWidth={2.5} aria-hidden />
          Options
          {/* Récap des options définies (volet replié). */}
          {!optionsOpen && assignee && (
            <span
              aria-hidden
              className={cn(
                "inline-block size-2.5 rounded-full border-[1.5px] border-ink",
                assignee.color === "sauge" ? "bg-sauge" : "bg-brique",
              )}
            />
          )}
          {!optionsOpen && isRecurring && (
            <Repeat className="size-3" strokeWidth={2.5} aria-hidden />
          )}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              optionsOpen ? "rotate-180" : "rotate-0",
            )}
            strokeWidth={2.5}
            aria-hidden
          />
        </button>

        {optionsOpen && (
          <div className="rounded-[10px] border-2 border-ink bg-paper-light p-3">
            <TaskOptionsFields
              members={members}
              assignedTo={assignedTo}
              onAssignedToChange={setAssignedTo}
              recurrence={recurrence}
              onRecurrenceChange={setRecurrence}
              dueDate={due || null}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export { AddTaskBar }
