import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

import { CategoriesManager, type CategoryView } from "./categories-client"

/**
 * Gestion des rayons (/profile/categories).
 *
 * Sous-page dédiée (atteinte depuis la tuile « Rayons du couple » du Profil) :
 * on y renomme, réordonne, ajoute et supprime les rayons du couple. Les
 * mutations passent par les Server Actions de `../actions.ts`.
 *
 * Lecture (server component, sous RLS — on ne voit que son propre couple) :
 *   - catégories du couple + nombre de produits (bibliothèque) par rayon.
 */
export default async function CategoriesPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const [categoriesRes, libItemsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, position")
      .eq("couple_id", profile.couple_id)
      .order("position", { ascending: true }),
    supabase
      .from("library_items")
      .select("category_id")
      .eq("couple_id", profile.couple_id)
      .is("deleted_at", null),
  ])

  if (categoriesRes.error || libItemsRes.error) {
    throw new Error("Impossible de charger les rayons")
  }

  // Décompte des produits par rayon (pour bloquer une suppression « brutale »).
  const counts = new Map<string, number>()
  for (const item of libItemsRes.data ?? []) {
    if (item.category_id) {
      counts.set(item.category_id, (counts.get(item.category_id) ?? 0) + 1)
    }
  }

  const categories: CategoryView[] = (categoriesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    itemCount: counts.get(c.id) ?? 0,
  }))

  return (
    <section className="mx-auto w-full max-w-sm">
      <div className="mb-4">
        {/* Retour vers le Profil : cible tap 44px, aligné au bord gauche. */}
        <Link
          href="/profile"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Profil
        </Link>
        <h1 className="mt-1 font-display text-xl uppercase text-ink">
          Rayons du couple
        </h1>
      </div>

      <CategoriesManager categories={categories} />
    </section>
  )
}
