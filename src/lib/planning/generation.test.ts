import { describe, expect, it } from "vitest"

import {
  categoriserRetrait,
  foldBesoin,
  grouperBesoins,
  type Contribution,
  type EntreeBesoin,
} from "./generation"
import { decrireFusion, formatQuantites } from "@/lib/recipes/format"

/** Petit constructeur de contribution pour alléger les tests. */
function contrib(
  partial: Partial<Contribution> & Pick<Contribution, "quantite" | "unite">,
): Contribution {
  return {
    mealSlotId: partial.mealSlotId ?? "slot-1",
    repas: partial.repas ?? "Recette",
    jour: partial.jour ?? "lun. soir",
    quantite: partial.quantite,
    unite: partial.unite,
  }
}

describe("grouperBesoins — regroupement par clé normalisée", () => {
  it("réunit les mêmes clés en préservant l'ordre et le premier nom affiché", () => {
    const entrees: EntreeBesoin[] = [
      { cle: "tomate", nom: "tomates", contribution: contrib({ quantite: 200, unite: "g" }) },
      { cle: "oignon", nom: "oignon", contribution: contrib({ quantite: 1, unite: "piece" }) },
      { cle: "tomate", nom: "tomate", contribution: contrib({ quantite: 300, unite: "g" }) },
    ]

    const besoins = grouperBesoins(entrees)

    expect(besoins.map((b) => b.cle)).toEqual(["tomate", "oignon"])
    expect(besoins[0].nom).toBe("tomates") // premier affiché rencontré
    expect(besoins[0].contributions).toHaveLength(2)
  })
})

describe("foldBesoin — repliement des besoins (§8.5, réutilise la fusion §6)", () => {
  it("ligne inexistante + deux repas de même unité → créée, addition (200 + 300 = 500 g)", () => {
    const besoin = {
      cle: "tomate",
      nom: "tomate",
      contributions: [
        contrib({ quantite: 200, unite: "g", repas: "Sauce", jour: "lun. soir" }),
        contrib({ quantite: 300, unite: "g", repas: "Soupe", jour: "mar. soir" }),
      ],
    }

    const ligne = foldBesoin(besoin, [], false)

    expect(ligne.statut).toBe("cree")
    expect(ligne.quantitesFinales).toEqual([{ valeur: 500, unite: "g" }])
    // Récap transparent étape par étape.
    expect(decrireFusion(ligne.etapes[0].operation, ligne.etapes[0].quantitesApres)).toBe("200 g")
    expect(decrireFusion(ligne.etapes[1].operation, ligne.etapes[1].quantitesApres)).toBe("200 + 300 = 500 g")
  })

  it("unités incompatibles entre deux repas → cohabitation sur une ligne créée (1 pièce + 200 g)", () => {
    const besoin = {
      cle: "oignon",
      nom: "oignon",
      contributions: [
        contrib({ quantite: 1, unite: "piece" }),
        contrib({ quantite: 200, unite: "g" }),
      ],
    }

    const ligne = foldBesoin(besoin, [], false)

    expect(ligne.statut).toBe("cree")
    expect(formatQuantites(ligne.quantitesFinales)).toBe("1 pièce + 200 g")
  })

  it("ligne active préexistante → fusionnée, l'état initial est conservé pour le récap", () => {
    const besoin = {
      cle: "creme",
      nom: "crème",
      contributions: [contrib({ quantite: 200, unite: "ml" })],
    }

    const ligne = foldBesoin(besoin, [{ valeur: 100, unite: "ml" }], true)

    expect(ligne.statut).toBe("fusionne")
    expect(ligne.quantitesInitiales).toEqual([{ valeur: 100, unite: "ml" }])
    expect(ligne.quantitesFinales).toEqual([{ valeur: 300, unite: "ml" }])
  })

  it("ingrédient « au goût » → ligne créée sans quantité, jamais mis à l'échelle", () => {
    const besoin = {
      cle: "sel",
      nom: "sel",
      contributions: [
        contrib({ quantite: null, unite: null }),
        contrib({ quantite: null, unite: null }),
      ],
    }

    const ligne = foldBesoin(besoin, [], false)

    expect(ligne.quantitesFinales).toEqual([])
    expect(ligne.etapes.every((e) => e.operation.kind === "au_gout")).toBe(true)
  })

  it("kg convertis en base avant addition (0.5 kg + 300 g = 800 g)", () => {
    const besoin = {
      cle: "farine",
      nom: "farine",
      contributions: [
        contrib({ quantite: 0.5, unite: "kg" }),
        contrib({ quantite: 300, unite: "g" }),
      ],
    }

    const ligne = foldBesoin(besoin, [], false)

    expect(ligne.quantitesFinales).toEqual([{ valeur: 800, unite: "g" }])
  })

  it("ne mute pas les quantités existantes fournies", () => {
    const existantes = [{ valeur: 100, unite: "g" as const }]
    const besoin = {
      cle: "beurre",
      nom: "beurre",
      contributions: [contrib({ quantite: 50, unite: "g" })],
    }

    foldBesoin(besoin, existantes, true)

    expect(existantes).toEqual([{ valeur: 100, unite: "g" }])
  })
})

describe("categoriserRetrait — garde-fou du retrait §8.6", () => {
  it("un article coché n'est JAMAIS retiré, même s'il vient uniquement de ce repas", () => {
    expect(categoriserRetrait("generation", true, 1)).toBe("conserver")
    // Coché prime même sur une fusion partagée.
    expect(categoriserRetrait("fusion", true, 3)).toBe("conserver")
  })

  it("ligne créée par la génération et à source unique → retirable", () => {
    expect(categoriserRetrait("generation", false, 1)).toBe("retirable")
    // Défensif : 0 source (provenance orpheline) reste retirable, pas bloquant.
    expect(categoriserRetrait("generation", false, 0)).toBe("retirable")
  })

  it("ligne fusionnée dans un article préexistant → à ajuster, jamais retirée entière", () => {
    expect(categoriserRetrait("fusion", false, 1)).toBe("ajuster")
  })

  it("ligne créée mais partagée avec un autre repas → à ajuster (sert aussi ailleurs)", () => {
    expect(categoriserRetrait("generation", false, 2)).toBe("ajuster")
  })
})
