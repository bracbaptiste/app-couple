"use client"

import Link from "next/link"
import { ShoppingCart, Check } from "lucide-react"
import { useState, useTransition } from "react"

import { RisoButton, risoButtonVariants } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"
import { FormFeedback } from "@/app/(auth)/form-ui"
import { decrireFusion } from "@/lib/recipes/format"
import {
  addRecipeIngredientsToList,
  type FusionRecapLigne,
} from "@/app/(app)/recipes/actions"

/** Liste de courses cible proposée dans le sélecteur. */
export type ListeCible = { id: string; name: string }

/** Dernier ajout réussi (§6 « Transparence ») : sert à afficher le récap. */
type DernierAjout = { listId: string; recap: FusionRecapLigne[] }

/**
 * Bouton « Ajouter à la liste de courses » d'une fiche recette (PRD_recettes
 * §8.1). L'utilisateur choisit la liste cible (§ décision : sélecteur de liste),
 * l'action serveur fusionne les quantités (§6), et on affiche le récap
 * transparent (« tomate : 200 + 300 = 500 g »).
 *
 * Après un ajout, le récap s'empile au-dessus et le menu d'ajout RESTE déployé
 * en dessous : la sélection (figée côté fiche, cf. `onAjoute`) peut ainsi être
 * renvoyée vers une autre liste sans la remanier.
 */
export function AddToShoppingList({
  recipeId,
  listes,
  nombrePersonnes,
  ingredientIds,
  totalIngredients,
  modeSelection,
  onDemarrerSelection,
  onAnnulerSelection,
  onAjoute,
}: {
  recipeId: string
  listes: ListeCible[]
  /** N choisi sur la fiche (§8.2) : les quantités ajoutées sont ajustées en
   *  conséquence, côté serveur. */
  nombrePersonnes: number
  /** Ingrédients cochés sur la fiche (§8.1). Seuls ceux-ci sont ajoutés. */
  ingredientIds: string[]
  /** Nombre total d'ingrédients de la recette (pour le libellé du bouton). */
  totalIngredients: number
  /** Mode sélection actif : les cases à cocher sont affichées sur la fiche. En
   *  lecture seule, le bouton ne fait que démarrer la sélection. */
  modeSelection: boolean
  /** Premier clic « Ajouter à la liste » : ouvre la sélection des ingrédients. */
  onDemarrerSelection: () => void
  /** Abandon de la sélection en cours : retour à la lecture seule. */
  onAnnulerSelection: () => void
  /** Appelé au premier ajout réussi : la fiche fige alors la sélection. */
  onAjoute?: () => void
}) {
  // Dernier ajout réussi (récap) et ouverture du sélecteur de liste sont
  // indépendants : le récap reste affiché pendant qu'on rouvre le menu.
  const [dernier, setDernier] = useState<DernierAjout | null>(null)
  const [choixOuvert, setChoixOuvert] = useState(false)
  const [erreur, setErreur] = useState<string | undefined>()
  const [pending, startTransition] = useTransition()

  // Aucune liste de courses : on ne peut rien cibler.
  if (listes.length === 0) {
    return (
      <p className="mt-6 rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-3 text-center text-[13px] text-ink-soft">
        Crée une liste de courses pour pouvoir y ajouter ces ingrédients.
      </p>
    )
  }

  function ajouter(listId: string) {
    setErreur(undefined)
    startTransition(async () => {
      const res = await addRecipeIngredientsToList(
        recipeId,
        listId,
        nombrePersonnes,
        ingredientIds,
      )
      if (res.ok) {
        setDernier({ listId: res.listId, recap: res.recap })
        setChoixOuvert(false)
        // La fiche fige la sélection : après un ajout, on ne re-coche plus.
        onAjoute?.()
      } else {
        setErreur(res.error)
      }
    })
  }

  const nbSelection = ingredientIds.length
  const aucunSelectionne = nbSelection === 0
  // Une fois un premier ajout fait, la sélection est figée : on propose de
  // l'envoyer « à une autre liste ».
  const libelle = pending
    ? "Ajout en cours…"
    : dernier
      ? "Ajouter à une autre liste"
      : nbSelection === totalIngredients
        ? "Ajouter à la liste de courses"
        : `Ajouter ${nbSelection} ingrédient${nbSelection > 1 ? "s" : ""} à la liste`

  return (
    <div className="mt-6 flex flex-col gap-3">
      {/* --- Récap du dernier ajout (§6 « Transparence ») ------------------ */}
      {dernier && (
        <section className="flex flex-col gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-sauge">
          <h2 className="inline-flex items-center gap-2 font-display text-[15px] uppercase text-ink">
            <span className="inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-sauge">
              <Check className="size-3.5 text-ink" strokeWidth={3} aria-hidden />
            </span>
            Ajouté à {listes.find((l) => l.id === dernier.listId)?.name ?? "la liste"}
          </h2>
          <ul className="flex flex-col gap-1.5">
            {dernier.recap.map((ligne, i) => (
              <li
                key={`${ligne.nom}-${i}`}
                className="flex items-baseline justify-between gap-3 rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-[14px] text-ink"
              >
                <span className="min-w-0 font-medium">{ligne.nom}</span>
                <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                  {decrireFusion(ligne.operation, ligne.quantites)}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={`/lists/${dernier.listId}`}
            className={cn(risoButtonVariants(), "h-11 w-full text-sm")}
          >
            Voir la liste
          </Link>
        </section>
      )}

      {/* --- En lecture seule : le bouton ne fait qu'ouvrir la sélection ------ */}
      {!modeSelection ? (
        <RisoButton
          onClick={onDemarrerSelection}
          className="h-12 w-full text-sm"
        >
          <ShoppingCart aria-hidden />
          Ajouter à la liste de courses
        </RisoButton>
      ) : choixOuvert ? (
        /* --- Sélecteur de liste cible -------------------------------------- */
        <section className="flex flex-col gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-sauge">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Ajouter à quelle liste ?
          </p>
          <div className="flex flex-col gap-2">
            {listes.map((liste) => (
              <RisoButton
                key={liste.id}
                variant="secondary"
                onClick={() => ajouter(liste.id)}
                disabled={pending}
                className="h-12 w-full justify-start text-sm"
              >
                <ShoppingCart aria-hidden /> {liste.name}
              </RisoButton>
            ))}
          </div>
          <RisoButton
            variant="ghost"
            onClick={() => setChoixOuvert(false)}
            disabled={pending}
            className="h-10 w-full text-[11px]"
          >
            Annuler
          </RisoButton>
        </section>
      ) : (
        /* --- Sélection en cours : on valide l'ajout ou on annule ----------- */
        <>
          <RisoButton
            onClick={() => {
              // Une seule liste : on file directement dessus (le sélecteur n'aurait
              // qu'un choix). Sinon on ouvre le sélecteur.
              if (listes.length === 1) ajouter(listes[0].id)
              else setChoixOuvert(true)
            }}
            disabled={pending || aucunSelectionne}
            className="h-12 w-full text-sm"
          >
            <ShoppingCart aria-hidden />
            {libelle}
          </RisoButton>
          {/* Tant qu'aucun ajout n'a abouti, on peut abandonner la sélection. */}
          {!dernier && (
            <RisoButton
              variant="ghost"
              onClick={onAnnulerSelection}
              disabled={pending}
              className="h-10 w-full text-[11px]"
            >
              Annuler
            </RisoButton>
          )}
        </>
      )}
      {erreur && <FormFeedback error={erreur} />}
    </div>
  )
}
