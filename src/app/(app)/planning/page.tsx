import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import {
  addWeeks,
  isSameDay,
  resolveWeekStart,
  toDateKey,
  weekDays,
} from "@/lib/planning/week"

import {
  PlanningGrid,
  type DayColumn,
  type MealSlotView,
  type PlanningTaskView,
  type RecipePickView,
} from "./planning-client"

/**
 * Planning (/planning) — grille 7 jours × 2 créneaux (PRD_V4 §8.1–§8.3).
 *
 * Server Component (sous RLS — on ne voit que les données de son couple). La
 * semaine affichée vient de l'URL (`?debut=YYYY-MM-DD`, normalisé au lundi) pour
 * que la navigation soit partageable ET préservée par le `router.refresh()` du
 * temps réel. Absent → semaine courante.
 *
 * On charge, pour la plage lundi→dimanche :
 *   - les `meal_slots` (repas placés, avec le titre de la recette liée) ;
 *   - les `tasks` dont l'ÉCHÉANCE tombe dans la semaine (§8.3 — c'est l'échéance
 *     qui place la tâche, jamais un placement manuel ; les récurrentes remontent
 *     via la ligne de leur prochaine occurrence, matérialisée en base au cochage).
 * Le carnet de recettes (id + titre) et les deux profils servent le placement et
 * l'affichage « fait par / assigné à ».
 */
export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ debut?: string }>
}) {
  const { profile } = await requireAuth()
  if (!profile?.couple_id) redirect("/onboarding")

  const { debut } = await searchParams

  // Semaine à afficher (lundi 00:00 local) + les 7 jours et leurs bornes.
  const today = new Date()
  const monday = resolveWeekStart(debut, today)
  const days = weekDays(monday)
  const mondayKey = toDateKey(days[0])
  const sundayKey = toDateKey(days[days.length - 1])

  const supabase = await createClient()

  // En parallèle : les repas de la semaine (couple + plage de dates, jointure
  // recette pour le titre), les to-do lists du couple (pour cibler leurs tâches),
  // et le carnet de recettes (id + titre) pour le picker de placement.
  const [mealsRes, listsRes, recipesRes] = await Promise.all([
    supabase
      .from("meal_slots")
      .select("id, date, creneau, type, texte, recipe_id, recipes(titre)")
      .eq("couple_id", profile.couple_id)
      .gte("date", mondayKey)
      .lte("date", sundayKey),
    // Toutes les listes du couple : les to-do ciblent les tâches du planning
    // (§8.3), les listes de courses sont les cibles de la génération (§8.5).
    supabase
      .from("lists")
      .select("id, name, kind")
      .eq("couple_id", profile.couple_id)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    supabase
      .from("recipes")
      .select("id, titre")
      .eq("couple_id", profile.couple_id)
      .is("deleted_at", null)
      .order("titre", { ascending: true }),
  ])

  if (mealsRes.error || listsRes.error) {
    throw new Error("Impossible de charger le planning")
  }

  // Tâches à échéance dans la semaine (§8.3). La tâche ne porte pas de couple_id :
  // on la borne aux to-do lists DU COUPLE (ids ci-dessus), puis on filtre la plage
  // d'échéance. Les récurrentes remontent via la ligne de leur prochaine
  // occurrence (matérialisée en base au cochage) — rien de spécial à projeter.
  const allLists = listsRes.data ?? []
  const todoListIds = allLists.filter((l) => l.kind === "todo").map((l) => l.id)
  // Cibles de la génération de la semaine (§8.5) : les listes de courses.
  const coursesLists = allLists
    .filter((l) => l.kind !== "todo")
    .map((l) => ({ id: l.id, name: l.name }))
  let taskRows: {
    id: string
    title: string
    due_date: string | null
    is_done: boolean
    list_id: string
  }[] = []
  if (todoListIds.length > 0) {
    const tasksRes = await supabase
      .from("tasks")
      .select("id, title, due_date, is_done, list_id")
      .in("list_id", todoListIds)
      .gte("due_date", mondayKey)
      .lte("due_date", sundayKey)
      .is("deleted_at", null)
    if (tasksRes.error) throw new Error("Impossible de charger le planning")
    taskRows = tasksRes.data ?? []
  }

  // Indexe chaque repas par « dateKey|creneau » = l'identité d'une case.
  const slotsByCell = new Map<string, MealSlotView>()
  for (const row of mealsRes.data ?? []) {
    const creneau = row.creneau === "diner" ? "diner" : "dejeuner"
    const recette = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes
    slotsByCell.set(`${row.date}|${creneau}`, {
      id: row.id,
      creneau,
      type: row.type === "texte" ? "texte" : "recette",
      // Ce qui s'affiche dans la case : titre de la recette liée ou texte libre.
      label: row.type === "texte" ? (row.texte ?? "") : (recette?.titre ?? ""),
      // Lien « tap → fiche recette » (§8.2) : uniquement pour les repas-recette.
      recipeId: row.type === "recette" ? (row.recipe_id ?? null) : null,
    })
  }

  // Regroupe les tâches par jour d'échéance. Non-faites d'abord (à faire en
  // premier), puis les faites (style « fait » apaisé), pour un ordre lisible.
  const tasksByDay = new Map<string, PlanningTaskView[]>()
  for (const row of taskRows) {
    if (!row.due_date) continue
    const bucket = tasksByDay.get(row.due_date) ?? []
    bucket.push({
      id: row.id,
      listId: row.list_id,
      title: row.title,
      isDone: row.is_done,
    })
    tasksByDay.set(row.due_date, bucket)
  }
  for (const bucket of tasksByDay.values()) {
    bucket.sort((a, b) => Number(a.isDone) - Number(b.isDone))
  }

  // Colonnes de la grille : un descriptif par jour (libellés déjà résolus côté
  // serveur → le client n'a plus qu'à peindre). `dejeuner`/`diner` = null si vide.
  const weekdayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long" })
  const columns: DayColumn[] = days.map((day) => {
    const key = toDateKey(day)
    return {
      dateKey: key,
      weekday: weekdayFmt.format(day),
      dayNumber: day.getDate(),
      isToday: isSameDay(day, today),
      dejeuner: slotsByCell.get(`${key}|dejeuner`) ?? null,
      diner: slotsByCell.get(`${key}|diner`) ?? null,
      tasks: tasksByDay.get(key) ?? [],
    }
  })

  const recipes: RecipePickView[] = (recipesRes.data ?? []).map((r) => ({
    id: r.id,
    titre: r.titre,
  }))

  return (
    <section className="mx-auto w-full max-w-sm">
      <PlanningGrid
        coupleId={profile.couple_id}
        columns={columns}
        recipes={recipes}
        coursesLists={coursesLists}
        weekStartKey={mondayKey}
        prevWeekKey={toDateKey(addWeeks(monday, -1))}
        nextWeekKey={toDateKey(addWeeks(monday, 1))}
        currentWeekKey={toDateKey(resolveWeekStart(undefined, today))}
      />
    </section>
  )
}
