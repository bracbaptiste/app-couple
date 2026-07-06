import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { TYPES_PLAT, TAGS, type TypePlat, type Tag } from "@/lib/recipes/extraction"

import { RecipesBrowser, type RecipeCardView } from "./recipes-client"

/**
 * Carnet de recettes (/recipes) — liste filtrable (PRD_recettes §7.6).
 *
 * Server Component (sous RLS — on ne voit que les recettes de son couple) : on
 * charge les colonnes nécessaires aux vignettes (titre, durée, type,
 * étiquettes, calories/portion), triées de la plus récente à la plus ancienne.
 * La recherche par titre et les filtres (Axe 1 type de plat, Axe 2 étiquettes,
 * §10) vivent côté client (`./recipes-client.tsx`). La fiche détaillée est une
 * route distincte (`./[recipeId]/page.tsx`).
 */
export default async function RecipesPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const { data } = await supabase
    .from("recipes")
    .select(
      "id, titre, duree_minutes, type_plat, tags, calories_par_portion",
    )
    .eq("couple_id", profile.couple_id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  // Borne `type_plat`/`tags` au jeu fermé §10 même à la lecture : une valeur
  // hors-liste (donnée ancienne / import) ne doit pas casser le rendu.
  const recipes: RecipeCardView[] = (data ?? []).map((r) => ({
    id: r.id,
    titre: r.titre,
    dureeMinutes: r.duree_minutes,
    typePlat: (TYPES_PLAT as readonly string[]).includes(r.type_plat)
      ? (r.type_plat as TypePlat)
      : "plat",
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t): t is Tag => (TAGS as readonly string[]).includes(t))
      : [],
    caloriesParPortion: r.calories_par_portion,
  }))

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">Recettes</h1>
      <RecipesBrowser recipes={recipes} coupleId={profile.couple_id} />
    </section>
  )
}
