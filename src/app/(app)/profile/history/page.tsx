import { Check } from "lucide-react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { HistoryView, type HistoryEntry } from "@/components/profile/HistoryView"

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
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, done_at, lists(name)")
    .eq("is_done", true)
    .is("deleted_at", null)
    .order("done_at", { ascending: false })
    .limit(50)

  if (error) throw new Error("Impossible de charger l'historique des tâches")

  const entries: HistoryEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    label: row.title,
    context: row.lists?.name ?? "Liste",
    at: row.done_at ?? "",
  }))

  return (
    <HistoryView
      title="Historique des tâches"
      entries={entries}
      agoPrefix="Fait"
      icon={
        <Check
          className="mt-0.5 size-4 shrink-0 text-sauge"
          strokeWidth={3}
          aria-hidden
        />
      }
      emptyMessage="Aucune tâche faite pour l’instant. Coche des tâches dans tes to-do lists : tu les retrouveras ici."
    />
  )
}
