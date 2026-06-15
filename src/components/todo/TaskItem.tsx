import { AddedByMarker } from "@/components/ui/added-by-marker"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { cn } from "@/lib/utils"

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
 * ÉTAPE COURANTE : affichage de base uniquement. Les états « en retard » (§2.5)
 * et « fait » (§2.6) — bordure brique, line-through, etc. — arrivent plus tard.
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
}

function TaskItem({
  id,
  title,
  dueDate,
  isDone = false,
  member,
  onToggle,
}: TaskItemProps) {
  return (
    <li className="rounded-[10px] border-2 border-ink bg-paper-light p-2">
      <div className="flex items-center gap-1">
        <RisoCheckbox
          checked={isDone}
          onCheckedChange={(next) => onToggle(id, next)}
          aria-label={isDone ? `Décocher ${title}` : `Cocher ${title}`}
        />

        {/* Titre — Hanken 14px 500 */}
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium leading-tight text-ink">
          {title}
        </p>

        {/* Échéance, si présente */}
        {dueDate && <DueBadge date={dueDate} />}

        {/* Marqueur « ajouté par » */}
        <AddedByMarker
          color={member?.color ?? null}
          name={member?.name}
          className="ml-0.5 mr-1"
        />
      </div>
    </li>
  )
}

export { TaskItem }
