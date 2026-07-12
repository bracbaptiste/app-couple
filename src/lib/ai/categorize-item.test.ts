import { describe, expect, it } from "vitest"

import { pickCategoryFromReply } from "./categorize-item"

const RAYONS = ["Fruits & Légumes", "Épicerie", "Hygiène", "Entretien"]

describe("pickCategoryFromReply", () => {
  it("rapproche une réponse exacte", () => {
    expect(pickCategoryFromReply("Épicerie", RAYONS)).toBe("Épicerie")
  })

  it("tolère casse et accents dans la réponse du modèle", () => {
    expect(pickCategoryFromReply("epicerie", RAYONS)).toBe("Épicerie")
    expect(pickCategoryFromReply("HYGIÈNE", RAYONS)).toBe("Hygiène")
  })

  it("nettoie puce, espaces et lignes superflues", () => {
    expect(pickCategoryFromReply("- Entretien", RAYONS)).toBe("Entretien")
    expect(pickCategoryFromReply("Épicerie\nvoilà", RAYONS)).toBe("Épicerie")
    expect(pickCategoryFromReply("  Hygiène  ", RAYONS)).toBe("Hygiène")
  })

  it("renvoie null pour « Autre » ou un rayon halluciné", () => {
    expect(pickCategoryFromReply("Autre", RAYONS)).toBeNull()
    expect(pickCategoryFromReply("Rayon Bricolage", RAYONS)).toBeNull()
    expect(pickCategoryFromReply("", RAYONS)).toBeNull()
  })
})
