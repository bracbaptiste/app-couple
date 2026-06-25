"use client"

import { useRouter } from "next/navigation"

import { type RecetteExtraite } from "@/lib/recipes/extraction"

import { ReviewForm } from "../../new/review-form"

/**
 * Enveloppe client de l'édition manuelle (Option A). Réutilise le `ReviewForm` en
 * mode édition (prop `recipeId`) : aucune photo n'est rattachée à une recette déjà
 * en base, donc pas d'aperçu. « Annuler » comme « Enregistrer » ramènent à la
 * fiche, qu'on rafraîchit pour refléter les changements.
 */
export function EditRecipeClient({
  recipeId,
  recette,
}: {
  recipeId: string
  recette: RecetteExtraite
}) {
  const router = useRouter()

  function retourFiche() {
    router.push(`/recipes/${recipeId}`)
    router.refresh()
  }

  return (
    <section className="mx-auto w-full max-w-sm">
      <ReviewForm
        recette={recette}
        recipeId={recipeId}
        photoPreviewUrls={[]}
        onCancel={retourFiche}
        onSaved={retourFiche}
      />
    </section>
  )
}
