"use client"

import { Minus, Plus, Users, BookmarkPlus, Check, CheckSquare, Square } from "lucide-react"
import { useState, useTransition } from "react"

import { cn } from "@/lib/utils"
import { formatQuantiteAjustee } from "@/lib/recipes/format"
import type { Unite } from "@/lib/recipes/extraction"
import { addIngredientToLibrary } from "@/app/(app)/recipes/actions"

import { AddToShoppingList, type ListeCible } from "./add-to-list"

/** Un ingrédient de la recette, en quantité de BASE (avant ajustement §8.2). */
export type IngredientView = {
  id: string
  nom: string
  quantite: number | null
  unite: Unite | null
}

/** Bornes du sélecteur « pour N personnes » (§8.2). */
const MIN_PERS = 1
const MAX_PERS = 50

/**
 * Section « Ingrédients » interactive de la fiche recette (PRD_recettes §8.2 +
 * §8.4). Composant client car il porte deux interactions :
 *   - le sélecteur « pour N personnes » qui recalcule les quantités affichées
 *     (ratio = N choisi / nombre de personnes de base) ;
 *   - le bouton « Ajouter à ma bibliothèque » par ingrédient (§8.4).
 *
 * Le N choisi est transmis au bouton d'ajout à la liste de courses : à l'ajout,
 * ce sont les quantités AJUSTÉES qui partent (le serveur recalcule le ratio,
 * cf. addRecipeIngredientsToList). Le balisage des cartes ingrédient reprend à
 * l'identique celui de la fiche (mêmes classes riso) pour rester homogène.
 */
export function RecipeServings({
  recipeId,
  nombrePersonnesBase,
  ingredients,
  listes,
}: {
  recipeId: string
  nombrePersonnesBase: number
  ingredients: IngredientView[]
  listes: ListeCible[]
}) {
  // Base bornée à ≥ 1 (donnée ancienne), pour ne jamais diviser par 0.
  const base = nombrePersonnesBase > 0 ? Math.round(nombrePersonnesBase) : 1
  const [personnes, setPersonnes] = useState(base)
  const ratio = personnes / base

  // Sélection des ingrédients à envoyer dans la liste de courses (§8.1). Par
  // défaut tout est coché (comportement historique : on ajoute toute la recette).
  const [selection, setSelection] = useState<Set<string>>(
    () => new Set(ingredients.map((ing) => ing.id)),
  )
  const toutCoche = selection.size === ingredients.length && ingredients.length > 0

  // Mode sélection : en simple consultation, les ingrédients sont en lecture
  // seule (pas de cases ni de bouton « tout (dé)sélectionner »). On n'affiche
  // ces commandes qu'après un clic sur « Ajouter à la liste de courses ».
  const [modeSelection, setModeSelection] = useState(false)

  // Une fois un ajout effectué, la sélection se fige : plus de coche ni d'action
  // sur les ingrédients (la liste reflète exactement ce qui a été envoyé).
  const [verrouille, setVerrouille] = useState(false)

  function basculer(id: string) {
    if (verrouille) return
    setSelection((prev) => {
      const suiv = new Set(prev)
      if (suiv.has(id)) suiv.delete(id)
      else suiv.add(id)
      return suiv
    })
  }

  function basculerTout() {
    if (verrouille) return
    setSelection((prev) =>
      prev.size === ingredients.length
        ? new Set()
        : new Set(ingredients.map((ing) => ing.id)),
    )
  }

  // Sort du mode sélection : on rétablit « tout coché » pour repartir propre.
  function annulerSelection() {
    setModeSelection(false)
    setSelection(new Set(ingredients.map((ing) => ing.id)))
  }

  return (
    <>
      <section className="mt-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[15px] uppercase text-ink">
            Ingrédients
          </h2>

          {/* Sélecteur « pour N personnes » (§8.2). Cibles tap 44px (RisoButton). */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Moins de personnes"
              disabled={personnes <= MIN_PERS}
              onClick={() => setPersonnes((n) => Math.max(MIN_PERS, n - 1))}
              className="inline-flex size-9 items-center justify-center rounded-[8px] border-2 border-ink bg-paper-light text-ink shadow-riso-sauge outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-40"
            >
              <Minus className="size-4" strokeWidth={2.5} aria-hidden />
            </button>
            <span className="inline-flex min-w-[72px] items-center justify-center gap-1 font-mono text-[12px] text-ink-soft">
              <Users className="size-4" strokeWidth={2.5} aria-hidden />
              <span aria-live="polite">{personnes} pers.</span>
            </span>
            <button
              type="button"
              aria-label="Plus de personnes"
              disabled={personnes >= MAX_PERS}
              onClick={() => setPersonnes((n) => Math.min(MAX_PERS, n + 1))}
              className="inline-flex size-9 items-center justify-center rounded-[8px] border-2 border-ink bg-paper-light text-ink shadow-riso-sauge outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-40"
            >
              <Plus className="size-4" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        </div>

        {ingredients.length === 0 ? (
          <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-4 text-center text-[13px] text-ink-soft">
            Aucun ingrédient renseigné.
          </p>
        ) : (
          <>
            {/* Sélection pour l'ajout à la liste (§8.1) : tout cocher / décocher.
                Visible uniquement en mode sélection (après un clic sur « Ajouter
                à la liste »), masqué une fois la sélection figée (après un ajout). */}
            {modeSelection && !verrouille && (
              <button
                type="button"
                onClick={basculerTout}
                className="inline-flex items-center gap-1.5 self-start rounded-[8px] px-1 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
              >
                {toutCoche ? (
                  <CheckSquare className="size-4" strokeWidth={2.5} aria-hidden />
                ) : (
                  <Square className="size-4" strokeWidth={2.5} aria-hidden />
                )}
                {toutCoche ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
            )}
            <ul className="flex flex-col gap-1.5">
              {ingredients.map((ing) => (
                <IngredientRow
                  key={ing.id}
                  recipeId={recipeId}
                  ing={ing}
                  ratio={ratio}
                  afficherCase={modeSelection}
                  selectionne={selection.has(ing.id)}
                  onBasculer={() => basculer(ing.id)}
                  verrouille={verrouille}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Ajout à la liste de courses (§8.1) : on transmet le N choisi pour que
          les quantités ajoutées soient ajustées (§8.2) et la sélection cochée. */}
      <AddToShoppingList
        recipeId={recipeId}
        listes={listes}
        nombrePersonnes={personnes}
        ingredientIds={[...selection]}
        totalIngredients={ingredients.length}
        modeSelection={modeSelection}
        onDemarrerSelection={() => setModeSelection(true)}
        onAnnulerSelection={annulerSelection}
        onAjoute={() => setVerrouille(true)}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne d'ingrédient (quantité ajustée + « Ajouter à ma bibliothèque »)      */
/* -------------------------------------------------------------------------- */

type Statut =
  | { kind: "idle" }
  | { kind: "ajoute" }
  | { kind: "existant" }
  | { kind: "erreur"; message: string }

function IngredientRow({
  recipeId,
  ing,
  ratio,
  afficherCase,
  selectionne,
  onBasculer,
  verrouille,
}: {
  recipeId: string
  ing: IngredientView
  ratio: number
  /** Affiche la case à cocher (mode sélection actif uniquement). */
  afficherCase: boolean
  /** Coché ⇒ part dans la liste de courses à l'ajout (§8.1). */
  selectionne: boolean
  onBasculer: () => void
  /** Sélection figée (après un ajout) : plus d'interaction sur la ligne. */
  verrouille: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [statut, setStatut] = useState<Statut>({ kind: "idle" })

  function ajouterABibliotheque() {
    startTransition(async () => {
      const res = await addIngredientToLibrary(recipeId, ing.id)
      if (res.ok) {
        setStatut({ kind: res.created ? "ajoute" : "existant" })
      } else {
        setStatut({ kind: "erreur", message: res.error })
      }
    })
  }

  // Une fois ajouté (ou déjà présent), on remplace le bouton par une coche : le
  // geste a abouti, plus rien à faire. Une erreur laisse le bouton pour réessayer.
  const fait = statut.kind === "ajoute" || statut.kind === "existant"

  return (
    <li className="flex flex-col gap-1 rounded-[10px] border-2 border-ink bg-paper-light px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Case à cocher : inclure (ou non) cet ingrédient dans la liste (§8.1).
            Affichée seulement en mode sélection (sinon lecture seule). */}
        {afficherCase && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selectionne}
            disabled={verrouille}
            aria-label={`${selectionne ? "Retirer" : "Ajouter"} ${ing.nom} de la sélection`}
            onClick={onBasculer}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] border-2 border-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light active:translate-x-px active:translate-y-px disabled:cursor-default",
              selectionne ? "bg-sauge text-ink" : "bg-paper text-transparent",
              verrouille && !selectionne && "opacity-40",
            )}
          >
            <Check className="size-4" strokeWidth={3} aria-hidden />
          </button>
        )}
        <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
          {ing.nom}
        </span>
        <span className="shrink-0 font-mono text-[12px] text-ink-soft">
          {formatQuantiteAjustee(ing.quantite, ing.unite, ratio)}
        </span>
        {fait ? (
          <span
            className="inline-flex size-9 shrink-0 items-center justify-center text-sauge"
            aria-hidden
          >
            <Check className="size-5" strokeWidth={2.5} />
          </span>
        ) : (
          <button
            type="button"
            onClick={ajouterABibliotheque}
            disabled={pending || verrouille}
            aria-label={`Ajouter ${ing.nom} à ma bibliothèque`}
            title="Ajouter à ma bibliothèque"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-1 focus-visible:ring-offset-paper-light active:translate-x-px active:translate-y-px disabled:opacity-40"
          >
            <BookmarkPlus className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {statut.kind !== "idle" && (
        <p
          role="status"
          className={cn(
            "font-mono text-[11px] leading-snug",
            statut.kind === "erreur" ? "text-brique" : "text-ink-soft",
          )}
        >
          {statut.kind === "ajoute" && "Ajouté à ta bibliothèque."}
          {statut.kind === "existant" && "Déjà dans ta bibliothèque."}
          {statut.kind === "erreur" && statut.message}
        </p>
      )}
    </li>
  )
}
