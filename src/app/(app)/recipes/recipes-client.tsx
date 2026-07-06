"use client"

import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import { Search, Plus, Clock, Flame, SlidersHorizontal, X, Trash2 } from "lucide-react"
import { useMemo, useRef, useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { GhostTile } from "@/components/shared/ghost-tile"
import { NewRecipeSheet } from "@/components/recipes/NewRecipeSheet"
import { UndoToast } from "@/components/shared/undo-toast"
import { useSwipeReveal } from "@/lib/hooks/useSwipeReveal"
import { useRealtimeRecipes } from "@/lib/realtime"
import { deleteRecipe, restoreRecipe, type DeleteRecipeResult } from "./actions"
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
 * Une recette aplatie pour la vignette (§7.6).
 */
export type RecipeCardView = {
  id: string
  titre: string
  dureeMinutes: number | null
  typePlat: TypePlat
  tags: Tag[]
  caloriesParPortion: number | null
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
export function RecipesBrowser({
  recipes,
  coupleId,
}: {
  recipes: RecipeCardView[]
  coupleId: string
}) {
  useRealtimeRecipes(coupleId)

  const [query, setQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Set<TypePlat>>(new Set())
  const [selectedTags, setSelectedTags] = useState<Set<Tag>>(new Set())
  // Replie le bloc de filtres par défaut : la recherche reste toujours visible.
  const [filtersOpen, setFiltersOpen] = useState(false)
  // La tuile fantôme (fin de grille) ouvre le chooser d'ajout (§4.6).
  const [adding, setAdding] = useState(false)

  // Toast « Supprimé · ANNULER » (PRD_V4.1 §4.5) : un seul à la fois pour ce
  // carnet, une nouvelle suppression remplace l'ancien.
  const [undo, setUndo] = useState<{
    key: number
    restore: () => Promise<DeleteRecipeResult>
  } | null>(null)
  const undoKeyRef = useRef(0)

  function handleRecipeDeleted(recipeId: string) {
    undoKeyRef.current += 1
    setUndo({
      key: undoKeyRef.current,
      restore: () => restoreRecipe(recipeId),
    })
  }

  const undoToast = undo && (
    <UndoToast
      key={undo.key}
      onUndo={undo.restore}
      onDismiss={() => setUndo(null)}
    />
  )

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

  // Carnet entièrement vide : message d'amorçage + tuile fantôme (§4.6), qui
  // reste le point d'entrée unique vers l'ajout / la création IA.
  if (recipes.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {undoToast}
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Ton carnet de recettes est encore vide. Ajoute ta première recette en
          photographiant une fiche, même manuscrite — ou laisse l’IA t’en
          composer une, via la tuile{" "}
          <Plus className="inline size-3.5 align-text-bottom" strokeWidth={3} aria-hidden />{" "}
          en pointillés ci-dessous.
        </p>
        <GhostTile label="Nouvelle recette" onClick={() => setAdding(true)} />
        <NewRecipeSheet open={adding} onOpenChange={setAdding} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {undoToast}

      {/* Recherche par titre — la bascule des filtres est intégrée dans la barre */}
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-paper-light pl-3 pr-1.5 shadow-riso-ink focus-within:shadow-riso-sauge">
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
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-label={`Filtrer les recettes${activeFilterCount > 0 ? ` (${activeFilterCount} actif${activeFilterCount > 1 ? "s" : ""})` : ""}`}
          onClick={() => setFiltersOpen((v) => !v)}
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-[7px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <SlidersHorizontal className="size-5" strokeWidth={2.5} aria-hidden />
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 inline-flex size-4 items-center justify-center rounded-[5px] border-2 border-ink bg-brique text-[9px] text-paper-light">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {activeFilterCount > 0 && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex min-h-11 items-center gap-1 self-start rounded-[8px] px-2 font-mono text-[12px] font-bold text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          <X className="size-3.5" strokeWidth={2.5} aria-hidden /> Effacer
        </button>
      )}

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
              <RecipeCard recipe={recipe} onDeleted={handleRecipeDeleted} />
            </li>
          ))}
        </ul>
      )}

      {/* Tuile fantôme (§4.6) : le geste d'ajout, en fin de grille. Remplace le
          FAB « + » supprimé ; ouvre le même flux (« Ajouter » / « Créer IA »). */}
      <GhostTile label="Nouvelle recette" onClick={() => setAdding(true)} />
      <NewRecipeSheet open={adding} onOpenChange={setAdding} />
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

/** Largeur révélée par le swipe : une seule cible tactile de 64px (≥ 44px). */
const SWIPE_REVEAL = 64

/**
 * Vignette cliquable (§7.6) : titre, méta (durée · type · calories/portion) et
 * jusqu'à trois étiquettes. Toute la carte est un lien vers la fiche détaillée.
 *
 * Geste « glisser pour révéler » (mutualisé via {@link useSwipeReveal}, comme
 * les tuiles de listes) : la carte glisse vers la gauche pour découvrir une
 * corbeille. Au tap, un Dialog modal demande confirmation, puis soft-delete
 * (PRD_V4.1 §4.2) — le parent propose le toast ANNULER (§4.5). Pas de mode
 * édition ici : juste supprimer. Le calque corbeille est focusable →
 * pleinement accessible clavier.
 */
function RecipeCard({
  recipe,
  onDeleted,
}: {
  recipe: RecipeCardView
  /** Suppression confirmée : le parent décide s'il propose le toast ANNULER. */
  onDeleted: (recipeId: string) => void
}) {
  const duree = formatDuree(recipe.dureeMinutes)
  // On limite à 3 étiquettes affichées (+ « +N ») pour garder la carte lisible.
  const tagsVisibles = recipe.tags.slice(0, 3)
  const tagsRestants = recipe.tags.length - tagsVisibles.length

  // Confirmation de suppression : Dialog modal base-ui (focus trap + cohérence).
  const [deleting, setDeleting] = useState(false)

  const {
    offset,
    setOffset,
    dragging,
    didDragRef,
    close: closeSwipe,
    swipeHandlers,
  } = useSwipeReveal({ revealWidth: SWIPE_REVEAL, enabled: !deleting })

  return (
    <div
      className={cn(
        // L'ombre riso vit sur le wrapper : `overflow-hidden` clippe la carte qui
        // glisse (et les coins du calque) mais JAMAIS l'ombre décalée du wrapper.
        "relative overflow-hidden rounded-[12px] shadow-riso-sauge",
      )}
    >
      {/* Calque d'action (Supprimer). Révélé au doigt/souris par le glissement,
          ET accessible au clavier : le bouton est focusable et labellisé ;
          recevoir le focus ouvre la carte, le perdre la referme. */}
      <div
        className="absolute inset-y-0 right-0 z-0 flex overflow-hidden rounded-r-[12px] border-y-2 border-r-2 border-ink"
        onFocus={() => setOffset(-SWIPE_REVEAL)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSwipe()
        }}
      >
        <button
          type="button"
          aria-label={`Supprimer la recette ${recipe.titre}`}
          onClick={() => {
            closeSwipe()
            setDeleting(true)
          }}
          className="inline-flex w-16 items-center justify-center bg-brique text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper-light"
        >
          <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {/* Carte au premier plan : glisse via translateX. `touch-pan-y` laisse le
          scroll vertical au navigateur et nous réserve l'horizontale. */}
      <div
        className={cn(
          "relative z-10 touch-pan-y select-none",
          dragging
            ? ""
            : "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ transform: `translateX(${offset}px)` }}
        {...swipeHandlers}
        onClickCapture={(e) => {
          // Click de fin de glissement : on l'avale (ni navigation ni fermeture)
          // pour que la carte RESTE ouverte sur la corbeille.
          if (didDragRef.current) {
            e.preventDefault()
            e.stopPropagation()
            didDragRef.current = false
            return
          }
          // Vrai tap sur une carte déjà ouverte : on referme au lieu de naviguer.
          if (offset !== 0) {
            e.preventDefault()
            e.stopPropagation()
            closeSwipe()
          }
        }}
      >
        <Link
          href={`/recipes/${recipe.id}`}
          className={cn(
            "relative flex border-2 border-ink bg-paper-light p-2.5 text-ink outline-none transition-transform focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px",
            // Une fois glissée, on carre le bord droit au contact du calque brique.
            offset !== 0 || dragging
              ? "rounded-l-[12px] rounded-r-none"
              : "rounded-[12px]",
          )}
        >
          {/* Repère de découvrabilité : petite languette encre sur le bord droit,
              qui signale que la carte se tire vers la gauche pour révéler la
              corbeille. Cliquable (souris/tactile) → ouvre directement le calque,
              pour qui ne devine pas le geste. aria-hidden + hors tabulation : le
              clavier passe par le bouton Supprimer, déjà focusable. */}
          {offset === 0 && (
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={(e) => {
                // Sur le lien : on intercepte pour ouvrir le calque sans naviguer.
                e.preventDefault()
                e.stopPropagation()
                setOffset(-SWIPE_REVEAL)
              }}
              title="Afficher l’action (ou glisser la carte vers la gauche)"
              className="absolute -right-0.5 top-1/2 z-10 inline-flex h-11 w-6 -translate-y-1/2 items-center justify-end outline-none"
            >
              <span aria-hidden className="block h-9 w-1.5 rounded-full bg-ink" />
            </button>
          )}

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
      </div>

      <DeleteRecipeDialog
        recipe={recipe}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={onDeleted}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Confirmation de suppression (Dialog modal)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Dialog de confirmation avant suppression d'une recette.
 *
 * Modal base-ui (mêmes codes que la suppression de liste) pour le piège de focus
 * et la cohérence. « Annuler » reçoit le focus initial et fait office de bouton
 * par défaut, afin d'éviter les suppressions par erreur ; « Supprimer » (variante
 * brique) lance réellement `deleteRecipe`. À la réussite, la recette disparaît du
 * carnet via revalidatePath ; on referme le Dialog et on prévient le parent, qui
 * propose le toast ANNULER (PRD_V4.1 §4.5).
 */
function DeleteRecipeDialog({
  recipe,
  open,
  onOpenChange,
  onDeleted,
}: {
  recipe: RecipeCardView
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Suppression réussie : le parent décide s'il propose le toast ANNULER. */
  onDeleted: (recipeId: string) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()
  const cancelRef = useRef<HTMLButtonElement>(null)

  function confirmDelete() {
    setError(undefined)
    startTransition(async () => {
      const result = await deleteRecipe(recipe.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      onDeleted(recipe.id)
    })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(undefined)
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          initialFocus={cancelRef}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 -translate-y-1/2",
            "rounded-[16px] border-[2.5px] border-ink bg-paper p-5 shadow-riso-ink",
            "transition-[opacity,transform] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none",
          )}
        >
          <Dialog.Title className="font-display text-lg uppercase leading-tight text-ink">
            Supprimer la recette ?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] leading-snug text-ink">
            Êtes-vous sûr de vouloir supprimer la recette « {recipe.titre} » et
            tous ses ingrédients&nbsp;?
          </Dialog.Description>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-[8px] border-2 border-brique bg-brique/10 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-ink"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <RisoButton
              ref={cancelRef}
              variant="secondary"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </RisoButton>
            <RisoButton
              variant="primary"
              disabled={isPending}
              aria-busy={isPending}
              onClick={confirmDelete}
            >
              {isPending ? "…" : "Supprimer"}
            </RisoButton>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
