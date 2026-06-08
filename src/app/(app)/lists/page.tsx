import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

import { ListsManager, type ListView } from "./lists-client"

/**
 * Hub des listes (/lists).
 *
 * Lecture (server component, sous RLS — on ne voit que les listes de son
 * couple) :
 *   - listes du couple (triées par position)
 *   - articles de ces listes (pour les décomptes coché/total + dernière activité)
 *
 * Les mutations (créer, renommer, supprimer) passent par les Server Actions de
 * `./actions.ts`.
 */
export default async function ListsPage() {
  const { profile } = await requireAuth()

  // Le layout protège déjà l'accès, mais on garde le type sûr ici.
  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const { data: lists } = await supabase
    .from("lists")
    .select("id, name, created_at")
    .eq("couple_id", profile.couple_id)
    .order("position", { ascending: true })

  const listIds = (lists ?? []).map((l) => l.id)

  // Articles de toutes les listes en une requête (évite le N+1). list_items
  // n'a pas de couple_id : on filtre par list_id (eux-mêmes déjà sous RLS).
  const { data: items } = listIds.length
    ? await supabase
        .from("list_items")
        .select("list_id, is_checked, created_at, checked_at")
        .in("list_id", listIds)
    : { data: [] }

  // Agrégation par liste : total, non cochés, dernière activité.
  type Agg = { total: number; unchecked: number; lastActivity: number }
  const byList = new Map<string, Agg>()

  for (const item of items ?? []) {
    const agg = byList.get(item.list_id) ?? {
      total: 0,
      unchecked: 0,
      lastActivity: 0,
    }
    agg.total += 1
    if (!item.is_checked) agg.unchecked += 1

    const created = Date.parse(item.created_at)
    if (Number.isFinite(created)) agg.lastActivity = Math.max(agg.lastActivity, created)
    if (item.checked_at) {
      const checked = Date.parse(item.checked_at)
      if (Number.isFinite(checked)) {
        agg.lastActivity = Math.max(agg.lastActivity, checked)
      }
    }

    byList.set(item.list_id, agg)
  }

  const views: ListView[] = (lists ?? []).map((l) => {
    const agg = byList.get(l.id)
    // Dernière modif = activité la plus récente sur les articles, à défaut la
    // création de la liste.
    const lastMs = agg?.lastActivity || Date.parse(l.created_at)
    return {
      id: l.id,
      name: l.name,
      total: agg?.total ?? 0,
      unchecked: agg?.unchecked ?? 0,
      updatedAt: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
    }
  })

  return (
    <section className="mx-auto w-full max-w-sm">
      <ListsManager lists={views} coupleId={profile.couple_id} />
    </section>
  )
}
