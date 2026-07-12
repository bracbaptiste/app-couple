import { describe, expect, it } from "vitest"

import { FALLBACK_CATEGORY, guessCategory } from "./guess-category"

describe("guessCategory", () => {
  it("classe un mot-clé simple dans son rayon", () => {
    expect(guessCategory("Lessive")).toBe("Entretien")
    expect(guessCategory("poulet")).toBe("Viande & Poisson")
    expect(guessCategory("eau")).toBe("Boissons")
  })

  it("ignore casse et accents", () => {
    expect(guessCategory("CÉRÉALE")).toBe("Épicerie")
  })

  it("résout les ligatures françaises (œ / æ)", () => {
    expect(guessCategory("Œuf")).toBe("Crémerie & Œufs")
    expect(guessCategory("Bœuf")).toBe("Viande & Poisson")
  })

  it("gère les pluriels simples (s / x)", () => {
    expect(guessCategory("Tomates")).toBe("Fruits & Légumes")
    expect(guessCategory("oeufs")).toBe("Crémerie & Œufs")
  })

  it("reconnaît un mot-clé au sein d'un libellé enrichi", () => {
    expect(guessCategory("Lait demi-écrémé")).toBe("Crémerie & Œufs")
    expect(guessCategory("Tomates cerises")).toBe("Fruits & Légumes")
  })

  it("priorise les mots-clés composés sur leurs mots isolés", () => {
    // « papier toilette » → Hygiène, pas « papier » → Papeterie.
    expect(guessCategory("Papier toilette")).toBe("Hygiène")
    // « pain de mie » → Boulangerie (mot-clé composé présent).
    expect(guessCategory("Pain de mie")).toBe("Boulangerie")
  })

  it("classe les manquants courants ajoutés à la table", () => {
    expect(guessCategory("Lentille verte")).toBe("Épicerie")
    expect(guessCategory("Dentifrice")).toBe("Hygiène")
    expect(guessCategory("Chèvre")).toBe("Crémerie & Œufs")
    expect(guessCategory("Cabillaud")).toBe("Viande & Poisson")
    expect(guessCategory("Courge butternut")).toBe("Fruits & Légumes")
  })

  it("rend les mots-clés composés tolérants au pluriel", () => {
    // « haricots verts » (pluriel) doit reconnaître « haricot vert ».
    expect(guessCategory("Haricots verts")).toBe("Fruits & Légumes")
    // … sans confondre avec « haricot rouge » (Épicerie).
    expect(guessCategory("Haricots rouges")).toBe("Épicerie")
    expect(guessCategory("Pois chiches")).toBe("Épicerie")
  })

  it("retombe sur « Autre » quand rien ne correspond", () => {
    expect(guessCategory("Bougie parfumée")).toBe(FALLBACK_CATEGORY)
    expect(guessCategory("xyzzy")).toBe(FALLBACK_CATEGORY)
  })

  it("retombe sur « Autre » pour une entrée vide", () => {
    expect(guessCategory("")).toBe(FALLBACK_CATEGORY)
    expect(guessCategory("   ")).toBe(FALLBACK_CATEGORY)
  })
})
