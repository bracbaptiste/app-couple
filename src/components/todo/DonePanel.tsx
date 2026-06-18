"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

import { TaskItem } from "./TaskItem"
import type { TaskView, TodoMemberView } from "./TodoListView"

/**
 * DonePanel — section « Fait » repliable, en bas d'une to-do list
 * (DESIGN_SYSTEM_V2 §2.8).
 *
 * En-tête : bandeau encre (style `category-title` V1), label « Fait » en
 * Silkscreen 15px paper, compteur `×N ✓` en sauge à droite. C'est un bouton :
 * il replie/déplie le contenu.
 *
 * Contenu : les tâches faites passées en props (10 plus récentes, triées
 * `done_at desc` côté serveur), rendues via {@link TaskItem} en mode « fait »
 * (titre barré, opacité atténuée, DueBadge masqué). En bas, un lien discret
 * vers l'historique complet (Profil > Historique).
 *
 * État initial : replié si ≥ 3 tâches faites, ouvert sinon.
 */
type DonePanelProps = {
  /** Tâches faites (is_done = true), déjà triées par `done_at` décroissant. */
  tasks: TaskView[]
  /** Membres du couple, pour le marqueur « ajouté par ». */
  membersById: Map<string, TodoMemberView>
  /** Décoche une tâche (la renvoie dans les tâches à faire). */
  onToggle: (id: string, next: boolean) => void
  /** Modifie une tâche faite (intitulé · note · échéance) (optionnel). */
  onEdit?: (
    id: string,
    patch: { title: string; note: string | null; dueDate: string | null },
  ) => void
  /** Supprime une tâche faite (optionnel). */
  onDelete?: (id: string) => void
}

export function DonePanel({
  tasks,
  membersById,
  onToggle,
  onEdit,
  onDelete,
}: DonePanelProps) {
  // Replié par défaut quand la section est « chargée » (≥ 3 faites), pour ne pas
  // noyer les tâches à faire ; ouvert si 1-2 (visuel rassurant « tu avances »).
  const [open, setOpen] = useState(tasks.length < 3)

  // Pas de tâche faite → pas de section (évite un bandeau « Fait » vide).
  if (tasks.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      {/* En-tête bandeau encre, cliquable (replie / déplie). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 rounded-[6px] bg-ink px-3 py-1.5 text-paper outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
      >
        <h4 className="font-display text-[15px] uppercase leading-none">Fait</h4>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-sauge">
            ×{tasks.length} ✓
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-sauge transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
            strokeWidth={2.5}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <>
          <ul className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskItem
                key={task.id}
                id={task.id}
                title={task.title}
                note={task.note}
                dueDate={task.dueDate}
                isDone
                member={
                  task.addedBy ? membersById.get(task.addedBy) ?? null : null
                }
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>

          {/* Lien vers l'historique complet (au-delà des 10 récentes). */}
          <Link
            href="/profile/history"
            className="self-center rounded-[6px] px-2 py-1 font-body text-[12px] text-ink-soft underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Voir l’historique →
          </Link>
        </>
      )}
    </section>
  )
}
