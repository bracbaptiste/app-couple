"use client"

import { X } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoDatePicker } from "@/components/ui/riso-date-picker"
import { cn } from "@/lib/utils"
import { getDueLabel } from "@/lib/hooks/useTaskState"
import {
  type Recurrence,
  NO_RECURRENCE,
  normalizeRecurrence,
} from "@/lib/tasks/recurrence"
import { type BrainAction } from "@/lib/brain/command-parsing"

import { type AddTaskOptions } from "./AddTaskBar"
import { TaskOptionsFields } from "./TaskOptionsFields"

/**
 * TaskReviewSheet — l'ÉCRAN DE VALIDATION de tâche V2.1 (PRD-taches-v2.1 §3.2),
 * extrait tel quel de {@link VoiceAddTask} pour être RÉUTILISÉ (PRD V4 §5.2 :
 * `taches.ajouter` = niveau 2 → « écran de validation V2.1 existant, pré-rempli »).
 *
 * Deux points d'entrée le montent, à l'identique :
 *   - le mic de la to-do ({@link VoiceAddTask}), après dictée + parsing ;
 *   - le Cerveau ({@link BrainListening}), pour une action `taches.ajouter`.
 *
 * Rien n'est écrit avant que l'utilisateur ne confirme (garde-fou §3.2 / §6
 * niveau 2). Tous les champs — titre, échéance, récurrence, assigné, liste cible
 * — restent corrigeables. L'état interne est initialisé depuis `initial` à chaque
 * MONTAGE : le parent doit monter/démonter (ou `key`er) pour repartir vierge.
 */

/** Membre du couple proposé comme assigné. */
export type ReviewMember = { id: string; name: string; color: "sauge" | "brique" }

/** Une to-do list cible (sélecteur « liste »). */
export type ReviewListOption = { id: string; name: string }

const TITLE_MAX = 120

/** Valeurs de pré-remplissage de l'écran (déjà validées côté serveur). */
export type TaskReviewInitial = {
  title: string
  /** « yyyy-mm-dd » | "" */
  due: string
  recurrence: Recurrence
  assignedTo: string | null
  listId: string
}

/**
 * Convertit une action `taches.ajouter` (issue du routeur, §5.3) en valeurs de
 * pré-remplissage de l'écran V2.1. Les ids sont déjà validés serveur ; on ne
 * garde ici que ce qui existe VRAIMENT dans le contexte client (défense en
 * profondeur), avec repli sur les défauts fournis.
 */
export function taskActionToInitial(
  a: Extract<BrainAction, { intent: "taches.ajouter" }>,
  opts: {
    lists: ReviewListOption[]
    members: ReviewMember[]
    defaultListId: string
    defaultAssignee: string | null
  },
): TaskReviewInitial {
  const recurrence = a.recurrence
    ? normalizeRecurrence({
        type: a.recurrence.type,
        interval: a.recurrence.interval,
        weekday: a.recurrence.weekday,
        dayOfMonth: a.recurrence.day_of_month,
      })
    : { ...NO_RECURRENCE }

  const assignedTo =
    a.assigne_profile_id &&
    opts.members.some((m) => m.id === a.assigne_profile_id)
      ? a.assigne_profile_id
      : opts.defaultAssignee

  const listId =
    a.liste_id && opts.lists.some((l) => l.id === a.liste_id)
      ? a.liste_id
      : opts.defaultListId

  return {
    title: a.titre.slice(0, TITLE_MAX),
    due: a.due_date ?? "",
    recurrence,
    assignedTo,
    listId,
  }
}

type Props = {
  /** Contrôle l'affichage (monté quand vrai). */
  open: boolean
  /** Ferme sans écrire. */
  onClose: () => void
  /** Valeurs pré-remplies (appliquées au montage). */
  initial: TaskReviewInitial
  /** To-do lists du couple (sélecteur de liste cible). */
  lists: ReviewListOption[]
  /** Membres du couple (sélecteur d'assigné). */
  members: ReviewMember[]
  /** Crée la tâche sur la liste choisie (chemin d'insertion normal, RLS). */
  onConfirm: (listId: string, title: string, opts: AddTaskOptions) => void
  /** Libellé du bouton de confirmation (défaut « Ajouter »). */
  confirmLabel?: string
}

export function TaskReviewSheet({
  open,
  onClose,
  initial,
  lists,
  members,
  onConfirm,
  confirmLabel = "Ajouter",
}: Props) {
  const [title, setTitle] = useState(initial.title)
  const [due, setDue] = useState(initial.due) // « yyyy-mm-dd » | ""
  const [recurrence, setRecurrence] = useState<Recurrence>(initial.recurrence)
  const [assignedTo, setAssignedTo] = useState<string | null>(initial.assignedTo)
  const [listId, setListId] = useState<string>(initial.listId)

  // Échap ferme le flux (cohérent avec le RisoDatePicker / VoiceAddTask).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onClose])

  function confirm() {
    const name = title.trim()
    if (!name || !listId) return
    onConfirm(listId, name, {
      // Comme AddTaskBar : « yyyy-mm-dd » → Date (minuit UTC, stable au format ISO).
      dueDate: due ? new Date(due) : undefined,
      assignedTo,
      recurrence,
    })
  }

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vérifier la tâche"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      {/* Voile encre */}
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />

      <div className="relative max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base uppercase leading-none text-ink">
            Vérifie la tâche
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
          >
            <X className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Titre */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="task-review-title"
              className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft"
            >
              Tâche
            </label>
            <input
              id="task-review-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              placeholder="Intitulé de la tâche"
              className="h-12 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base font-medium text-ink outline-none placeholder:text-ink-soft focus-visible:shadow-riso-sauge"
            />
          </div>

          {/* Échéance */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Échéance
            </span>
            <div className="flex items-center gap-2">
              {due ? (
                <span className="inline-flex items-center gap-1 rounded-[4px] border-[1.5px] border-ink bg-paper px-1.5 py-[3px] font-display text-[10px] uppercase leading-none text-ink-soft">
                  {getDueLabel(due)}
                  <button
                    type="button"
                    onClick={() => setDue("")}
                    aria-label="Retirer l’échéance"
                    className="relative -mr-0.5 inline-flex items-center justify-center rounded-[3px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                  >
                    <X className="size-3" strokeWidth={3} aria-hidden />
                  </button>
                </span>
              ) : (
                <span className="font-body text-[13px] text-ink-soft">Aucune</span>
              )}
              <RisoDatePicker
                value={due}
                onChange={setDue}
                size="sm"
                triggerLabel="Choisir une échéance"
              />
            </div>
          </div>

          {/* Assigné + récurrence : sélecteurs partagés. */}
          <TaskOptionsFields
            members={members}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            recurrence={recurrence}
            onRecurrenceChange={setRecurrence}
            dueDate={due || null}
          />

          {/* Liste cible */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Liste
            </span>
            {lists.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {lists.map((l) => {
                  const selected = listId === l.id
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setListId(l.id)}
                      className={cn(
                        "inline-flex min-h-9 items-center rounded-[6px] border-2 border-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase leading-none tracking-wide outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px",
                        selected
                          ? "bg-ink text-paper"
                          : "bg-paper-light text-ink-soft",
                      )}
                    >
                      {l.name}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="font-body text-[13px] text-ink-soft">
                Aucune to-do list disponible.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <RisoButton variant="ghost" size="sm" onClick={onClose}>
              Annuler
            </RisoButton>
            <RisoButton
              size="sm"
              onClick={confirm}
              disabled={!title.trim() || !listId}
            >
              {confirmLabel}
            </RisoButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
