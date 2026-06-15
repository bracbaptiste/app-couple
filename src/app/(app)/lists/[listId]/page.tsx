import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

import {
  ListDetail,
  type CategoryView,
  type ItemView,
  type MemberView,
} from "./list-detail-client"
import {
  TodoListView,
  type TaskView,
  type TodoMemberView,
} from "@/components/todo/TodoListView"

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
    .select("id, name, kind")
    .eq("id", listId)
    .eq("couple_id", profile.couple_id)
    .maybeSingle()

  if (!list) notFound()

  // Routage par type (ARCHITECTURE_V2 §4, option A) : une to-do list rend son
  // propre écran ; on ne déclenche pas le fetch d'articles/rayons des courses.
  if (list.kind === "todo") {
    // Tâches À FAIRE (is_done = false) + membres (marqueur « ajouté par »).
    const [tasksRes, membersRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, due_date, is_done, added_by")
        .eq("list_id", listId)
        .eq("is_done", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("profiles")
        .select("id, display_name, color")
        .eq("couple_id", profile.couple_id),
    ])

    const tasks: TaskView[] = (tasksRes.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      dueDate: row.due_date,
      isDone: row.is_done,
      addedBy: row.added_by,
    }))

    const todoMembers: TodoMemberView[] = (membersRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.display_name || "?",
      color: asColor(m.color),
    }))

    return (
      <section className="mx-auto w-full max-w-sm">
        <TodoListView
          listId={list.id}
          name={list.name}
          members={todoMembers}
          tasks={tasks}
        />
      </section>
    )
  }

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
        {/* Retour : cible tap 44px (DESIGN_SYSTEM §8), aligné au bord gauche. */}
        <Link
          href="/lists"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Listes
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
