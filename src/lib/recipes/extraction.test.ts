import { describe, expect, it } from "vitest"

import { ExtractionParseError, parseExtraction } from "./extraction"

/** Objet JSON §7.3 minimal et valide, réutilisé comme base dans les tests. */
const RECETTE_OK = {
  titre: "Soupe de tomate",
  duree_minutes: 30,
  type_plat: "plat",
  tags: ["vegetarien", "leger"],
  nombre_personnes: 4,
  calories_par_portion: 120,
  proteines_g: 5,
  glucides_g: 18,
  lipides_g: 3,
  ingredients: [
    { nom: "Tomates", quantite: 500, unite: "g" },
    { nom: "sel", quantite: null, unite: null },
  ],
  etapes: ["Couper les tomates.", "Mijoter 20 min."],
}

describe("parseExtraction", () => {
  it("parse un JSON pur conforme au §7.3", () => {
    const r = parseExtraction(JSON.stringify(RECETTE_OK))
    expect(r.titre).toBe("Soupe de tomate")
    expect(r.duree_minutes).toBe(30)
    expect(r.type_plat).toBe("plat")
    expect(r.tags).toEqual(["vegetarien", "leger"])
    expect(r.etapes).toHaveLength(2)
  })

  it("retire les fences Markdown ```json … ``` (§7.2)", () => {
    const avecFences = "```json\n" + JSON.stringify(RECETTE_OK) + "\n```"
    const r = parseExtraction(avecFences)
    expect(r.titre).toBe("Soupe de tomate")
  })

  it("isole l'objet JSON même avec préambule/suffixe bavard", () => {
    const bavard = `Voici la recette :\n${JSON.stringify(RECETTE_OK)}\nVoilà !`
    const r = parseExtraction(bavard)
    expect(r.type_plat).toBe("plat")
  })

  it("lève ExtractionParseError sur un JSON cassé", () => {
    expect(() => parseExtraction("{ pas du json")).toThrow(ExtractionParseError)
  })

  it("lève ExtractionParseError sur une réponse non-objet", () => {
    expect(() => parseExtraction('"juste une chaîne"')).toThrow(
      ExtractionParseError,
    )
  })

  it("recalcule nom_normalise côté serveur pour chaque ingrédient (clé §5)", () => {
    const r = parseExtraction(JSON.stringify(RECETTE_OK))
    expect(r.ingredients[0]).toMatchObject({
      nom: "Tomates",
      nom_normalise: "tomate",
      quantite: 500,
      unite: "g",
    })
  })

  it("garde quantite/unite null pour les ingrédients « au goût »", () => {
    const r = parseExtraction(JSON.stringify(RECETTE_OK))
    expect(r.ingredients[1]).toMatchObject({
      nom: "sel",
      quantite: null,
      unite: null,
    })
  })

  it("filtre type_plat hors-liste vers « plat » (§10)", () => {
    const r = parseExtraction(
      JSON.stringify({ ...RECETTE_OK, type_plat: "brunch_inventé" }),
    )
    expect(r.type_plat).toBe("plat")
  })

  it("ignore les tags hors-liste et déduplique (§10)", () => {
    const r = parseExtraction(
      JSON.stringify({
        ...RECETTE_OK,
        tags: ["vegetarien", "vegetarien", "tag_bidon", "leger"],
      }),
    )
    expect(r.tags).toEqual(["vegetarien", "leger"])
  })

  it("filtre les unités hors du jeu fermé vers null", () => {
    const r = parseExtraction(
      JSON.stringify({
        ...RECETTE_OK,
        ingredients: [{ nom: "farine", quantite: 2, unite: "tasse" }],
      }),
    )
    expect(r.ingredients[0]).toMatchObject({
      nom_normalise: "farine",
      quantite: 2,
      unite: null,
    })
  })

  it("écarte les ingrédients sans nom", () => {
    const r = parseExtraction(
      JSON.stringify({
        ...RECETTE_OK,
        ingredients: [
          { nom: "  ", quantite: 1, unite: "g" },
          { nom: "oignon", quantite: 2, unite: "piece" },
        ],
      }),
    )
    expect(r.ingredients).toHaveLength(1)
    expect(r.ingredients[0].nom).toBe("oignon")
  })

  it("applique des replis sûrs sur les champs manquants/invalides", () => {
    const r = parseExtraction(JSON.stringify({ ingredients: [], etapes: [] }))
    expect(r.titre).toBe("Recette sans titre")
    expect(r.nombre_personnes).toBe(4) // repli §7.4
    expect(r.duree_minutes).toBeNull()
    expect(r.calories_par_portion).toBeNull()
    expect(r.type_plat).toBe("plat")
    expect(r.tags).toEqual([])
  })

  it("coerce les nombres fournis en chaîne", () => {
    const r = parseExtraction(
      JSON.stringify({ ...RECETTE_OK, duree_minutes: "45", nombre_personnes: "6" }),
    )
    expect(r.duree_minutes).toBe(45)
    expect(r.nombre_personnes).toBe(6)
  })
})
