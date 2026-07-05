import { describe, expect, it } from "vitest"

import {
  parseProposition,
  PropositionParseError,
  type PropositionContext,
} from "./proposal"

const CTX: PropositionContext = {
  recettes: [
    { id: "re-rata", titre: "Ratatouille", type_plat: "plat", tags: ["vegetarien"] },
    { id: "re-curry", titre: "Curry de courge", type_plat: "plat", tags: ["vegan"] },
  ],
  casesLibres: [
    { date: "2026-07-06", creneau: "diner", label: "lundi soir" },
    { date: "2026-07-07", creneau: "diner", label: "mardi soir" },
  ],
}

function reponse(placements: unknown[]): string {
  return JSON.stringify({ placements })
}

describe("parseProposition", () => {
  it("valide une recette existante et coerce une nouvelle recette", () => {
    const r = parseProposition(
      reponse([
        { date: "2026-07-06", creneau: "diner", type: "existante", recipe_id: "re-rata" },
        {
          date: "2026-07-07",
          creneau: "diner",
          type: "nouvelle",
          recette: {
            titre: "Dahl de lentilles",
            type_plat: "plat",
            tags: ["vegan", "inconnu"],
            ingredients: [{ nom: "lentille corail", quantite: 200, unite: "g" }],
            etapes: ["Cuire"],
          },
        },
      ]),
      CTX,
    )
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ kind: "existante", recipe_id: "re-rata", titre: "Ratatouille", label: "lundi soir" })
    const nouvelle = r[1]
    if (nouvelle.kind !== "nouvelle") throw new Error("kind")
    expect(nouvelle.recette.titre).toBe("Dahl de lentilles")
    // Tag hors jeu fermé ignoré (coerceRecette) ; clé §5 recalculée.
    expect(nouvelle.recette.tags).toEqual(["vegan"])
    expect(nouvelle.recette.ingredients[0].nom_normalise).toBe("lentille corail")
  })

  it("rejette une case inconnue, une case occupée en double et un id halluciné", () => {
    const r = parseProposition(
      reponse([
        // case hors des cases libres → ignorée
        { date: "2026-07-10", creneau: "diner", type: "existante", recipe_id: "re-rata" },
        // id halluciné → ignoré
        { date: "2026-07-06", creneau: "diner", type: "existante", recipe_id: "re-x" },
        // valide
        { date: "2026-07-06", creneau: "diner", type: "existante", recipe_id: "re-curry" },
        // même case déjà remplie → ignorée
        { date: "2026-07-06", creneau: "diner", type: "existante", recipe_id: "re-rata" },
      ]),
      CTX,
    )
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ recipe_id: "re-curry" })
  })

  it("lève PropositionParseError sur JSON invalide", () => {
    expect(() => parseProposition("pas du json", CTX)).toThrow(PropositionParseError)
  })

  it("renvoie une liste vide si placements est absent", () => {
    expect(parseProposition(JSON.stringify({}), CTX)).toEqual([])
  })
})
