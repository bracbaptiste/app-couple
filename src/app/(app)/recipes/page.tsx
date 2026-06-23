import Link from "next/link"
import { redirect } from "next/navigation"
import { Plus } from "lucide-react"

import { risoButtonVariants } from "@/components/ui/riso-button"
import { requireAuth } from "@/lib/supabase/auth"
import { cn } from "@/lib/utils"

/**
 * Carnet de recettes (/recipes) — point d'entrée du module.
 *
 * Pour l'instant : en-tête + bouton « Ajouter une recette » (§7.1). La liste
 * filtrable des recettes (§7.6) est une tâche distincte ; cette page lui servira
 * de coquille une fois construite.
 */
export default async function RecipesPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">Recettes</h1>

      <Link
        href="/recipes/new"
        className={cn(risoButtonVariants(), "h-12 w-full text-sm")}
      >
        <Plus aria-hidden /> Ajouter une recette
      </Link>

      <p className="mt-6 rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
        Ton carnet de recettes est encore vide. Ajoute ta première recette en
        photographiant une fiche, même manuscrite.
      </p>
    </section>
  )
}
