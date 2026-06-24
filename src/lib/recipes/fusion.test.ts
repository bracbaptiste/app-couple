import { describe, expect, it } from "vitest"

import { fusionnerQuantite, type QuantiteBase } from "./fusion"
import {
  decrireFusion,
  formatQuantiteAjustee,
  formatQuantites,
} from "./format"

describe("fusionnerQuantite — règles d'unités §6", () => {
  it("même unité → addition (tomate : 200 + 300 = 500 g)", () => {
    const r = fusionnerQuantite([{ valeur: 200, unite: "g" }], {
      quantite: 300,
      unite: "g",
    })
    expect(r.quantites).toEqual([{ valeur: 500, unite: "g" }])
    expect(r.operation).toEqual({
      kind: "additionnee",
      avant: 200,
      ajoutee: 300,
      apres: 500,
      unite: "g",
    })
    expect(decrireFusion(r.operation, r.quantites)).toBe("200 + 300 = 500 g")
  })

  it("convertible kg → g puis addition", () => {
    const r = fusionnerQuantite([{ valeur: 500, unite: "g" }], {
      quantite: 1,
      unite: "kg",
    })
    expect(r.quantites).toEqual([{ valeur: 1500, unite: "g" }])
    // Le récap d'addition reste en unité de base (l'arithmétique est plus lisible
    // en g). Le joli reformat ≥1000 g → kg (§6) ne touche que l'affichage d'une
    // ligne complète, cf. formatQuantites ci-dessous.
    expect(decrireFusion(r.operation, r.quantites)).toBe("500 + 1000 = 1500 g")
    expect(formatQuantites(r.quantites)).toBe("1.5 kg")
  })

  it("convertible l → ml puis addition", () => {
    const r = fusionnerQuantite([{ valeur: 250, unite: "ml" }], {
      quantite: 1,
      unite: "l",
    })
    expect(r.quantites).toEqual([{ valeur: 1250, unite: "ml" }])
  })

  it("incompatible (1 pièce + 200 g) → les deux gardées sur la même ligne", () => {
    const r = fusionnerQuantite([{ valeur: 200, unite: "g" }], {
      quantite: 1,
      unite: "piece",
    })
    expect(r.quantites).toEqual([
      { valeur: 200, unite: "g" },
      { valeur: 1, unite: "piece" },
    ])
    expect(r.operation.kind).toBe("nouvelle")
    expect(formatQuantites(r.quantites)).toBe("200 g + 1 pièce")
    expect(decrireFusion(r.operation, r.quantites)).toBe("200 g + 1 pièce")
  })

  it("« au goût » (quantite null) → aucune quantité ajoutée", () => {
    const r = fusionnerQuantite([], { quantite: null, unite: null })
    expect(r.quantites).toEqual([])
    expect(r.operation).toEqual({ kind: "au_gout" })
    expect(decrireFusion(r.operation, r.quantites)).toBe("au goût")
  })

  it("1re saisie d'un produit → nouvelle entrée seule (300 g)", () => {
    const r = fusionnerQuantite([], { quantite: 300, unite: "g" })
    expect(r.quantites).toEqual([{ valeur: 300, unite: "g" }])
    expect(decrireFusion(r.operation, r.quantites)).toBe("300 g")
  })

  it("pluralise « pièce » dans le récap d'addition", () => {
    const r = fusionnerQuantite([{ valeur: 1, unite: "piece" }], {
      quantite: 2,
      unite: "piece",
    })
    expect(decrireFusion(r.operation, r.quantites)).toBe("1 + 2 = 3 pièces")
  })

  it("ne mute pas le tableau d'entrée (fonction pure)", () => {
    const existantes: QuantiteBase[] = [{ valeur: 200, unite: "g" }]
    fusionnerQuantite(existantes, { quantite: 300, unite: "g" })
    expect(existantes).toEqual([{ valeur: 200, unite: "g" }])
  })

  it("additionne deux quantités sans unité entre elles", () => {
    const r = fusionnerQuantite([{ valeur: 2, unite: null }], {
      quantite: 3,
      unite: null,
    })
    expect(r.quantites).toEqual([{ valeur: 5, unite: null }])
    expect(decrireFusion(r.operation, r.quantites)).toBe("2 + 3 = 5")
  })
})

describe("formatQuantiteAjustee — ajustement par personnes §8.2", () => {
  it("ratio 1 → quantité de base inchangée", () => {
    expect(formatQuantiteAjustee(200, "g", 1)).toBe("200 g")
  })

  it("double les quantités (ratio 2)", () => {
    expect(formatQuantiteAjustee(200, "g", 2)).toBe("400 g")
  })

  it("« au goût » (null) n'est jamais mis à l'échelle", () => {
    expect(formatQuantiteAjustee(null, null, 3)).toBe("au goût")
  })

  it("arrondit à 2 décimales (3 œufs pour 4 → 1,33 par 1 personne)", () => {
    // 3 pièces × (2/4) = 1.5, × (1.7777…) etc. : on vérifie l'arrondi.
    expect(formatQuantiteAjustee(3, "piece", 1 / 3)).toBe("1 pièce")
    expect(formatQuantiteAjustee(1, "piece", 4 / 3)).toBe("1.33 pièces")
  })

  it("singularise « pièce » sous 1 (0,5 pièce)", () => {
    expect(formatQuantiteAjustee(1, "piece", 0.5)).toBe("0.5 pièce")
  })
})
