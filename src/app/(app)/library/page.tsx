import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"

import {
  LibraryBrowser,
  type CategoryGroup,
  type LibraryItemView,
  type ListChoice,
} from "./library-client"

/** Clé de regroupement pour les produits sans rayon (placés en dernier). */
const NO_CATEGORY = "__none__"

/**
 * Convertit un `usage_count` en niveau de fréquence à 4 paliers (les pastilles).
 *
 * Échelle (quasi géométrique : 1 / 2-3 / 4-7 / 8+) — calquée sur la façon dont
 * l'usage se répartit réellement (loi de puissance : beaucoup de produits rares,
 * peu de produits très fréquents). Des seuils absolus la rendent stable et
 * lisible : un produit ne « rétrograde » pas parce qu'un autre a été acheté.
 *   4 = très fréquent · 3 = fréquent · 2 = occasionnel · 1 = rare
 */
function frequencyLevel(usageCount: number): 1 | 2 | 3 | 4 {
  if (usageCount >= 8) return 4
  if (usageCount >= 4) return 3
  if (usageCount >= 2) return 2
  return 1
}

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
      .order("position", { ascending: true }),
  ])

  const items = itemsRes.data ?? []
  const categories = categoriesRes.data ?? []

  // Regroupe les produits par rayon. Un produit pointant vers un rayon inconnu
  // (rayon supprimé / category_id orphelin) retombe dans « Sans rayon » au lieu
  // de disparaître silencieusement.
  const knownCategoryIds = new Set(categories.map((c) => c.id))
  const byCat = new Map<string, LibraryItemView[]>()

  for (const it of items) {
    const key =
      it.category_id && knownCategoryIds.has(it.category_id)
        ? it.category_id
        : NO_CATEGORY
    const view: LibraryItemView = {
      id: it.id,
      name: it.name,
      usageCount: it.usage_count,
      lastUsedAt: it.last_used_at,
      frequency: frequencyLevel(it.usage_count),
      categoryId: key === NO_CATEGORY ? null : it.category_id,
    }
    const bucket = byCat.get(key)
    if (bucket) bucket.push(view)
    else byCat.set(key, [view])
  }

  // Tri dans chaque rayon : fréquence (usage_count) décroissante, puis
  // last_used_at décroissant (le plus récemment utilisé d'abord).
  function sortBucket(bucket: LibraryItemView[]): LibraryItemView[] {
    return bucket.sort((a, b) => {
      if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
      return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt)
    })
  }

  // Groupes dans l'ordre des rayons (categories.position), « Sans rayon » en fin.
  const groups: CategoryGroup[] = []
  for (const cat of categories) {
    const bucket = byCat.get(cat.id)
    if (bucket?.length) {
      groups.push({ id: cat.id, name: cat.name, items: sortBucket(bucket) })
    }
  }
  const none = byCat.get(NO_CATEGORY)
  if (none?.length) {
    groups.push({ id: NO_CATEGORY, name: "Sans rayon", items: sortBucket(none) })
  }

  const lists: ListChoice[] = (listsRes.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
  }))

  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-4 font-display text-xl uppercase text-ink">
        Bibliothèque
      </h1>
      <LibraryBrowser
        groups={groups}
        lists={lists}
        total={items.length}
        coupleId={profile.couple_id}
      />
    </section>
  )
}
