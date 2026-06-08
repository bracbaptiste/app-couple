import { describe, expect, it } from "vitest"

import {
  NO_CATEGORY,
  frequencyLevel,
  groupLibraryItems,
  type RawCategory,
  type RawLibraryItem,
} from "./group-library-items"

/** Fabrique un produit brut avec des valeurs par défaut raisonnables. */
function item(over: Partial<RawLibraryItem> & { id: string }): RawLibraryItem {
  return {
    name: over.id,
    category_id: null,
    usage_count: 1,
    last_used_at: "2026-01-01T00:00:00.000Z",
    ...over,
  }
}

describe("frequencyLevel (pastilles)", () => {
  it("applique l'échelle à seuils 1 / 2-3 / 4-7 / 8+", () => {
    expect(frequencyLevel(0)).toBe(1)
    expect(frequencyLevel(1)).toBe(1)
    expect(frequencyLevel(2)).toBe(2)
    expect(frequencyLevel(3)).toBe(2)
    expect(frequencyLevel(4)).toBe(3)
    expect(frequencyLevel(7)).toBe(3)
    expect(frequencyLevel(8)).toBe(4)
    expect(frequencyLevel(50)).toBe(4)
  })
})

describe("groupLibraryItems", () => {
  const categories: RawCategory[] = [
    { id: "cat-1", name: "Fruits & Légumes" },
    { id: "cat-2", name: "Épicerie" },
  ]

  it("groupe les produits par rayon dans l'ordre des catégories", () => {
    const items = [
      item({ id: "a", category_id: "cat-2" }),
      item({ id: "b", category_id: "cat-1" }),
    ]
    const groups = groupLibraryItems(items, categories)
    expect(groups.map((g) => g.id)).toEqual(["cat-1", "cat-2"])
    expect(groups[0].name).toBe("Fruits & Légumes")
  })

  it("calcule la pastille de fréquence de chaque produit", () => {
    const items = [item({ id: "a", category_id: "cat-1", usage_count: 8 })]
    const groups = groupLibraryItems(items, categories)
    expect(groups[0].items[0].frequency).toBe(4)
  })

  it("trie chaque rayon par usage décroissant puis récence", () => {
    const items = [
      item({ id: "rare", category_id: "cat-1", usage_count: 1 }),
      item({ id: "freq", category_id: "cat-1", usage_count: 9 }),
      item({
        id: "recent",
        category_id: "cat-1",
        usage_count: 1,
        last_used_at: "2026-05-01T00:00:00.000Z",
      }),
    ]
    const [group] = groupLibraryItems(items, categories)
    // usage 9 d'abord ; à usage égal, le plus récemment utilisé devance.
    expect(group.items.map((i) => i.id)).toEqual(["freq", "recent", "rare"])
  })

  it("range les produits sans rayon (ou rayon orphelin) dans « Sans rayon » en fin", () => {
    const items = [
      item({ id: "orphan", category_id: "cat-supprimée" }),
      item({ id: "none", category_id: null }),
      item({ id: "ok", category_id: "cat-1" }),
    ]
    const groups = groupLibraryItems(items, categories)
    const last = groups[groups.length - 1]
    expect(last.id).toBe(NO_CATEGORY)
    expect(last.name).toBe("Sans rayon")
    expect(last.items.map((i) => i.id).sort()).toEqual(["none", "orphan"])
    expect(last.items.every((i) => i.categoryId === null)).toBe(true)
  })

  it("omet les rayons vides", () => {
    const items = [item({ id: "a", category_id: "cat-1" })]
    const groups = groupLibraryItems(items, categories)
    expect(groups.map((g) => g.id)).toEqual(["cat-1"])
  })

  it("renvoie un tableau vide sans produit", () => {
    expect(groupLibraryItems([], categories)).toEqual([])
  })
})
