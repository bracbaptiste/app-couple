import type { CategoryGroup, Frequency, LibraryItemView } from "@/app/(app)/library/library-client"

/** Clé de regroupement pour les produits sans rayon (placés en dernier). */
export const NO_CATEGORY = "__none__"

/** Forme brute d'un produit telle que lue en base (sous-ensemble utilisé ici). */
export type RawLibraryItem = {
  id: string
  name: string
  category_id: string | null
  usage_count: number
  last_used_at: string
}

/** Un rayon, tel que lu en base (sous-ensemble utilisé ici). */
export type RawCategory = {
  id: string
  name: string
}

/**
 * Convertit un `usage_count` en niveau de fréquence à 4 paliers (les pastilles).
 *
 * Échelle (quasi géométrique : 1 / 2-3 / 4-7 / 8+) — calquée sur la façon dont
 * l'usage se répartit réellement (loi de puissance : beaucoup de produits rares,
 * peu de produits très fréquents). Des seuils absolus la rendent stable et
 * lisible : un produit ne « rétrograde » pas parce qu'un autre a été acheté.
 *   4 = très fréquent · 3 = fréquent · 2 = occasionnel · 1 = rare
 */
export function frequencyLevel(usageCount: number): Frequency {
  if (usageCount >= 8) return 4
  if (usageCount >= 4) return 3
  if (usageCount >= 2) return 2
  return 1
}

/** Tri d'un rayon : usage_count décroissant, puis last_used_at décroissant. */
function sortBucket(bucket: LibraryItemView[]): LibraryItemView[] {
  return bucket.sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount
    return Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt)
  })
}

/**
 * Regroupe les produits de la bibliothèque par rayon, prêts pour le rendu.
 *
 *   - chaque produit reçoit sa pastille de fréquence ({@link frequencyLevel}) ;
 *   - un produit pointant vers un rayon inconnu (supprimé / `category_id`
 *     orphelin) retombe dans « Sans rayon » au lieu de disparaître ;
 *   - les groupes suivent l'ordre des rayons fournis (déjà triés par `position`),
 *     « Sans rayon » fermant la marche ;
 *   - chaque rayon est trié par fréquence décroissante puis récence.
 */
export function groupLibraryItems(
  items: RawLibraryItem[],
  categories: RawCategory[],
): CategoryGroup[] {
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

  return groups
}
