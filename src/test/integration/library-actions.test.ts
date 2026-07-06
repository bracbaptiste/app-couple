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
import { deleteLibraryItem, restoreLibraryItem } from "@/app/(app)/library/actions"

/** Filtre l'historique des requêtes sur (table, opération). */
function callsFor(op: QueryContext["op"], table: string) {
  return supa.calls.filter((c) => c.op === op && c.table === table)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deleteLibraryItem — soft-delete d'un produit bibliothèque", () => {
  it("garde « encore présent dans N listes » conservée : bloque sans écrire", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items")
          return { data: { id: "lib-1", usage_count: 3 } }
        // Encore référencé par 2 list_items.
        if (ctx.table === "list_items") return { count: 2 }
        return { data: null }
      },
    })

    const result = await deleteLibraryItem("lib-1")

    expect(result).toEqual({
      ok: false,
      error: "Encore présent dans 2 listes. Retire-le d’abord de tes listes.",
    })
    expect(callsFor("update", "library_items")).toHaveLength(0)
    expect(callsFor("delete", "library_items")).toHaveLength(0)
  })

  it("pose deleted_at quand le produit n'est plus référencé (jamais un DELETE)", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items")
          return { data: { id: "lib-1", usage_count: 1 }, error: null }
        if (ctx.table === "list_items") return { count: 0 }
        return { data: null }
      },
    })

    const result = await deleteLibraryItem("lib-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("delete", "library_items")).toHaveLength(0)
    const update = callsFor("update", "library_items")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: expect.any(String) })
    expect(update[0].filters).toMatchObject({ id: "lib-1", couple_id: "couple-1" })
  })
})

describe("restoreLibraryItem — restauration d'un produit", () => {
  it("efface deleted_at filtré id + couple_id", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items") return { error: null }
        return { data: null }
      },
    })

    const result = await restoreLibraryItem("lib-1")

    expect(result).toEqual({ ok: true })
    const update = callsFor("update", "library_items")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: null })
    expect(update[0].filters).toMatchObject({ id: "lib-1", couple_id: "couple-1" })
  })
})
