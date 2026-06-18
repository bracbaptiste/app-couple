import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { purchaseArchiveCutoffMs } from "@/lib/purchase-window"

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
  const { user, profile } = await requireAuth()

  // Le layout protège déjà l'accès, mais on garde le type sûr ici.
  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const [listsRes, membersRes] = await Promise.all([
    supabase
      .from("lists")
      .select("id, name, kind, is_shared, owner_id, created_at")
      .eq("couple_id", profile.couple_id)
      .order("position", { ascending: true }),
    // Membres du couple : on en tire le prénom de la conjointe pour la case
    // « Partager avec … » du sheet de création.
    supabase
      .from("profiles")
      .select("id, display_name")
      .eq("couple_id", profile.couple_id),
  ])

  const lists = listsRes.data
  const partner =
    membersRes.data?.find((m) => m.id !== user.id) ?? null
  const partnerName = partner?.display_name?.trim() || null

  // On sépare les ids par type : les listes de courses comptent leurs
  // `list_items`, les listes to-do comptent leurs `tasks` (modèle V2,
  // ARCHITECTURE_V2 §2). Le hub agrégeait jusqu'ici uniquement les articles,
  // d'où les listes to-do affichées « 0 » alors qu'elles ont des tâches.
  const coursesIds = (lists ?? [])
    .filter((l) => l.kind !== "todo")
    .map((l) => l.id)
  const todoIds = (lists ?? [])
    .filter((l) => l.kind === "todo")
    .map((l) => l.id)

  // Articles (courses) + tâches (to-do) en parallèle, chacune en une requête
  // (évite le N+1). Ni `list_items` ni `tasks` n'ont de couple_id : on filtre
  // par list_id (eux-mêmes déjà sous RLS).
  const [itemsRes, tasksRes] = await Promise.all([
    coursesIds.length
      ? supabase
          .from("list_items")
          .select("list_id, is_checked, created_at, checked_at")
          .in("list_id", coursesIds)
      : Promise.resolve({ data: [] as const }),
    todoIds.length
      ? supabase
          .from("tasks")
          .select("list_id, is_done, created_at, done_at")
          .in("list_id", todoIds)
      : Promise.resolve({ data: [] as const }),
  ])

  const items = itemsRes.data
  const tasks = tasksRes.data

  // Agrégation par liste : total, restant à faire/acheter, dernière activité.
  type Agg = { total: number; unchecked: number; lastActivity: number }
  const byList = new Map<string, Agg>()

  function bump(listId: string, open: boolean, ...stamps: (string | null)[]) {
    const agg = byList.get(listId) ?? {
      total: 0,
      unchecked: 0,
      lastActivity: 0,
    }
    agg.total += 1
    if (open) agg.unchecked += 1
    for (const stamp of stamps) {
      if (!stamp) continue
      const ms = Date.parse(stamp)
      if (Number.isFinite(ms)) agg.lastActivity = Math.max(agg.lastActivity, ms)
    }
    byList.set(listId, agg)
  }

  // Articles cochés depuis plus de 24h : ils ont quitté la liste active pour
  // l'historique des achats. On ne les compte donc plus (ni « total » ni
  // « à acheter ») — la tuile reflète la liste vivante, pas le passé.
  const archiveCutoff = purchaseArchiveCutoffMs()

  for (const item of items ?? []) {
    if (item.is_checked && item.checked_at) {
      const ms = Date.parse(item.checked_at)
      if (Number.isFinite(ms) && ms < archiveCutoff) continue
    }
    bump(item.list_id, !item.is_checked, item.created_at, item.checked_at)
  }

  for (const task of tasks ?? []) {
    bump(task.list_id, !task.is_done, task.created_at, task.done_at)
  }

  const views: ListView[] = (lists ?? []).map((l) => {
    const agg = byList.get(l.id)
    // Dernière modif = activité la plus récente sur les articles, à défaut la
    // création de la liste.
    const lastMs = agg?.lastActivity || Date.parse(l.created_at)
    return {
      id: l.id,
      name: l.name,
      // 'todo' | 'courses' — défaut courses pour les listes V1 sans kind explicite.
      kind: l.kind === "todo" ? "todo" : "courses",
      // Partage : les listes V1 sont partagées par défaut après migration.
      isShared: l.is_shared === true,
      // Couleur d'identité du propriétaire pour le logo des listes non partagées
      // (toi = sauge, la conjointe = brique). Null si propriétaire inconnu.
      ownerColor: l.owner_id
        ? l.owner_id === user.id
          ? "sauge"
          : "brique"
        : null,
      total: agg?.total ?? 0,
      unchecked: agg?.unchecked ?? 0,
      updatedAt: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
    }
  })

  return (
    <section className="mx-auto w-full max-w-sm">
      <ListsManager
        lists={views}
        coupleId={profile.couple_id}
        partnerName={partnerName}
      />
    </section>
  )
}
