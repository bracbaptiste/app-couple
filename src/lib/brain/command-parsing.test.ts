import { describe, expect, it } from "vitest"

import {
  BrainParseError,
  MAX_ACTIONS,
  niveauAction,
  parseBrainCommand,
  type BrainContext,
} from "./command-parsing"

const CTX: BrainContext = {
  coursesLists: [
    { id: "co-auchan", name: "Auchan" },
    { id: "co-carrefour", name: "Carrefour" },
  ],
  todoLists: [{ id: "td-maison", name: "Maison" }],
  profiles: [
    { id: "pr-bapt", display_name: "Bapt", color: "sauge" },
    { id: "pr-soso", display_name: "Soso", color: "brique" },
  ],
  libraryItems: [
    { id: "lib-lait", name: "Lait", nom_normalise: "lait" },
    { id: "lib-tomate", name: "Tomate", nom_normalise: "tomate" },
  ],
  recettes: [{ id: "re-rata", titre: "Ratatouille" }],
  ecran: null,
}

/** Enveloppe une liste d'actions dans le schéma de sortie de l'IA (§5.3). */
function reponse(actions: unknown[]): string {
  return JSON.stringify({ actions, clarification: null })
}

describe("parseBrainCommand — courses.ajouter_article", () => {
  it("résout la liste nommée, renormalise les noms et résout l'id bibliothèque", () => {
    const r = parseBrainCommand(
      reponse([
        {
          intent: "courses.ajouter_article",
          liste_id: "co-auchan",
          articles: [
            { nom: "des Tomates", quantite: 500, unite: "g" },
            { nom: "Beurre", quantite: null, unite: null },
          ],
        },
      ]),
      CTX,
    )
    expect(r.clarification).toBeNull()
    expect(r.actions).toHaveLength(1)
    const a = r.actions[0]
    expect(a.intent).toBe("courses.ajouter_article")
    if (a.intent !== "courses.ajouter_article") throw new Error("intent")
    expect(a.liste_id).toBe("co-auchan")
    expect(a.articles[0]).toEqual({
      nom: "des Tomates",
      nom_normalise: "tomate",
      library_item_id: "lib-tomate", // résolu contre la bibliothèque
      quantite: 500,
      unite: "g",
    })
    // Article absent de la bibliothèque → library_item_id null (jamais halluciné).
    expect(a.articles[1].library_item_id).toBeNull()
  })

  it("demande une clarification si aucune liste n'est déterminable (§5.4.5)", () => {
    const r = parseBrainCommand(
      reponse([
        {
          intent: "courses.ajouter_article",
          liste_id: null,
          articles: [{ nom: "pain" }],
        },
      ]),
      CTX,
    )
    expect(r.actions).toEqual([])
    expect(r.clarification).toEqual({
      question: "Dans quelle liste ?",
      options: [
        { label: "Auchan", liste_id: "co-auchan" },
        { label: "Carrefour", liste_id: "co-carrefour" },
      ],
    })
  })

  it("retombe sur la liste ouverte à l'écran quand aucune n'est nommée (§5.4.4.2)", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "courses.ajouter_article", liste_id: null, articles: [{ nom: "pain" }] },
      ]),
      { ...CTX, ecran: { route: "/lists/co-carrefour", liste_id: "co-carrefour" } },
    )
    expect(r.clarification).toBeNull()
    expect(r.actions[0]).toMatchObject({ liste_id: "co-carrefour" })
  })

  it("retombe sur la seule liste de courses si le couple n'en a qu'une (§5.4.4.3)", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "courses.ajouter_article", liste_id: null, articles: [{ nom: "pain" }] },
      ]),
      { ...CTX, coursesLists: [{ id: "co-solo", name: "Maison" }] },
    )
    expect(r.actions[0]).toMatchObject({ liste_id: "co-solo" })
  })

  it("ignore un liste_id halluciné et retombe sur la résolution serveur", () => {
    const r = parseBrainCommand(
      reponse([
        {
          intent: "courses.ajouter_article",
          liste_id: "co-inventée",
          articles: [{ nom: "pain" }],
        },
      ]),
      CTX,
    )
    // id inconnu → traité comme null → clarification (2 listes possibles).
    expect(r.actions).toEqual([])
    expect(r.clarification).not.toBeNull()
  })
})

describe("parseBrainCommand — cocher / bibliothèque", () => {
  it("cocher un article résout la liste et normalise le nom", () => {
    const r = parseBrainCommand(
      reponse([
        {
          intent: "courses.cocher_article",
          liste_id: "co-auchan",
          article: { nom: "Tomates" },
        },
      ]),
      CTX,
    )
    const a = r.actions[0]
    if (a.intent !== "courses.cocher_article") throw new Error("intent")
    expect(a.liste_id).toBe("co-auchan")
    expect(a.article).toEqual({
      nom: "Tomates",
      nom_normalise: "tomate",
      library_item_id: "lib-tomate",
    })
  })

  it("bibliotheque.ajouter_article n'exige pas de liste", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "bibliotheque.ajouter_article", articles: [{ nom: "Curcuma" }] },
      ]),
      CTX,
    )
    const a = r.actions[0]
    if (a.intent !== "bibliotheque.ajouter_article") throw new Error("intent")
    expect(a.articles[0]).toEqual({
      nom: "Curcuma",
      nom_normalise: "curcuma",
      library_item_id: null,
    })
  })
})

describe("parseBrainCommand — taches", () => {
  it("valide profil/liste contre le contexte et borne la récurrence", () => {
    const r = parseBrainCommand(
      reponse([
        {
          intent: "taches.ajouter",
          titre: "plein d'essence",
          due_date: "2026-07-06",
          recurrence: { type: "weekly", interval: 1, weekday: 0, day_of_month: 12 },
          assigne_profile_id: "pr-soso",
          liste_id: "td-maison",
        },
      ]),
      CTX,
    )
    expect(r.actions[0]).toEqual({
      intent: "taches.ajouter",
      titre: "plein d'essence",
      due_date: "2026-07-06",
      recurrence: { type: "weekly", interval: 1, weekday: 0, day_of_month: null },
      assigne_profile_id: "pr-soso",
      liste_id: "td-maison",
    })
  })

  it("ramène à null les ids inconnus et une date impossible (garde-fou §5)", () => {
    const r = parseBrainCommand(
      reponse([
        {
          intent: "taches.ajouter",
          titre: "X",
          due_date: "2026-02-31",
          assigne_profile_id: "pr-inventé",
          liste_id: "co-auchan", // liste de COURSES → invalide pour une tâche
        },
      ]),
      CTX,
    )
    expect(r.actions[0]).toMatchObject({
      due_date: null,
      assigne_profile_id: null,
      liste_id: null,
    })
  })

  it("taches.cocher expose une clé normalisée pour l'exécution", () => {
    const r = parseBrainCommand(
      reponse([{ intent: "taches.cocher", titre: "Sortir les poubelles" }]),
      CTX,
    )
    const a = r.actions[0]
    if (a.intent !== "taches.cocher") throw new Error("intent")
    expect(a.titre_normalise).toBe("sortir les poubelle")
    expect(a.liste_id).toBeNull()
  })
})

describe("parseBrainCommand — navigation", () => {
  it("accepte un outil du jeu fermé, une liste et une recette du contexte", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "navigation.ouvrir", cible: { type: "outil", outil: "planning" } },
        { intent: "navigation.ouvrir", cible: { type: "liste", liste_id: "co-auchan" } },
        { intent: "navigation.ouvrir", cible: { type: "recette", recipe_id: "re-rata" } },
      ]),
      CTX,
    )
    expect(r.actions).toHaveLength(3)
    expect(r.actions[0]).toEqual({
      intent: "navigation.ouvrir",
      cible: { type: "outil", outil: "planning" },
    })
  })

  it("rejette un outil hors catalogue et un id de recette halluciné", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "navigation.ouvrir", cible: { type: "outil", outil: "reglages" } },
        { intent: "navigation.ouvrir", cible: { type: "recette", recipe_id: "re-x" } },
      ]),
      CTX,
    )
    expect(r.actions).toEqual([])
  })
})

describe("parseBrainCommand — garde-fous", () => {
  it("classe une demande de suppression en inconnu/suppression (§5.2)", () => {
    const r = parseBrainCommand(
      reponse([{ intent: "inconnu", raison: "suppression" }]),
      CTX,
    )
    expect(r.actions[0]).toEqual({ intent: "inconnu", raison: "suppression" })
  })

  it("borne le lot multi-intentions à MAX_ACTIONS (§5.4.1)", () => {
    const trop = Array.from({ length: MAX_ACTIONS + 3 }, () => ({
      intent: "bibliotheque.ajouter_article",
      articles: [{ nom: "sel" }],
    }))
    const r = parseBrainCommand(reponse(trop), CTX)
    expect(r.actions).toHaveLength(MAX_ACTIONS)
  })

  it("ignore une action d'intent inconnu du catalogue", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "courses.supprimer_liste", liste_id: "co-auchan" },
        { intent: "bibliotheque.ajouter_article", articles: [{ nom: "sel" }] },
      ]),
      CTX,
    )
    expect(r.actions).toHaveLength(1)
    expect(r.actions[0].intent).toBe("bibliotheque.ajouter_article")
  })

  it("tolère les fences Markdown autour du JSON", () => {
    const raw =
      '```json\n{"actions":[{"intent":"inconnu","raison":null}],"clarification":null}\n```'
    expect(parseBrainCommand(raw, CTX).actions[0]).toEqual({
      intent: "inconnu",
      raison: null,
    })
  })

  it("lève BrainParseError sur JSON invalide", () => {
    expect(() => parseBrainCommand("pas du json", CTX)).toThrow(BrainParseError)
  })
})

describe("niveauAction — confirmation graduée (§6)", () => {
  it("classe taches.ajouter en niveau 2 (écran de validation V2.1)", () => {
    const r = parseBrainCommand(
      reponse([{ intent: "taches.ajouter", titre: "essence" }]),
      CTX,
    )
    expect(niveauAction(r.actions[0])).toBe(2)
  })

  it("classe les autres intents du catalogue en niveau 1 (tampon direct)", () => {
    const r = parseBrainCommand(
      reponse([
        { intent: "bibliotheque.ajouter_article", articles: [{ nom: "sel" }] },
        { intent: "taches.cocher", titre: "poubelles" },
        { intent: "navigation.ouvrir", cible: { type: "outil", outil: "recettes" } },
      ]),
      CTX,
    )
    for (const a of r.actions) expect(niveauAction(a)).toBe(1)
  })

  it("renvoie un lot vide (sans erreur) si actions est absent ou mal typé", () => {
    expect(parseBrainCommand(JSON.stringify({ actions: "nope" }), CTX)).toEqual({
      actions: [],
      clarification: null,
    })
  })
})
