import { describe, expect, it } from "vitest"

import { ITEM_NAME_MAX, normalizeItemName } from "./normalize-item-name"

describe("normalizeItemName", () => {
  it("trim et réduit les espaces multiples", () => {
    expect(normalizeItemName("  pain   de  mie  ")).toBe("Pain de mie")
  })

  it("uniformise la casse (1re majuscule, reste minuscule)", () => {
    // Le cœur de la déduplication : ces trois saisies donnent le même libellé.
    expect(normalizeItemName("LESSIVE")).toBe("Lessive")
    expect(normalizeItemName("lessive")).toBe("Lessive")
    expect(normalizeItemName("LeSsIvE")).toBe("Lessive")
  })

  it("renvoie une chaîne vide pour une entrée vide ou non significative", () => {
    expect(normalizeItemName("")).toBe("")
    expect(normalizeItemName("   ")).toBe("")
    expect(normalizeItemName(null)).toBe("")
    expect(normalizeItemName(undefined)).toBe("")
  })

  it("borne la longueur à ITEM_NAME_MAX", () => {
    const long = "a".repeat(ITEM_NAME_MAX + 20)
    const result = normalizeItemName(long)
    expect(result).toHaveLength(ITEM_NAME_MAX)
    expect(result.startsWith("A")).toBe(true)
  })

  it("préserve les caractères internes (accents, chiffres)", () => {
    expect(normalizeItemName("Café 250g")).toBe("Café 250g")
  })
})
