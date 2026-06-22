import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { groupLibraryItems } from "@/lib/utils/group-library-items"

import {
  LibraryBrowser,
  type CategoryGroup,
  type CategoryChoice,
  type ListChoice,
} from "./library-client"

/**
 * Bibliothèque (/library) — liste maître des produits déjà utilisés par le couple.
 *
 * Lecture (server component, sous RLS — on ne voit que les données de son
 * couple) :
 *   - tous les `library_items` du couple (nom, rayon, fréquence d'usage) ;
 *   - les rayons du couple, triés par `position` (ordre d'affichage des groupes) ;
 *   - les listes du couple (cibles de l'action « Envoyer vers… »).
 *
 * On groupe ici par rayon et on trie chaque rayon par `usage_count` décroissant
 * puis `last_used_at` décroissant. La recherche, l'envoi vers une liste et la
 * suppression vivent côté client (`./library-client.tsx` + `./actions.ts`).
 */
export default async function LibraryPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  const [itemsRes, categoriesRes, listsRes] = await Promise.all([
    supabase
      .from("library_items")
      .select("id, name, category_id, usage_count, last_used_at")
      .eq("couple_id", profile.couple_id),
    supabase
      .from("categories")
      .select("id, name")
      .eq("couple_id", profile.couple_id)
      .order("position", { ascending: true }),
    supabase
      .from("lists")
      .select("id, name")
      .eq("couple_id", profile.couple_id)
      .eq("kind", "courses")
      .order("position", { ascending: true }),
  ])

  if (itemsRes.error || categoriesRes.error || listsRes.error) {
    throw new Error("Impossible de charger la bibliothèque")
  }

  const items = itemsRes.data ?? []
  const categories = categoriesRes.data ?? []

  // Regroupe les produits par rayon, calcule les pastilles de fréquence et trie
  // chaque rayon (logique pure extraite, cf. group-library-items.ts).
  const groups: CategoryGroup[] = groupLibraryItems(items, categories)

  const lists: ListChoice[] = (listsRes.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
  }))

  // Tous les rayons du couple (pas seulement ceux qui contiennent un produit) —
  // pour le sélecteur de rayon à la création et à l'édition d'un article.
  const categoryChoices: CategoryChoice[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
  }))

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">
        Garde-manger
      </h1>
      <LibraryBrowser
        groups={groups}
        lists={lists}
        categories={categoryChoices}
        total={items.length}
        coupleId={profile.couple_id}
      />
    </section>
  )
}
