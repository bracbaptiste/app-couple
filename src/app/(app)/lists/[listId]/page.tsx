import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { purchaseArchiveCutoffIso } from "@/lib/purchase-window"
import { parseQuantites } from "@/lib/recipes/fusion"
import { recurrenceFromDb } from "@/lib/tasks/recurrence"

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

  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id, name, kind, is_shared, owner_id")
    .eq("id", listId)
    .eq("couple_id", profile.couple_id)
    .maybeSingle()

  if (listError) throw new Error("Impossible de charger la liste")
  if (!list) notFound()

  // Routage par type (ARCHITECTURE_V2 §4, option A) : une to-do list rend son
  // propre écran ; on ne déclenche pas le fetch d'articles/rayons des courses.
  if (list.kind === "todo") {
    // En parallèle : tâches À FAIRE, 10 dernières tâches FAITES (section « Fait »
    // §2.8), et membres (marqueur « ajouté par »).
    const [tasksRes, doneRes, membersRes, todoListsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, title, note, due_date, is_done, added_by, assigned_to, recurrence_type, recurrence_interval, recurrence_weekday, recurrence_day_of_month, created_at",
        )
        .eq("list_id", listId)
        .eq("is_done", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select(
          "id, title, note, due_date, is_done, added_by, assigned_to, recurrence_type, recurrence_interval, recurrence_weekday, recurrence_day_of_month, created_at",
        )
        .eq("list_id", listId)
        .eq("is_done", true)
        .order("done_at", { ascending: false })
        .limit(10),
      supabase
        .from("profiles")
        .select("id, display_name, color")
        .eq("couple_id", profile.couple_id),
      // Toutes les to-do lists du couple : sélecteur de liste cible de l'ajout
      // vocal (la tâche dictée peut viser une autre liste que celle affichée).
      supabase
        .from("lists")
        .select("id, name")
        .eq("couple_id", profile.couple_id)
        .eq("kind", "todo")
        .order("position", { ascending: true }),
    ])

    if (
      tasksRes.error ||
      doneRes.error ||
      membersRes.error ||
      todoListsRes.error
    ) {
      throw new Error("Impossible de charger la to-do list")
    }

    const toTaskView = (row: {
      id: string
      title: string
      note: string | null
      due_date: string | null
      is_done: boolean
      added_by: string | null
      assigned_to: string | null
      recurrence_type: string | null
      recurrence_interval: number | null
      recurrence_weekday: number | null
      recurrence_day_of_month: number | null
      created_at: string | null
    }): TaskView => ({
      id: row.id,
      title: row.title,
      note: row.note,
      dueDate: row.due_date,
      isDone: row.is_done,
      addedBy: row.added_by,
      assignedTo: row.assigned_to,
      recurrence: recurrenceFromDb(row),
      createdAt: row.created_at ?? "",
    })

    const tasks: TaskView[] = (tasksRes.data ?? []).map(toTaskView)
    const doneTasks: TaskView[] = (doneRes.data ?? []).map(toTaskView)

    const todoMembers: TodoMemberView[] = (membersRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.display_name || "?",
      color: asColor(m.color),
    }))

    const todoLists = (todoListsRes.data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
    }))

    return (
      <section className="mx-auto w-full max-w-sm">
        <TodoListView
          listId={list.id}
          coupleId={profile.couple_id}
          name={list.name}
          members={todoMembers}
          currentMemberId={profile.id}
          isShared={list.is_shared}
          ownerId={list.owner_id}
          todoLists={todoLists}
          tasks={tasks}
          doneTasks={doneTasks}
        />
      </section>
    )
  }

  // Les articles cochés depuis plus de 24h ont basculé dans l'historique des
  // achats (/profile/purchases). L'écran ne charge donc que la liste vivante :
  // les articles à acheter + ceux cochés dans les dernières 24h (« Déjà pris »).
  const recentCheckedCutoff = purchaseArchiveCutoffIso()

  // Articles + produit lié, rayons, membres : en parallèle (pas de N+1).
  const [itemsRes, categoriesRes, membersRes] = await Promise.all([
    supabase
      .from("list_items")
      .select(
        "id, quantity, quantities, note, is_checked, checked_at, added_by, created_at, library_item_id, library_items(name, category_id)",
      )
      .eq("list_id", listId)
      .or(`is_checked.eq.false,checked_at.gte.${recentCheckedCutoff}`)
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

  if (itemsRes.error || categoriesRes.error || membersRes.error) {
    throw new Error("Impossible de charger la liste de courses")
  }

  const items: ItemView[] = (itemsRes.data ?? []).map((row) => ({
    id: row.id,
    libraryItemId: row.library_item_id,
    name: row.library_items?.name ?? "Article",
    quantity: row.quantity,
    // Quantités structurées issues des recettes (fusion §6), décodées du jsonb.
    quantities: parseQuantites(row.quantities),
    note: row.note,
    isChecked: row.is_checked,
    checkedAt: row.checked_at,
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
