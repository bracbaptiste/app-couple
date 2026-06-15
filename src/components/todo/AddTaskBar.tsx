"use client"

import { Plus } from "lucide-react"
import { useState } from "react"

/**
 * AddTaskBar — champ d'ajout de tâche d'une to-do list (DESIGN_SYSTEM_V2 §2.7).
 *
 * Reprend l'`add-bar` V1 (fond sauge, bordure 2px encre, radius 10, ombre
 * encre), icône `+` à gauche, placeholder « Ajouter une tâche… ».
 *
 * ÉTAPE COURANTE : champ texte seul. Le mini-bouton calendrier (échéance
 * optionnelle, §2.7) arrive plus tard — d'où la signature `onAdd(title, dueDate?)`
 * déjà prête à recevoir une date.
 */
type AddTaskBarProps = {
  /** Ajoute une tâche. `dueDate` est réservé pour l'étape « échéance ». */
  onAdd: (title: string, dueDate?: Date) => void
  /** Désactive le champ pendant une mutation en cours. */
  disabled?: boolean
}

const TITLE_MAX = 120

function AddTaskBar({ onAdd, disabled = false }: AddTaskBarProps) {
  const [title, setTitle] = useState("")
  const trimmed = title.trim()

  function submit() {
    if (!trimmed) return
    onAdd(trimmed)
    setTitle("")
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
    </form>
  )
}

export { AddTaskBar }
