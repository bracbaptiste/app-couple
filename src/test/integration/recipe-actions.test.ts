import { beforeEach, describe, expect, it, vi } from "vitest"

import { createSupabaseMock, type QueryContext, type SupabaseMock } from "@/test/supabase-mock"

/* -------------------------------------------------------------------------- */
/*  Harnais : on mocke les dépendances framework + le client Supabase.         */
/* -------------------------------------------------------------------------- */

let supa: SupabaseMock

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    // Next interrompt l'exécution en lançant ; on reproduit ce contrat.
    throw new Error("NEXT_REDIRECT")
  }),
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => supa.client),
}))

// Importé après les mocks (les actions résolvent createClient à l'exécution).
import { deleteRecipe, restoreRecipe } from "@/app/(app)/recipes/actions"

/** Filtre l'historique des requêtes sur (table, opération). */
function callsFor(op: QueryContext["op"], table: string) {
  return supa.calls.filter((c) => c.op === op && c.table === table)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteRecipe — soft-delete d'une recette", () => {
  it("pose deleted_at SANS toucher aux recipe_ingredients, jamais un DELETE", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "recipes") return { data: { id: "recipe-1" }, error: null }
        return { data: null }
      },
    })

    const result = await deleteRecipe("recipe-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("delete", "recipes")).toHaveLength(0)
    expect(callsFor("delete", "recipe_ingredients")).toHaveLength(0)
    expect(callsFor("update", "recipe_ingredients")).toHaveLength(0)
    const update = callsFor("update", "recipes")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: expect.any(String) })
    expect(update[0].filters).toMatchObject({ id: "recipe-1", couple_id: "couple-1" })
  })

  it("refuse une recette qui n'appartient pas au couple", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "recipes") return { data: null }
        return { data: null }
      },
    })

    const result = await deleteRecipe("intrus")

    expect(result).toEqual({ ok: false, error: "Recette introuvable." })
    expect(callsFor("update", "recipes")).toHaveLength(0)
  })
})

describe("restoreRecipe — restauration d'une recette", () => {
  it("efface deleted_at filtré id + couple_id, ingrédients intacts", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "recipes") return { error: null }
        return { data: null }
      },
    })

    const result = await restoreRecipe("recipe-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("update", "recipe_ingredients")).toHaveLength(0)
    const update = callsFor("update", "recipes")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: null })
    expect(update[0].filters).toMatchObject({ id: "recipe-1", couple_id: "couple-1" })
  })
})
