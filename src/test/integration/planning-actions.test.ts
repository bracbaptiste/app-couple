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
import { previewMealRemoval } from "@/app/(app)/planning/actions"

/** Filtre l'historique des requêtes sur (table, opération). */
function callsFor(op: QueryContext["op"], table: string) {
  return supa.calls.filter((c) => c.op === op && c.table === table)
}

beforeEach(() => {
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */
/*  Retrait ciblé (§8.6) — ne propose jamais une ligne déjà supprimée          */
/* -------------------------------------------------------------------------- */

describe("previewMealRemoval — retrait ciblé ignore les lignes soft-deleted (PRD_V4.1 §4.3/§4.4)", () => {
  it("filtre deleted_at IS NULL sur les list_items candidats, et ne les propose pas s'ils le sont déjà", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "meal_slots") {
          return {
            data: { id: "slot-1", type: "recette", texte: null, recipe_id: "recipe-1" },
          }
        }
        if (ctx.table === "recipes") return { data: { titre: "Lasagnes" } }
        if (ctx.table === "meal_slot_sources") {
          // Sert aux deux lectures (liens de CE repas, puis provenance complète) :
          // un seul repas source pour cet article (sourceCount = 1 → retirable).
          return {
            data: [{ list_item_id: "item-1", origine: "generation", meal_slot_id: "slot-1" }],
          }
        }
        if (ctx.table === "list_items") {
          // Simule ce que ferait Postgres avec le filtre deleted_at IS NULL :
          // une ligne déjà supprimée ne revient jamais ici (vérifié plus bas).
          return {
            data: [
              {
                id: "item-1",
                list_id: "list-1",
                quantities: [],
                is_checked: false,
                library_item_id: "lib-1",
              },
            ],
          }
        }
        if (ctx.table === "library_items") return { data: [{ id: "lib-1", name: "Tomates" }] }
        return { data: null }
      },
    })

    const result = await previewMealRemoval("slot-1")

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("unreachable")
    expect(result.preview.retirables).toEqual([
      { listItemId: "item-1", nom: "Tomates", quantites: [] },
    ])

    // La lecture des candidats au retrait filtre bien deleted_at IS NULL.
    const itemsCall = callsFor("select", "list_items")[0]
    expect(itemsCall.filters).toMatchObject({ "is:deleted_at": null })
  })

  it("ne propose rien si le seul article engendré est déjà soft-deleted", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "meal_slots") {
          return {
            data: { id: "slot-1", type: "recette", texte: null, recipe_id: "recipe-1" },
          }
        }
        if (ctx.table === "recipes") return { data: { titre: "Lasagnes" } }
        if (ctx.table === "meal_slot_sources") {
          return {
            data: [{ list_item_id: "item-1", origine: "generation", meal_slot_id: "slot-1" }],
          }
        }
        // La ligne "item-1" est déjà supprimée : le filtre deleted_at IS NULL du
        // code (reproduit ici par le handler) exclut cette fois toute donnée.
        if (ctx.table === "list_items") return { data: [] }
        if (ctx.table === "library_items") return { data: [] }
        return { data: null }
      },
    })

    const result = await previewMealRemoval("slot-1")

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("unreachable")
    expect(result.preview.retirables).toEqual([])
    expect(result.preview.ajustements).toEqual([])
    expect(result.preview.conserves).toEqual([])
  })
})
