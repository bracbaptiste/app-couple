"use client"

import { MoreHorizontal, Trash2 } from "lucide-react"
import { useState } from "react"

import { AddedByMarker } from "@/components/ui/added-by-marker"
import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { cn } from "@/lib/utils"
import { getTaskState } from "@/lib/hooks/useTaskState"

import { DueBadge } from "./DueBadge"

/** Identité d'un membre du couple (pour le marqueur « ajouté par »). */
type TaskMember = {
  name: string
  color: "sauge" | "brique"
}

/**
 * TaskItem — une ligne de tâche d'une to-do list (DESIGN_SYSTEM_V2 §2.3).
 *
 * Structure : case à cocher · titre · DueBadge (si échéance) · marqueur
 * « ajouté par ».
 *
 * État « en retard » (§2.5) : quand `getTaskState` vaut `overdue`, on applique
 * une bordure gauche brique et un titre brique 600.
 *
 * État « fait » (§2.6) : titre barré, ligne atténuée (opacité 0.55) et DueBadge
 * masqué (peu pertinent une fois la tâche faite). C'est le rendu utilisé dans
 * la section « Fait » (DonePanel, §2.8).
 */
type TaskItemProps = {
  /** Identifiant de la tâche (remonté à `onToggle`). */
  id: string
  /** Intitulé de la tâche. */
  title: string
  /** Échéance optionnelle (ISO ou Date). */
  dueDate?: string | Date | null
  /** État coché de la tâche. */
  isDone?: boolean
  /** Membre ayant ajouté la tâche, ou `null` si inconnu. */
  member?: TaskMember | null
  /** Demande le (dé)cochage au parent (qui persiste en base). */
  onToggle: (id: string, next: boolean) => void
  /** Demande la suppression au parent. Omis = pas de bouton « … » / suppression. */
  onDelete?: (id: string) => void
}

function TaskItem({
  id,
  title,
  dueDate,
  isDone = false,
  member,
  onToggle,
  onDelete,
}: TaskItemProps) {
  // `getTaskState` renvoie « done » dès que la tâche est cochée : un overdue
  // coché n'est donc jamais marqué overdue (pas de bordure brique sur un « fait »).
  const isOverdue =
    getTaskState({ isDone, dueDate: dueDate ?? null }) === "overdue"

  // null = fermé ; "menu" = options ; "delete" = confirmation de suppression.
  const [mode, setMode] = useState<null | "menu" | "delete">(null)

  return (
    <li
      className={cn(
        "rounded-[10px] border-2 border-ink bg-paper-light p-2",
        isOverdue && "border-l-[6px] border-l-brique",
        isDone && "opacity-55",
      )}
    >
      <div className="flex items-center gap-1">
        <RisoCheckbox
          checked={isDone}
          onCheckedChange={(next) => onToggle(id, next)}
          aria-label={isDone ? `Décocher ${title}` : `Cocher ${title}`}
        />

        {/* Titre — Hanken 14px 500 (600 + brique si en retard §2.5 ; barré si fait §2.6) */}
        <p
          className={cn(
            "min-w-0 flex-1 truncate text-[14px] leading-tight",
            isDone
              ? "font-medium text-ink line-through"
              : isOverdue
                ? "font-semibold text-brique"
                : "font-medium text-ink",
          )}
        >
          {title}
        </p>

        {/* Échéance, si présente — masquée une fois la tâche faite (§2.6) */}
        {dueDate && !isDone && <DueBadge date={dueDate} />}

        {/* Marqueur « ajouté par » */}
        <AddedByMarker
          color={member?.color ?? null}
          name={member?.name}
          className="ml-0.5 mr-1"
        />

        {/* Menu « … » (seulement si la suppression est câblée) */}
        {onDelete && (
          <button
            type="button"
            aria-label="Options de la tâche"
            aria-expanded={mode !== null}
            onClick={() => setMode((m) => (m === null ? "menu" : null))}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
          >
            <MoreHorizontal className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {/* Panneau « options » : pour l'instant, juste la suppression. */}
      {onDelete && mode === "menu" && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t-2 border-dashed border-ink pt-2">
          <RisoButton
            variant="ghost"
            size="sm"
            onClick={() => setMode("delete")}
          >
            <Trash2 aria-hidden /> Supprimer
          </RisoButton>
        </div>
      )}

      {/* Confirmation de suppression. */}
      {onDelete && mode === "delete" && (
        <div className="mt-2 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2">
          <p className="text-[12px] leading-snug text-ink">
            Supprimer « {title} » ?
          </p>
          <div className="flex gap-1.5">
            <RisoButton
              size="sm"
              onClick={() => {
                onDelete(id)
                setMode(null)
              }}
            >
              Confirmer
            </RisoButton>
            <RisoButton
              variant="ghost"
              size="sm"
              onClick={() => setMode(null)}
            >
              Annuler
            </RisoButton>
          </div>
        </div>
      )}
    </li>
  )
}

export { TaskItem }
