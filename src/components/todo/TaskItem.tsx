"use client"

import { Pencil, Trash2, X } from "lucide-react"
import { useState } from "react"

import { AddedByMarker } from "@/components/ui/added-by-marker"
import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { RisoDatePicker } from "@/components/ui/riso-date-picker"
import { RisoInput } from "@/components/ui/riso-input"
import { cn } from "@/lib/utils"
import { getDueLabel, getTaskState } from "@/lib/hooks/useTaskState"
import { useSwipeReveal } from "@/lib/hooks/useSwipeReveal"

import { DueBadge } from "./DueBadge"

/** Identité d'un membre du couple (pour le marqueur « ajouté par »). */
type TaskMember = {
  name: string
  color: "sauge" | "brique"
}

/** Patch d'édition d'une tâche (intitulé · note · échéance). */
type TaskEditPatch = {
  title: string
  note: string | null
  dueDate: string | null
}

/**
 * TaskItem — une ligne de tâche d'une to-do list (DESIGN_SYSTEM_V2 §2.3).
 *
 * Structure : case à cocher · titre (+ note en petits caractères) · DueBadge (si
 * échéance) · marqueur « ajouté par ».
 *
 * État « en retard » (§2.5) : quand `getTaskState` vaut `overdue`, on applique
 * une bordure gauche brique et un titre brique 600.
 *
 * État « fait » (§2.6) : titre barré, ligne atténuée (opacité 0.55) et DueBadge
 * masqué (peu pertinent une fois la tâche faite). C'est le rendu utilisé dans
 * la section « Fait » (DonePanel, §2.8).
 *
 * MODIFIER / SUPPRIMER (parité avec les tuiles de liste) : on glisse la ligne
 * vers la gauche pour révéler un crayon (modifier) et une corbeille (supprimer).
 * Plus de menu « … ». Le calque révélé reste accessible au clavier / lecteur
 * d'écran (boutons focusables ; recevoir le focus ouvre la ligne).
 */
type TaskItemProps = {
  /** Identifiant de la tâche (remonté aux callbacks). */
  id: string
  /** Intitulé de la tâche. */
  title: string
  /** Note libre optionnelle (affichée en petits caractères sous l'intitulé). */
  note?: string | null
  /** Échéance optionnelle (ISO « yyyy-mm-dd », ou Date). */
  dueDate?: string | Date | null
  /** État coché de la tâche. */
  isDone?: boolean
  /** Membre ayant ajouté la tâche, ou `null` si inconnu. */
  member?: TaskMember | null
  /** Demande le (dé)cochage au parent (qui persiste en base). */
  onToggle: (id: string, next: boolean) => void
  /** Demande la modification au parent. Omis = pas d'action « modifier ». */
  onEdit?: (id: string, patch: TaskEditPatch) => void
  /** Demande la suppression au parent. Omis = pas d'action « supprimer ». */
  onDelete?: (id: string) => void
}

/** Largeur révélée par le swipe : deux cibles tactiles de 64px (≥ 44px requis). */
const SWIPE_REVEAL = 128

const TITLE_MAX = 120
const NOTE_MAX = 200

/** Normalise une échéance (string ISO | Date | null) en « yyyy-mm-dd » | "". */
function toDateInputValue(due: string | Date | null | undefined): string {
  if (!due) return ""
  if (due instanceof Date) return due.toISOString().slice(0, 10)
  // Déjà au format « yyyy-mm-dd » côté serveur ; on tronque par sécurité.
  return due.slice(0, 10)
}

function TaskItem({
  id,
  title,
  note,
  dueDate,
  isDone = false,
  member,
  onToggle,
  onEdit,
  onDelete,
}: TaskItemProps) {
  // `getTaskState` renvoie « done » dès que la tâche est cochée : un overdue
  // coché n'est donc jamais marqué overdue (pas de bordure brique sur un « fait »).
  const isOverdue =
    getTaskState({ isDone, dueDate: dueDate ?? null }) === "overdue"

  // null = fermé ; "edit" = formulaire ; "delete" = confirmation de suppression.
  const [mode, setMode] = useState<null | "edit" | "delete">(null)

  // Champs du formulaire d'édition (initialisés à l'ouverture du mode "edit").
  const [editTitle, setEditTitle] = useState(title)
  const [editNote, setEditNote] = useState(note ?? "")
  const [editDue, setEditDue] = useState(toDateInputValue(dueDate))

  const canEdit = !!onEdit
  const canDelete = !!onDelete
  const hasActions = canEdit || canDelete

  // --- Swipe pour révéler les actions (crayon + corbeille) ----------------
  // Geste mutualisé (cf. useSwipeReveal) : la ligne glisse vers la gauche pour
  // découvrir le calque. Désengagé en mode édition / confirmation, ou s'il n'y
  // a aucune action.
  const {
    offset,
    setOffset,
    dragging,
    didDragRef,
    close: closeSwipe,
    swipeHandlers,
  } = useSwipeReveal({
    revealWidth: SWIPE_REVEAL,
    enabled: mode === null && hasActions,
  })

  function openEdit() {
    closeSwipe()
    setEditTitle(title)
    setEditNote(note ?? "")
    setEditDue(toDateInputValue(dueDate))
    setMode("edit")
  }

  function saveEdit() {
    const cleanTitle = editTitle.trim().slice(0, TITLE_MAX)
    if (!cleanTitle || !onEdit) return
    const cleanNote = editNote.trim().slice(0, NOTE_MAX)
    onEdit(id, {
      title: cleanTitle,
      note: cleanNote || null,
      dueDate: editDue || null,
    })
    setMode(null)
  }

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-[10px]",
        isDone && "opacity-55",
      )}
    >
      {/* Calque d'actions (Modifier + Supprimer), révélé par le glissement et
          accessible au clavier : recevoir le focus ouvre la ligne, le perdre la
          referme. */}
      {mode === null && hasActions && (
        <div
          // Bordure encre continue autour du calque révélé (haut/droite/bas
          // + coins droits arrondis) : prolonge le trait de la carte pour que
          // toute la rangée garde un contour encre fermé une fois ouverte.
          className="absolute inset-y-0 right-0 z-0 flex overflow-hidden rounded-r-[10px] border-y-2 border-r-2 border-ink"
          onFocus={() => setOffset(-SWIPE_REVEAL)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSwipe()
          }}
        >
          {canEdit && (
            <button
              type="button"
              aria-label={`Modifier ${title}`}
              onClick={openEdit}
              className="inline-flex w-16 items-center justify-center bg-sauge text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink"
            >
              <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              aria-label={`Supprimer ${title}`}
              onClick={() => {
                closeSwipe()
                setMode("delete")
              }}
              className="inline-flex w-16 items-center justify-center border-l-2 border-ink bg-brique text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper-light"
            >
              <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </div>
      )}

      {/* Carte au premier plan : glisse via translateX. `touch-pan-y` laisse le
          scroll vertical au navigateur et nous réserve l'horizontale. */}
      <div
        className={cn(
          "relative z-10 select-none touch-pan-y rounded-[10px] border-2 border-ink bg-paper-light p-2",
          isOverdue && "border-l-[6px] border-l-brique",
          // Une fois glissée, on carre le bord droit : son trait encre devient
          // une verticale franche, au contact du calque vert/brique, sans liseré
          // de papier dans l'arrondi (au repos, coins arrondis comme avant).
          (offset !== 0 || dragging) && "rounded-r-none",
          mode === null && hasActions
            ? dragging
              ? ""
              : "transition-transform duration-200 ease-out motion-reduce:transition-none"
            : "",
        )}
        style={
          mode === null ? { transform: `translateX(${offset}px)` } : undefined
        }
        {...swipeHandlers}
        onClickCapture={(e) => {
          // Click de fin de glissement : on l'avale (pas de cochage parasite).
          if (didDragRef.current) {
            e.preventDefault()
            e.stopPropagation()
            didDragRef.current = false
            return
          }
          // Tap sur une ligne déjà ouverte : on referme au lieu de cocher.
          if (offset !== 0) {
            e.preventDefault()
            e.stopPropagation()
            closeSwipe()
          }
        }}
      >
        {mode === "edit" ? (
          /* --- Mode modification (intitulé · note · échéance) --- */
          <div className="flex flex-col gap-2">
            <RisoInput
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              maxLength={TITLE_MAX}
              aria-label="Intitulé de la tâche"
              autoFocus
            />
            <RisoInput
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              maxLength={NOTE_MAX}
              placeholder="Note (optionnelle)…"
              aria-label="Note de la tâche"
            />

            {/* Échéance : badge supprimable + bouton calendrier (comme AddTaskBar). */}
            <div className="flex items-center gap-2">
              {editDue ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border-[1.5px] border-ink bg-paper-light px-1.5 py-[3px] font-display text-[10px] uppercase leading-none text-ink-soft">
                  {getDueLabel(editDue)}
                  <button
                    type="button"
                    onClick={() => setEditDue("")}
                    aria-label="Retirer l’échéance"
                    className="relative -mr-0.5 inline-flex items-center justify-center rounded-[3px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <X className="size-3" strokeWidth={3} aria-hidden />
                  </button>
                </span>
              ) : (
                <span className="font-mono text-[11px] text-ink-soft">
                  Pas d’échéance
                </span>
              )}
              {/* Calendrier maison aux couleurs de l'appli. */}
              <RisoDatePicker value={editDue} onChange={setEditDue} size="sm" />
            </div>

            <div className="flex gap-1.5">
              <RisoButton
                size="sm"
                disabled={!editTitle.trim()}
                onClick={saveEdit}
              >
                OK
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
        ) : mode === "delete" ? (
          /* --- Confirmation de suppression --- */
          <div className="flex flex-col gap-2">
            <p className="text-[12px] leading-snug text-ink">
              Supprimer « {title} » ?
            </p>
            <div className="flex gap-1.5">
              <RisoButton
                size="sm"
                onClick={() => {
                  onDelete?.(id)
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
        ) : (
          /* --- Mode lecture --- */
          <>
          <div className="flex items-center gap-1">
            <RisoCheckbox
              checked={isDone}
              onCheckedChange={(next) => onToggle(id, next)}
              aria-label={isDone ? `Décocher ${title}` : `Cocher ${title}`}
            />

            <div className="min-w-0 flex-1">
              {/* Titre — Hanken 14px 500 (600 + brique si en retard §2.5 ;
                  barré si fait §2.6) */}
              <p
                className={cn(
                  "line-clamp-2 text-[14px] leading-tight",
                  isDone
                    ? "font-medium text-ink line-through"
                    : isOverdue
                      ? "font-semibold text-brique"
                      : "font-medium text-ink",
                )}
              >
                {title}
              </p>
              {/* Note en petits caractères (parité avec un article de courses). */}
              {note && (
                <p className="truncate font-mono text-[11px] text-ink-soft">
                  {note}
                </p>
              )}
            </div>

            {/* Échéance, si présente — masquée une fois la tâche faite (§2.6) */}
            {dueDate && !isDone && <DueBadge date={dueDate} />}

            {/* Marqueur « ajouté par » */}
            <AddedByMarker
              color={member?.color ?? null}
              name={member?.name}
              className="ml-0.5 mr-1"
            />
          </div>

          {/* Repère de découvrabilité du swipe : languette encre sur le bord
              droit (même rendu que les tuiles de liste). Cliquable → ouvre le
              calque. aria-hidden + hors tabulation : le clavier passe par les
              boutons Modifier / Supprimer du calque, déjà focusables. */}
          {hasActions && offset === 0 && (
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setOffset(-SWIPE_REVEAL)}
              title="Afficher les actions (ou glisser la ligne vers la gauche)"
              className="absolute -right-0.5 top-1/2 z-10 inline-flex h-11 w-6 -translate-y-1/2 items-center justify-end outline-none"
            >
              <span aria-hidden className="block h-9 w-1.5 rounded-full bg-ink" />
            </button>
          )}
          </>
        )}
      </div>
    </li>
  )
}

export { TaskItem }
