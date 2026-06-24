import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, ChefHat, Clock, Users, Flame, Sparkles } from "lucide-react"
import { notFound, redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { risoButtonVariants } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"
import {
  TYPES_PLAT,
  TAGS,
  type TypePlat,
  type Tag,
  type Unite,
} from "@/lib/recipes/extraction"
import { LABELS_TYPE_PLAT, LABELS_TAG } from "@/lib/recipes/labels"
import { formatDuree } from "@/lib/recipes/format"
import { type ListeCible } from "./add-to-list"
import { RecipeServings } from "./recipe-servings"

/**
 * Fiche recette détaillée (/recipes/[recipeId], PRD_recettes §7.6).
 *
 * Server Component (sous RLS — on ne voit que les recettes de son couple) : on
 * charge la recette (404 si elle n'appartient pas au couple) et ses ingrédients
 * triés par `ordre`. Tout est en lecture seule ici ; l'écriture vit dans le flux
 * d'ajout (§7.1 → §7.5).
 */
export default async function RecipeDetailPage({
  params,
}: {
  // Next 16 : les params de route sont asynchrones.
  params: Promise<{ recipeId: string }>
}) {
  const { recipeId } = await params
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const { data: recipe } = await supabase
    .from("recipes")
    .select(
      "id, titre, duree_minutes, type_plat, tags, nombre_personnes, calories_par_portion, proteines_g, glucides_g, lipides_g, etapes, notes, photo_url",
    )
    .eq("id", recipeId)
    .eq("couple_id", profile.couple_id)
    .maybeSingle()

  if (!recipe) notFound()

  const { data: ingredientsData } = await supabase
    .from("recipe_ingredients")
    .select("id, nom_affiche, quantite, unite")
    .eq("recipe_id", recipe.id)
    .order("ordre", { ascending: true })

  // Listes de courses du couple (cibles possibles du bouton §8.1). On exclut les
  // listes to-do : on n'ajoute des ingrédients qu'à une liste de courses.
  const { data: listsData } = await supabase
    .from("lists")
    .select("id, name, kind")
    .eq("couple_id", profile.couple_id)
    .order("position", { ascending: true })

  const listesCourses: ListeCible[] = (listsData ?? [])
    .filter((l) => l.kind !== "todo")
    .map((l) => ({ id: l.id, name: l.name }))

  // Bornes défensives §10 (donnée ancienne / import hors-liste).
  const typePlat: TypePlat = (TYPES_PLAT as readonly string[]).includes(
    recipe.type_plat,
  )
    ? (recipe.type_plat as TypePlat)
    : "plat"
  const tags: Tag[] = Array.isArray(recipe.tags)
    ? recipe.tags.filter((t): t is Tag => (TAGS as readonly string[]).includes(t))
    : []

  // `etapes` est un Json en base : on n'en garde que les chaînes non vides.
  const etapes: string[] = Array.isArray(recipe.etapes)
    ? recipe.etapes.filter((e): e is string => typeof e === "string" && e.trim() !== "")
    : []

  const ingredients = (ingredientsData ?? []).map((i) => ({
    id: i.id,
    nom: i.nom_affiche,
    quantite: i.quantite,
    unite: (i.unite ?? null) as Unite | null,
  }))

  const duree = formatDuree(recipe.duree_minutes)
  const macros = [
    { label: "Protéines", value: recipe.proteines_g },
    { label: "Glucides", value: recipe.glucides_g },
    { label: "Lipides", value: recipe.lipides_g },
  ].filter((m) => m.value !== null)
  const aNutrition = recipe.calories_par_portion !== null || macros.length > 0

  return (
    <section className="mx-auto w-full max-w-sm">
      {/* Retour vers le carnet : cible tap 44px (DESIGN_SYSTEM §8). */}
      <Link
        href="/recipes"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
      >
        <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
        Recettes
      </Link>

      {/* Visuel : photo si disponible, sinon bandeau « marmite » sauge. */}
      <div className="relative mt-1 flex h-44 w-full items-center justify-center overflow-hidden rounded-[12px] border-2 border-ink bg-sauge shadow-riso-sauge">
        {recipe.photo_url ? (
          <Image
            src={recipe.photo_url}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <ChefHat className="size-14 text-ink" strokeWidth={1.5} aria-hidden />
        )}
      </div>

      <h1 className="mt-4 font-display text-xl uppercase leading-tight text-ink">
        {recipe.titre}
      </h1>

      {/* Méta : type · durée · personnes */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[12px] text-ink-soft">
        <span className="font-bold text-ink">{LABELS_TYPE_PLAT[typePlat]}</span>
        {duree && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" strokeWidth={2.5} aria-hidden />
            {duree}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Users className="size-4" strokeWidth={2.5} aria-hidden />
          {recipe.nombre_personnes} pers.
        </span>
      </div>

      {/* Étiquettes (Axe 2, §10) */}
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-[8px] border-2 border-ink bg-sauge px-2.5 py-1 text-[12px] font-medium text-ink shadow-riso-ink-sm"
            >
              {LABELS_TAG[tag]}
            </span>
          ))}
        </div>
      )}

      {/* Ingrédients : sélecteur « pour N personnes » (§8.2), action « → ma
          bibliothèque » par ingrédient (§8.4) et ajout à la liste (§8.1). */}
      <RecipeServings
        recipeId={recipe.id}
        nombrePersonnesBase={recipe.nombre_personnes}
        ingredients={ingredients}
        listes={listesCourses}
      />

      {/* Étapes */}
      {etapes.length > 0 && (
        <section className="mt-6 flex flex-col gap-3">
          <h2 className="font-display text-[15px] uppercase text-ink">Étapes</h2>
          <ol className="flex flex-col gap-2">
            {etapes.map((etape, index) => (
              <li
                key={index}
                className="flex items-start gap-2.5 rounded-[10px] border-2 border-ink bg-paper-light p-3"
              >
                <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] border-2 border-ink bg-sauge font-display text-[13px] text-ink">
                  {index + 1}
                </span>
                <p className="text-[14px] leading-snug text-ink">{etape}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Calories & macros (par portion) */}
      {aNutrition && (
        <section className="mt-6 flex flex-col gap-3">
          <h2 className="font-display text-[15px] uppercase text-ink">
            Calories &amp; macros{" "}
            <span className="font-body text-[12px] normal-case text-ink-soft">
              (par portion)
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {recipe.calories_par_portion !== null && (
              <NutritionTile
                label="Calories"
                value={`${recipe.calories_par_portion} kcal`}
                icon
              />
            )}
            {macros.map((m) => (
              <NutritionTile key={m.label} label={m.label} value={`${m.value} g`} />
            ))}
          </div>
          <p className="rounded-[8px] border-2 border-dashed border-ink bg-paper px-3 py-2.5 text-[12px] leading-snug text-ink-soft">
            ⚠️ Estimation indicative (± ~15–20 %) — ne pas utiliser à des fins
            médicales/nutritionnelles précises.
          </p>
        </section>
      )}

      {/* Notes libres */}
      {recipe.notes && recipe.notes.trim() && (
        <section className="mt-6 flex flex-col gap-3">
          <h2 className="font-display text-[15px] uppercase text-ink">Notes</h2>
          <p className="whitespace-pre-line rounded-[10px] border-2 border-ink bg-paper-light p-3 text-[14px] leading-snug text-ink">
            {recipe.notes}
          </p>
        </section>
      )}

      {/* Améliorer avec l'IA (§9.1) — crée une nouvelle version, l'originale reste. */}
      <Link
        href={`/recipes/${recipe.id}/improve`}
        className={cn(
          risoButtonVariants({ variant: "secondary" }),
          "mt-6 h-12 w-full text-sm",
        )}
      >
        <Sparkles aria-hidden /> Améliorer avec l’IA
      </Link>

      {/* Espace de respiration sous la dernière section (au-dessus de la BottomNav). */}
      <div aria-hidden className="h-4" />
    </section>
  )
}

/** Petite tuile chiffrée pour calories / macros. */
function NutritionTile({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: boolean
}) {
  return (
    <div className="flex min-w-[88px] flex-1 flex-col gap-0.5 rounded-[10px] border-2 border-ink bg-paper-light px-3 py-2 shadow-riso-sauge">
      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wide text-ink-soft">
        {icon && <Flame className="size-3" strokeWidth={2.5} aria-hidden />}
        {label}
      </span>
      <span className="font-display text-[16px] text-ink">{value}</span>
    </div>
  )
}
