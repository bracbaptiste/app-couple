"use client"

import Link from "next/link"
import Image from "next/image"
import { Search, Plus, ChefHat, Clock, Flame, SlidersHorizontal, X, Sparkles } from "lucide-react"
import { useMemo, useState } from "react"

import { risoButtonVariants } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"
import {
  TYPES_PLAT,
  TAGS,
  type TypePlat,
  type Tag,
} from "@/lib/recipes/extraction"
import { LABELS_TYPE_PLAT, LABELS_TAG } from "@/lib/recipes/labels"
import { formatDuree } from "@/lib/recipes/format"

/**
 * Une recette aplatie pour la vignette (§7.6). `photoUrl` est presque toujours
 * `null` (les photos ne sont pas conservées — cf. flux d'ajout) : la vignette
 * dégrade alors vers un visuel « marmite » aux codes Riso.
 */
export type RecipeCardView = {
  id: string
  titre: string
  dureeMinutes: number | null
  typePlat: TypePlat
  tags: Tag[]
  caloriesParPortion: number | null
  photoUrl: string | null
}

/** Normalise un libellé pour la recherche (insensible casse + accents). */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Pilote le carnet de recettes : recherche par titre, filtres par type de plat
 * (Axe 1, §10) et par étiquettes (Axe 2, §10), puis grille de vignettes
 * cliquables menant à la fiche détaillée.
 *
 * Logique de filtrage (facettes standard) : une recette passe si son titre
 * contient la recherche ET (aucun type sélectionné OU son type est sélectionné)
 * ET elle porte TOUTES les étiquettes sélectionnées.
 */
export function RecipesBrowser({ recipes }: { recipes: RecipeCardView[] }) {
  const [query, setQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Set<TypePlat>>(new Set())
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(new Set())
  // Replie le bloc de filtres par défaut : la recherche reste toujours visible.
  const [filtersOpen, setFiltersOpen] = useState(false)

  function toggleType(t: TypePlat) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function toggleTag(t: Tag) {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function clearFilters() {
    setSelectedTypes(new Set())
    setSelectedTags(new Set())
  }

  const activeFilterCount = selectedTypes.size + selectedTags.size

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return recipes.filter((r) => {
      if (q && !normalize(r.titre).includes(q)) return false
      if (selectedTypes.size > 0 && !selectedTypes.has(r.typePlat)) return false
      for (const tag of selectedTags) {
        if (!r.tags.includes(tag)) return false
      }
      return true
    })
  }, [recipes, query, selectedTypes, selectedTags])

  // Carnet entièrement vide : message d'amorçage + bouton d'ajout.
  if (recipes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Link
            href="/recipes/new"
            className={cn(risoButtonVariants(), "h-12 w-full text-sm")}
          >
            <Plus aria-hidden /> Ajouter une recette
          </Link>
          <Link
            href="/recipes/ai"
            className={cn(
              risoButtonVariants({ variant: "secondary" }),
              "h-12 w-full text-sm",
            )}
          >
            <Sparkles aria-hidden /> Créer avec l’IA
          </Link>
        </div>
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Ton carnet de recettes est encore vide. Ajoute ta première recette en
          photographiant une fiche, même manuscrite — ou laisse l’IA t’en
          composer une.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link
          href="/recipes/new"
          className={cn(risoButtonVariants(), "h-12 w-full text-sm")}
        >
          <Plus aria-hidden /> Ajouter une recette
        </Link>
        <Link
          href="/recipes/ai"
          className={cn(
            risoButtonVariants({ variant: "secondary" }),
            "h-12 w-full text-sm",
          )}
        >
          <Sparkles aria-hidden /> Créer avec l’IA
        </Link>
      </div>

      {/* Recherche par titre */}
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-paper-light px-3 shadow-riso-ink focus-within:shadow-riso-sauge">
        <Search className="size-5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une recette…"
          maxLength={120}
          aria-label="Rechercher une recette par titre"
          className="h-12 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-body placeholder:text-ink-soft"
        />
      </div>

      {/* Bascule du panneau de filtres */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
          className="inline-flex min-h-11 items-center gap-2 rounded-[8px] border-2 border-ink bg-paper-light px-3 font-display text-[11px] uppercase leading-none text-ink shadow-riso-sauge outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none"
        >
          <SlidersHorizontal className="size-4" strokeWidth={2.5} aria-hidden />
          Filtrer
          {activeFilterCount > 0 && (
            <span className="inline-flex size-5 items-center justify-center rounded-[5px] border-2 border-ink bg-brique text-[10px] text-paper-light">
              {activeFilterCount}
            </span>
          )}
        </button>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[12px] font-bold text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            <X className="size-3.5" strokeWidth={2.5} aria-hidden /> Effacer
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="flex flex-col gap-4 rounded-[12px] border-2 border-ink bg-paper-light p-3 shadow-riso-sauge">
          {/* Axe 1 — Type de plat (§10) */}
          <FilterGroup title="Type de plat">
            {TYPES_PLAT.map((t) => (
              <FilterChip
                key={t}
                label={LABELS_TYPE_PLAT[t]}
                active={selectedTypes.has(t)}
                onClick={() => toggleType(t)}
              />
            ))}
          </FilterGroup>

          {/* Axe 2 — Étiquettes (§10) */}
          <FilterGroup title="Étiquettes">
            {TAGS.map((t) => (
              <FilterChip
                key={t}
                label={LABELS_TAG[t]}
                active={selectedTags.has(t)}
                onClick={() => toggleTag(t)}
              />
            ))}
          </FilterGroup>
        </div>
      )}

      {/* Décompte des résultats */}
      <p className="font-mono text-[12px] text-ink-soft">
        {filtered.length} recette{filtered.length > 1 ? "s" : ""}
        {activeFilterCount > 0 || query.trim()
          ? ` sur ${recipes.length}`
          : ""}
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Aucune recette ne correspond à ta recherche.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((recipe) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Filtres                                                                     */
/* -------------------------------------------------------------------------- */

function FilterGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {title}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/**
 * Chip de filtre — mêmes codes que les boutons d'étiquette de la relecture
 * (review-form) : sauge plein + ombre quand actif, contour estompé sinon.
 */
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-[8px] border-2 border-ink px-3 py-2 font-body text-[13px] font-medium outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        active
          ? "bg-sauge text-ink shadow-riso-ink-sm"
          : "bg-paper-light text-ink-soft opacity-70",
      )}
    >
      {label}
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Vignette de recette                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Vignette cliquable (§7.6) : visuel (photo ou marmite de repli), titre, méta
 * (durée · type · calories/portion) et jusqu'à trois étiquettes. Toute la carte
 * est un lien vers la fiche détaillée.
 */
function RecipeCard({ recipe }: { recipe: RecipeCardView }) {
  const duree = formatDuree(recipe.dureeMinutes)
  // On limite à 3 étiquettes affichées (+ « +N ») pour garder la carte lisible.
  const tagsVisibles = recipe.tags.slice(0, 3)
  const tagsRestants = recipe.tags.length - tagsVisibles.length

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-2.5 text-ink shadow-riso-sauge outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none"
    >
      {/* Visuel carré : photo si disponible, sinon repli « marmite » sauge. */}
      <div className="relative size-20 shrink-0 overflow-hidden rounded-[8px] border-2 border-ink bg-sauge">
        {recipe.photoUrl ? (
          <Image
            src={recipe.photoUrl}
            alt=""
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <ChefHat className="size-8 text-ink" strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h2 className="line-clamp-2 font-display text-[15px] uppercase leading-tight text-ink">
          {recipe.titre}
        </h2>

        {/* Méta : type · durée · calories */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] text-ink-soft">
          <span className="font-bold text-ink">
            {LABELS_TYPE_PLAT[recipe.typePlat]}
          </span>
          {duree && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" strokeWidth={2.5} aria-hidden />
              {duree}
            </span>
          )}
          {recipe.caloriesParPortion !== null && (
            <span className="inline-flex items-center gap-1">
              <Flame className="size-3.5" strokeWidth={2.5} aria-hidden />
              {recipe.caloriesParPortion} kcal/pers.
            </span>
          )}
        </div>

        {/* Étiquettes (Axe 2) */}
        {tagsVisibles.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-1">
            {tagsVisibles.map((tag) => (
              <span
                key={tag}
                className="rounded-[6px] border-2 border-ink bg-paper px-1.5 py-0.5 text-[10px] font-medium text-ink"
              >
                {LABELS_TAG[tag]}
              </span>
            ))}
            {tagsRestants > 0 && (
              <span className="rounded-[6px] border-2 border-dashed border-ink px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                +{tagsRestants}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}
