import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import type { ReactNode } from "react"

import { getDoneAgoLabel } from "@/lib/hooks/useTaskState"

/**
 * Une entrée d'historique, aplatie pour le rendu : ce qui a été fait/acheté
 * (`label`), où (`context`, le nom de la liste) et quand (`at`, ISO).
 */
export type HistoryEntry = {
  id: string
  label: string
  context: string
  at: string
}

/** Un groupe mensuel d'entrées (le plus récent en premier). */
type MonthGroup = {
  /** Clé stable « yyyy-mm » (tri / `key` React). */
  key: string
  /** En-tête lisible, ex. « JUIN 2026 ». */
  label: string
  entries: HistoryEntry[]
}

/** Formate « juin 2026 » (mois en toutes lettres + année). */
const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
})

/**
 * Regroupe les entrées (déjà triées par date desc) par mois, en conservant
 * l'ordre d'arrivée — donc les mois les plus récents d'abord, et les entrées les
 * plus récentes en tête de chaque mois.
 */
function groupByMonth(entries: HistoryEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  const byKey = new Map<string, MonthGroup>()

  for (const entry of entries) {
    const d = new Date(entry.at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    let group = byKey.get(key)
    if (!group) {
      group = { key, label: monthFormatter.format(d).toUpperCase(), entries: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.entries.push(entry)
  }

  return groups
}

type HistoryViewProps = {
  /** Titre de l'écran, ex. « Historique des tâches ». */
  title: string
  /** Entrées déjà triées par date décroissante. */
  entries: HistoryEntry[]
  /** Icône de ligne (déjà stylée par l'appelant : taille, couleur, épaisseur). */
  icon: ReactNode
  /** Préfixe du libellé temporel, ex. « Fait » / « Acheté ». */
  agoPrefix: string
  /** Message d'état vide. */
  emptyMessage: string
}

/**
 * HistoryView — écran d'historique figé (lecture seule), partagé par
 * l'historique des tâches faites et celui des achats (DESIGN_SYSTEM_V2 §2.9).
 *
 * Retour vers le Profil, titre, puis les entrées regroupées par mois. Chaque
 * ligne dit CE QUI a été fait/acheté, OÙ (le nom de la liste) et QUAND.
 */
export function HistoryView({
  title,
  entries,
  icon,
  agoPrefix,
  emptyMessage,
}: HistoryViewProps) {
  const groups = groupByMonth(entries)

  return (
    <section className="mx-auto w-full max-w-sm">
      <div className="mb-4">
        {/* Retour vers le Profil : cible tap 44px, aligné au bord gauche. */}
        <Link
          href="/profile"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Profil
        </Link>
        <h1 className="mt-1 font-display text-xl uppercase text-ink">{title}</h1>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          {emptyMessage}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2 className="border-b-2 border-ink pb-1.5 font-display text-[14px] uppercase leading-none text-ink">
                {group.label}
              </h2>
              <ul className="flex flex-col">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-2 border-b border-paper-deep py-2.5 last:border-b-0"
                  >
                    {icon}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-tight text-ink">
                        <span className="line-through">{entry.label}</span>
                        <span className="text-ink-soft"> · {entry.context}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                        {agoPrefix} {getDoneAgoLabel(entry.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
