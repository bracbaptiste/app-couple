import Link from "next/link"
import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

import {
  ListDetail,
  type CategoryView,
  type ItemView,
  type MemberView,
} from "./list-detail-client"

type Color = "sauge" | "brique"

/** Normalise une couleur DB (text) vers l'union typée du front. */
function asColor(value: string): Color {
  return value === "brique" ? "brique" : "sauge"
}

/**
 * Détail d'une liste (/lists/[listId]).
 *
 * Lecture (server component, sous RLS — on ne voit que les données de son
 * couple) :
 *   - la liste (uniquement si elle appartient au couple courant, sinon 404)
 *   - ses articles (list_items) + le produit lié (library_item : nom, rayon)
 *   - les rayons du couple, triés par position (ordre d'affichage des groupes)
 *   - les membres du couple (pour le marqueur couleur « ajouté par »)
 *
 * Le regroupement par rayon, le cochage et les mutations vivent côté client
 * (`./list-detail-client.tsx` + `./actions.ts`).
 */
export default async function ListDetailPage({
  params,
}: {
  // Next 16 : les params de route sont asynchrones.
  params: Promise<{ listId: string }>
}) {
  const { listId } = await params
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const { data: list } = await supabase
    .from("lists")
    .select("id, name")
    .eq("id", listId)
    .eq("couple_id", profile.couple_id)
    .maybeSingle()

  if (!list) notFound()

  // Articles + produit lié, rayons, membres : en parallèle (pas de N+1).
  const [itemsRes, categoriesRes, membersRes] = await Promise.all([
    supabase
      .from("list_items")
      .select(
        "id, quantity, note, is_checked, added_by, created_at, library_item_id, library_items(name, category_id)",
      )
      .eq("list_id", listId)
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name")
      .eq("couple_id", profile.couple_id)
      .order("position", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, display_name, color")
      .eq("couple_id", profile.couple_id),
  ])

  const items: ItemView[] = (itemsRes.data ?? []).map((row) => ({
    id: row.id,
    libraryItemId: row.library_item_id,
    name: row.library_items?.name ?? "Article",
    quantity: row.quantity,
    note: row.note,
    isChecked: row.is_checked,
    categoryId: row.library_items?.category_id ?? null,
    addedBy: row.added_by,
  }))

  const categories: CategoryView[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }))

  const members: MemberView[] = (membersRes.data ?? []).map((m) => ({
    id: m.id,
    name: m.display_name || "?",
    color: asColor(m.color),
  }))

  return (
    <section className="mx-auto w-full max-w-sm">
      <div className="mb-4">
        <Link
          href="/lists"
          className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft"
        >
          ← Listes
        </Link>
        <h1 className="mt-1 font-display text-xl uppercase text-ink">
          {list.name}
        </h1>
      </div>

      <ListDetail
        listId={list.id}
        coupleId={profile.couple_id}
        categories={categories}
        members={members}
        items={items}
      />
    </section>
  )
}
