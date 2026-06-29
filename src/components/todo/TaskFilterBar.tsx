"use client"

import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import type {
  DueFilter,
  PersonFilter,
  SortKey,
  StatusFilter,
} from "@/lib/tasks/task-controls"

import type { TodoMemberView } from "./TodoListView"

/**
 * TaskFilterBar — contrôles de tri & filtres d'une to-do list (PRD V2.1 §3.5).
 *
 * Panneau repliable (style cohérent avec DonePanel / TaskOptionsFields) : replié
 * par défaut pour ne pas alourdir l'écran ; le bandeau affiche le nombre de
 * filtres actifs. Une fois déplié, quatre groupes « segmentés » au Design System
 * Sauge & Brique : Trier · Personne · Statut · Échéance.
 *
 * Les filtres « Aujourd'hui » et « En retard » sont nos « rappels » dans
 * l'appli (calculés au jour près, fuseau Europe/Paris — cf. dueBucket).
 *
 * Composant purement présentationnel : il édite les valeurs reçues, toute la
 * logique de tri/filtrage vit dans `task-controls.ts`, appliquée par l'écran.
 */
type TaskFilterBarProps = {
  /** Membres du couple (pour les boutons « par personne », colorés sauge/brique). */
  members: TodoMemberView[]
  sort: SortKey
  onSortChange: (s: SortKey) => void
  person: PersonFilter
  onPersonChange: (p: PersonFilter) => void
  status: StatusFilter
  onStatusChange: (s: StatusFilter) => void
  due: DueFilter
  onDueChange: (d: DueFilter) => void
  /** Remet tous les filtres (et le tri) à leurs valeurs par défaut. */
  onReset: () => void
}

/** Étiquette d'un groupe de contrôles (« TRIER », « PERSONNE »…). */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
      {children}
    </span>
  )
}

/**
 * Bouton « segmenté » au style Riso (même rendu que TaskOptionsFields).
 * Sélectionné → fond encre/papier, ou couleur de personne via `tone`.
 */
function SegButton({
  selected,
  tone = "ink",
  onClick,
  children,
}: {
  selected: boolean
  tone?: "ink" | "sauge" | "brique"
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-[6px] border-2 border-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase leading-none tracking-wide outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px",
        selected
          ? tone === "sauge"
            ? "bg-sauge text-ink"
            : tone === "brique"
              ? "bg-brique text-paper-light"
              : "bg-ink text-paper"
          : "bg-paper-light text-ink-soft",
      )}
    >
      {children}
    </button>
  )
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "due", label: "Échéance" },
  { key: "manual", label: "Manuel" },
  { key: "assignee", label: "Personne" },
  { key: "created", label: "Ajout" },
]

const DUE_OPTIONS: { key: DueFilter; label: string }[] = [
  { key: "all", label: "Toutes" },
  { key: "today", label: "Aujourd'hui" },
  { key: "overdue", label: "En retard" },
  { key: "upcoming", label: "À venir" },
  { key: "none", label: "Sans date" },
]

export function TaskFilterBar({
  members,
  sort,
  onSortChange,
  person,
  onPersonChange,
  status,
  onStatusChange,
  due,
  onDueChange,
  onReset,
}: TaskFilterBarProps) {
  const [open, setOpen] = useState(false)

  // Nombre de filtres actifs (le tri n'est pas compté) : badge du bandeau.
  const activeCount =
    (person !== "all" ? 1 : 0) +
    (status !== "all" ? 1 : 0) +
    (due !== "all" ? 1 : 0)

  // Personnes proposées au filtre « par personne », dérivées des couleurs
  // réellement présentes dans le couple (sauge, puis brique).
  const sauge = members.find((m) => m.color === "sauge")
  const brique = members.find((m) => m.color === "brique")

  return (
    <section className="flex flex-col gap-2">
      {/* Bandeau repliable : ouvre/ferme le panneau de contrôles. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 rounded-[8px] border-2 border-ink bg-paper-light px-3 py-2 text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" strokeWidth={2.5} aria-hidden />
          <span className="font-display text-[13px] uppercase leading-none">
            Tri &amp; filtres
          </span>
          {activeCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full border-[1.5px] border-ink bg-brique px-1.5 font-mono text-[10px] font-bold leading-none text-paper-light">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 transition-transform",
            open ? "rotate-180" : "rotate-0",
          )}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 rounded-[10px] border-2 border-dashed border-ink bg-paper px-3 py-3">
          {/* ---- Trier ---- */}
          <div className="flex flex-col gap-1.5">
            <GroupLabel>Trier par</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {SORT_OPTIONS.map((o) => (
                <SegButton
                  key={o.key}
                  selected={sort === o.key}
                  onClick={() => onSortChange(o.key)}
                >
                  {o.label}
                </SegButton>
              ))}
            </div>
          </div>

          {/* ---- Personne (assigné) ---- */}
          {(sauge || brique) && (
            <div className="flex flex-col gap-1.5">
              <GroupLabel>Personne</GroupLabel>
              <div className="flex flex-wrap gap-1.5">
                <SegButton
                  selected={person === "all"}
                  onClick={() => onPersonChange("all")}
                >
                  Tous
                </SegButton>
                {sauge && (
                  <SegButton
                    selected={person === "sauge"}
                    tone="sauge"
                    onClick={() => onPersonChange("sauge")}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-ink bg-sauge"
                    />
                    {sauge.name}
                  </SegButton>
                )}
                {brique && (
                  <SegButton
                    selected={person === "brique"}
                    tone="brique"
                    onClick={() => onPersonChange("brique")}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-2.5 shrink-0 rounded-full border-[1.5px] border-ink bg-brique"
                    />
                    {brique.name}
                  </SegButton>
                )}
              </div>
            </div>
          )}

          {/* ---- Statut ---- */}
          <div className="flex flex-col gap-1.5">
            <GroupLabel>Statut</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              <SegButton
                selected={status === "all"}
                onClick={() => onStatusChange("all")}
              >
                Tous
              </SegButton>
              <SegButton
                selected={status === "todo"}
                onClick={() => onStatusChange("todo")}
              >
                À faire
              </SegButton>
              <SegButton
                selected={status === "done"}
                onClick={() => onStatusChange("done")}
              >
                Fait
              </SegButton>
            </div>
          </div>

          {/* ---- Échéance (nos « rappels ») ---- */}
          <div className="flex flex-col gap-1.5">
            <GroupLabel>Échéance</GroupLabel>
            <div className="flex flex-wrap gap-1.5">
              {DUE_OPTIONS.map((o) => (
                <SegButton
                  key={o.key}
                  selected={due === o.key}
                  onClick={() => onDueChange(o.key)}
                >
                  {o.label}
                </SegButton>
              ))}
            </div>
          </div>

          {/* Réinitialiser : visible seulement si un filtre est actif. */}
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 self-start rounded-[6px] px-1 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <RotateCcw className="size-3.5" strokeWidth={2.5} aria-hidden />
              Réinitialiser
            </button>
          )}
        </div>
      )}
    </section>
  )
}
