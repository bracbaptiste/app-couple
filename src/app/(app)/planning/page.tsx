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

import { PlanningGrid, type DayColumn, type MealSlotView } from "./planning-client"

/**
 * Planning (/planning) — grille 7 jours × 2 créneaux (PRD_V4 §8.1).
 *
 * Server Component (sous RLS — on ne voit que les repas de son couple). La
 * semaine affichée vient de l'URL (`?debut=YYYY-MM-DD`, normalisé au lundi) pour
 * que la navigation soit partageable ET préservée par le `router.refresh()` du
 * temps réel. Absent → semaine courante. On charge les `meal_slots` de la plage
 * lundi→dimanche (avec le titre de la recette liée) ; le PLACEMENT des repas
 * arrive au prompt 9, ici les cases sont surtout vides (nativement en pointillés).
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

  // Repas de la semaine, filtrés par couple + plage de dates (colonne `date`).
  // Jointure recette pour afficher le titre sans requête supplémentaire.
  const { data, error } = await supabase
    .from("meal_slots")
    .select("id, date, creneau, type, texte, recipe_id, recipes(titre)")
    .eq("couple_id", profile.couple_id)
    .gte("date", mondayKey)
    .lte("date", sundayKey)

  if (error) throw new Error("Impossible de charger le planning")

  // Indexe chaque repas par « dateKey|creneau » = l'identité d'une case.
  const slotsByCell = new Map<string, MealSlotView>()
  for (const row of data ?? []) {
    const creneau = row.creneau === "diner" ? "diner" : "dejeuner"
    const recette = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes
    slotsByCell.set(`${row.date}|${creneau}`, {
      id: row.id,
      creneau,
      type: row.type === "texte" ? "texte" : "recette",
      // Ce qui s'affiche dans la case : titre de la recette liée ou texte libre.
      label: row.type === "texte" ? (row.texte ?? "") : (recette?.titre ?? ""),
    })
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
    }
  })

  return (
    <section className="mx-auto w-full max-w-sm">
      <PlanningGrid
        coupleId={profile.couple_id}
        columns={columns}
        weekStartKey={mondayKey}
        prevWeekKey={toDateKey(addWeeks(monday, -1))}
        nextWeekKey={toDateKey(addWeeks(monday, 1))}
        currentWeekKey={toDateKey(resolveWeekStart(undefined, today))}
      />
    </section>
  )
}
