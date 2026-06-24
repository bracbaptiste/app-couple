import { describe, expect, it } from "vitest"

import { normaliserNom } from "./normalize-name-key"

describe("normaliserNom", () => {
  it("couvre les exemples de référence de la PRD §5", () => {
    expect(normaliserNom("Tomates")).toBe("tomate")
    expect(normaliserNom("de la Crème")).toBe("creme")
    expect(normaliserNom("Poireaux")).toBe("poireau")
    expect(normaliserNom("  OIGNON  ")).toBe("oignon")
  })

  it("retire les accents (NFD)", () => {
    expect(normaliserNom("Crème")).toBe("creme")
    expect(normaliserNom("Épinard")).toBe("epinard")
    expect(normaliserNom("Pâtes")).toBe("pate")
  })

  it("retire un mot de liaison en début, la forme la plus longue d'abord", () => {
    expect(normaliserNom("de la farine")).toBe("farine")
    expect(normaliserNom("du sucre")).toBe("sucre")
    expect(normaliserNom("des oeufs")).toBe("oeuf")
    expect(normaliserNom("d'ail")).toBe("ail")
    expect(normaliserNom("l'huile")).toBe("huile")
    expect(normaliserNom("une pomme")).toBe("pomme")
  })

  it("ne retire qu'un seul mot de liaison (pas en cascade)", () => {
    // « la » est retiré une fois ; on ne continue pas à manger le mot suivant.
    expect(normaliserNom("la laitue")).toBe("laitue")
  })

  it("met au singulier (s/x) seulement au-delà de 3 lettres", () => {
    expect(normaliserNom("choux")).toBe("chou")
    expect(normaliserNom("noix")).toBe("noi")
    // Mots courts préservés : pas de mutilation des 3 lettres ou moins.
    expect(normaliserNom("riz")).toBe("riz")
    expect(normaliserNom("os")).toBe("os")
  })

  it("réduit les espaces multiples", () => {
    expect(normaliserNom("lait   de   coco")).toBe("lait de coco")
  })

  it("ne fusionne PAS à tort les composés (lait de coco ≠ lait)", () => {
    // Garde-fou PRD §5 : la clé reste distincte d'un simple « lait ».
    expect(normaliserNom("lait de coco")).not.toBe(normaliserNom("lait"))
  })

  it("est cohérente : deux saisies du même produit donnent la même clé", () => {
    expect(normaliserNom("Tomates")).toBe(normaliserNom("  tomate "))
    expect(normaliserNom("Des Poireaux")).toBe(normaliserNom("poireau"))
  })

  it("renvoie une chaîne vide pour une entrée vide ou non significative", () => {
    expect(normaliserNom("")).toBe("")
    expect(normaliserNom("   ")).toBe("")
    expect(normaliserNom(null)).toBe("")
    expect(normaliserNom(undefined)).toBe("")
  })
})
