import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { getDoneAgoLabel } from "@/lib/hooks/useTaskState"

/** Une tâche faite, aplatie pour le rendu de l'historique. */
type HistoryTask = {
  id: string
  title: string
  listName: string
  doneAt: string
}

/** Un groupe mensuel de tâches faites (le plus récent en premier). */
type MonthGroup = {
  /** Clé stable « yyyy-mm » (tri / `key` React). */
  key: string
  /** En-tête lisible, ex. « JUIN 2026 ». */
  label: string
  tasks: HistoryTask[]
}

/** Formate « juin 2026 » (mois en toutes lettres + année). */
const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
})

/**
 * Regroupe les tâches (déjà triées `done_at` desc) par mois de réalisation, en
 * conservant l'ordre d'arrivée — donc les mois les plus récents d'abord, et les
 * tâches les plus récentes en tête de chaque mois.
 */
function groupByMonth(tasks: HistoryTask[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  const byKey = new Map<string, MonthGroup>()

  for (const task of tasks) {
    const d = new Date(task.doneAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        label: monthFormatter.format(d).toUpperCase(),
        tasks: [],
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.tasks.push(task)
  }

  return groups
}

/**
 * Historique des tâches (/profile/history).
 *
 * Lecture seule (server component, sous RLS) : toutes les tâches faites des
 * listes accessibles (partagées du couple + perso de l'utilisateur), les 50
 * plus récentes, regroupées par mois (DESIGN_SYSTEM_V2 §2.9).
 *
 * Pas de (dé)cochage ici : l'historique est figé. Pour décocher une tâche
 * récente, on revient sur la to-do list (section « Fait »).
 */
export default async function TaskHistoryPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  // La RLS sur `tasks` (et la jointure `lists`) restreint déjà aux listes
  // accessibles : pas de filtre couple_id explicite ici (tasks n'en a pas).
  const { data } = await supabase
    .from("tasks")
    .select("id, title, done_at, lists(name)")
    .eq("is_done", true)
    .order("done_at", { ascending: false })
    .limit(50)

  const tasks: HistoryTask[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    listName: row.lists?.name ?? "Liste",
    doneAt: row.done_at ?? "",
  }))

  const groups = groupByMonth(tasks)

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
        <h1 className="mt-1 font-display text-xl uppercase text-ink">
          Historique des tâches
        </h1>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Aucune tâche faite pour l’instant. Coche des tâches dans tes to-do
          lists : tu les retrouveras ici.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2 className="border-b-2 border-ink pb-1.5 font-display text-[14px] uppercase leading-none text-ink">
                {group.label}
              </h2>
              <ul className="flex flex-col">
                {group.tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-start gap-2 border-b border-paper-deep py-2.5 last:border-b-0"
                  >
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-sauge"
                      strokeWidth={3}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-tight text-ink">
                        <span className="line-through">{task.title}</span>
                        <span className="text-ink-soft"> · {task.listName}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                        Fait {getDoneAgoLabel(task.doneAt)}
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
