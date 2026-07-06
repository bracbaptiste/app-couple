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
import { addItemToList, toggleItem, deleteItem, restoreItem } from "@/app/(app)/lists/[listId]/actions"
import { addTask, deleteTask, restoreTask } from "@/app/(app)/lists/[listId]/task-actions"
import { sendToList } from "@/app/(app)/library/actions"
import { createCouple, joinCouple } from "@/app/onboarding/actions"
import { deleteList, restoreList } from "@/app/(app)/lists/actions"

/** Filtre l'historique des requêtes sur (table, opération). */
function callsFor(op: QueryContext["op"], table: string) {
  return supa.calls.filter((c) => c.op === op && c.table === table)
}

beforeEach(() => {
  vi.clearAllMocks()
})

/* -------------------------------------------------------------------------- */
/*  Ajout d'un article à une liste                                             */
/* -------------------------------------------------------------------------- */

describe("addItemToList — ajout d'un article", () => {
  it("crée le produit en bibliothèque puis l'insère dans la liste (article inédit)", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        // Produit inconnu de la bibliothèque.
        if (ctx.table === "library_items" && ctx.op === "select") return { data: null }
        // Rayon deviné résolu vers un id réel du couple.
        if (ctx.table === "categories") return { data: { id: "cat-1" } }
        if (ctx.table === "library_items" && ctx.op === "insert")
          return { data: { id: "lib-1" }, error: null }
        // Pas de doublon non coché dans la liste.
        if (ctx.table === "list_items" && ctx.op === "select") return { data: null }
        if (ctx.table === "list_items" && ctx.op === "insert") return { error: null }
        return { data: null }
      },
    })

    const result = await addItemToList({ listId: "list-1", rawName: "  LESSIVE " })

    expect(result).toEqual({ ok: true })
    // Un produit a bien été créé, avec le nom normalisé et un rayon résolu.
    const libInsert = callsFor("insert", "library_items")
    expect(libInsert).toHaveLength(1)
    expect(libInsert[0].payload).toMatchObject({
      couple_id: "couple-1",
      name: "Lessive",
      category_id: "cat-1",
    })
    // Et l'article a été ajouté à la liste, attribué à l'utilisateur.
    const itemInsert = callsFor("insert", "list_items")
    expect(itemInsert).toHaveLength(1)
    expect(itemInsert[0].payload).toMatchObject({
      list_id: "list-1",
      library_item_id: "lib-1",
      added_by: "user-1",
    })
  })

  it("réutilise le produit connu et renforce son usage (pas de doublon en bibliothèque)", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "library_items" && ctx.op === "select")
          return { data: { id: "lib-9", usage_count: 3 } }
        if (ctx.table === "list_items" && ctx.op === "select") return { data: null }
        if (ctx.table === "list_items" && ctx.op === "insert") return { error: null }
        return { data: null }
      },
    })

    const result = await addItemToList({ listId: "list-1", rawName: "Lessive" })

    expect(result).toEqual({ ok: true })
    // Aucun nouveau produit créé.
    expect(callsFor("insert", "library_items")).toHaveLength(0)
    // usage_count incrémenté (3 → 4).
    const usageRpc = callsFor("rpc", "increment_library_usage")
    expect(usageRpc).toHaveLength(1)
    expect(usageRpc[0].payload).toMatchObject({ p_item_id: "lib-9" })
    // L'article rejoint quand même la liste.
    expect(callsFor("insert", "list_items")).toHaveLength(1)
  })

  it("ne duplique pas un article déjà présent et non coché", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "library_items" && ctx.op === "select")
          return { data: { id: "lib-9", usage_count: 1 } }
        // Déjà présent et non coché.
        if (ctx.table === "list_items" && ctx.op === "select")
          return { data: { id: "li-existing" } }
        return { data: null }
      },
    })

    const result = await addItemToList({ listId: "list-1", rawName: "Lessive" })

    expect(result).toEqual({ ok: true })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
  })

  it("ressuscite un produit de bibliothèque soft-deleted (jamais un doublon actif, PRD_V4.1 §4.4)", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "library_items" && ctx.op === "select")
          return {
            data: { id: "lib-9", usage_count: 1, deleted_at: "2026-07-01T00:00:00.000Z" },
          }
        if (ctx.table === "library_items" && ctx.op === "update") return { error: null }
        if (ctx.table === "list_items" && ctx.op === "select") return { data: null }
        if (ctx.table === "list_items" && ctx.op === "insert") return { error: null }
        return { data: null }
      },
    })

    const result = await addItemToList({ listId: "list-1", rawName: "Lessive" })

    expect(result).toEqual({ ok: true })
    // Aucun nouveau produit créé : la ligne supprimée est ressuscitée à la place.
    expect(callsFor("insert", "library_items")).toHaveLength(0)
    const resurrect = callsFor("update", "library_items")
    expect(resurrect).toHaveLength(1)
    expect(resurrect[0].payload).toMatchObject({ deleted_at: null })
    expect(resurrect[0].filters).toMatchObject({ id: "lib-9", couple_id: "couple-1" })
  })

  it("ressuscite une ligne de liste soft-deleted au lieu d'un doublon actif (PRD_V4.1 §4.4)", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "library_items" && ctx.op === "select")
          return { data: { id: "lib-9", usage_count: 3, deleted_at: null } }
        if (ctx.table === "list_items" && ctx.op === "select")
          return { data: { id: "li-deleted", deleted_at: "2026-07-01T00:00:00.000Z" } }
        if (ctx.table === "list_items" && ctx.op === "update") return { error: null }
        return { data: null }
      },
    })

    const result = await addItemToList({ listId: "list-1", rawName: "Lessive" })

    expect(result).toEqual({ ok: true })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
    const resurrect = callsFor("update", "list_items")
    expect(resurrect).toHaveLength(1)
    expect(resurrect[0].payload).toMatchObject({ deleted_at: null })
    expect(resurrect[0].filters).toMatchObject({ id: "li-deleted", list_id: "list-1" })
  })

  it("rejette un nom vide sans toucher la base", async () => {
    supa = createSupabaseMock({ handler: () => ({ data: null }) })

    const result = await addItemToList({ listId: "list-1", rawName: "   " })

    expect(result).toEqual({ ok: false, error: expect.any(String) })
    expect(supa.calls).toHaveLength(0)
  })

  it("refuse d'ajouter dans une liste qui n'appartient pas au couple", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: null } // liste introuvable
        return { data: null }
      },
    })

    const result = await addItemToList({ listId: "intrus", rawName: "Lessive" })

    expect(result).toEqual({ ok: false, error: "Liste introuvable." })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/*  Cocher / décocher                                                          */
/* -------------------------------------------------------------------------- */

describe("toggleItem — cochage / décochage", () => {
  it("coche un article en mémorisant qui et quand", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "list_items") return { error: null }
        return { data: null }
      },
    })

    const result = await toggleItem("list-1", "item-1", true)

    expect(result).toEqual({ ok: true })
    const update = callsFor("update", "list_items")
    expect(update).toHaveLength(1)
    const payload = update[0].payload as Record<string, unknown>
    expect(payload.is_checked).toBe(true)
    expect(payload.checked_by).toBe("user-1")
    expect(payload.checked_at).toEqual(expect.any(String))
    // Ciblage de la bonne ligne dans la bonne liste.
    expect(update[0].filters).toMatchObject({ id: "item-1", list_id: "list-1" })
  })

  it("décoche un article en effaçant l'auteur et l'horodatage", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "list_items") return { error: null }
        return { data: null }
      },
    })

    const result = await toggleItem("list-1", "item-1", false)

    expect(result).toEqual({ ok: true })
    const payload = callsFor("update", "list_items")[0].payload as Record<string, unknown>
    expect(payload.is_checked).toBe(false)
    expect(payload.checked_by).toBeNull()
    expect(payload.checked_at).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/*  Envoi depuis la bibliothèque vers une liste                                */
/* -------------------------------------------------------------------------- */

describe("sendToList — bibliothèque → liste", () => {
  it("insère l'article et renforce la fréquence du produit", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items" && ctx.op === "select")
          return { data: { id: "lib-1", usage_count: 5 } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "list_items" && ctx.op === "select") return { data: null }
        if (ctx.table === "list_items" && ctx.op === "insert") return { error: null }
        if (ctx.table === "increment_library_usage") return { error: null }
        return { data: null }
      },
    })

    const result = await sendToList("lib-1", "list-1")

    expect(result).toEqual({ ok: true })
    const itemInsert = callsFor("insert", "list_items")
    expect(itemInsert).toHaveLength(1)
    expect(itemInsert[0].payload).toMatchObject({
      list_id: "list-1",
      library_item_id: "lib-1",
      added_by: "user-1",
    })
    // Fréquence renforcée (5 → 6).
    const usageRpc = callsFor("rpc", "increment_library_usage")
    expect(usageRpc).toHaveLength(1)
    expect(usageRpc[0].payload).toMatchObject({ p_item_id: "lib-1" })
  })

  it("ne duplique pas mais renforce quand même la fréquence (article déjà présent)", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items" && ctx.op === "select")
          return { data: { id: "lib-1", usage_count: 5 } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "list_items" && ctx.op === "select")
          return { data: { id: "li-existing" } }
        if (ctx.table === "increment_library_usage") return { error: null }
        return { data: null }
      },
    })

    const result = await sendToList("lib-1", "list-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
    // L'envoi reste un signal d'usage même en cas de doublon.
    expect(callsFor("rpc", "increment_library_usage")).toHaveLength(1)
  })

  it("refuse un produit introuvable dans le couple", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items" && ctx.op === "select") return { data: null }
        return { data: null }
      },
    })

    const result = await sendToList("inconnu", "list-1")

    expect(result).toEqual({ ok: false, error: "Article introuvable." })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
  })

  it("refuse d'envoyer un article vers une liste to-do", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "library_items") {
          return { data: { id: "lib-1", usage_count: 1 } }
        }
        if (ctx.table === "lists") {
          return { data: { id: "todo-1", kind: "todo" } }
        }
        return { data: null }
      },
    })

    const result = await sendToList("lib-1", "todo-1")

    expect(result).toEqual({ ok: false, error: "Choisis une liste de courses." })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
  })
})

describe("addTask — création idempotente hors ligne", () => {
  it("conserve l'UUID fourni par le client", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "todo-1", kind: "todo" } }
        if (ctx.table === "tasks") return { error: null }
        return { data: null }
      },
    })

    const result = await addTask({
      taskId: "11111111-1111-4111-8111-111111111111",
      listId: "todo-1",
      rawTitle: "Appeler le plombier",
    })

    expect(result).toEqual({ ok: true })
    expect(callsFor("insert", "tasks")[0].payload).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      list_id: "todo-1",
    })
  })

  it("considère un UUID déjà inséré comme un rejeu réussi", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "todo-1", kind: "todo" } }
        if (ctx.table === "tasks") return { error: { code: "23505" } }
        return { data: null }
      },
    })

    const result = await addTask({
      taskId: "11111111-1111-4111-8111-111111111111",
      listId: "todo-1",
      rawTitle: "Appeler le plombier",
    })

    expect(result).toEqual({ ok: true })
  })
})

describe("onboarding — RPC atomiques", () => {
  it("crée le couple en une seule transaction RPC", async () => {
    supa = createSupabaseMock({
      handler: (ctx) =>
        ctx.table === "create_couple"
          ? { data: { ok: true, invite_code: "123456" }, error: null }
          : { data: null },
    })
    const form = new FormData()
    form.set("display_name", "Camille")
    form.set("color", "sauge")

    const result = await createCouple({}, form)

    expect(result).toEqual({ inviteCode: "123456" })
    expect(callsFor("rpc", "create_couple")).toHaveLength(1)
    expect(callsFor("insert", "couples")).toHaveLength(0)
  })

  it("traduit la limitation des tentatives de code", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: null } }
        if (ctx.table === "join_couple") {
          return { data: { ok: false, code: "RATE_LIMITED" }, error: null }
        }
        return { data: null }
      },
    })
    const form = new FormData()
    form.set("display_name", "Camille")
    form.set("invite_code", "123456")

    const result = await joinCouple({}, form)

    expect(result.error).toContain("15 minutes")
  })
})

/* -------------------------------------------------------------------------- */
/*  Soft-delete & restauration (PRD_V4.1 §4)                                   */
/* -------------------------------------------------------------------------- */

describe("deleteList / restoreList — soft-delete d'une liste", () => {
  it("pose deleted_at sur la liste SANS toucher aux list_items", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1" }, error: null }
        return { data: null }
      },
    })

    const result = await deleteList("list-1")

    expect(result).toEqual({ ok: true })
    // Seule la liste est mise à jour, jamais un DELETE, jamais list_items.
    expect(callsFor("delete", "lists")).toHaveLength(0)
    expect(callsFor("update", "list_items")).toHaveLength(0)
    const update = callsFor("update", "lists")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: expect.any(String) })
    expect(update[0].filters).toMatchObject({ id: "list-1", couple_id: "couple-1" })
  })

  it("restaure une liste sans recréer ni toucher ses items", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { error: null }
        return { data: null }
      },
    })

    const result = await restoreList("list-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("insert", "list_items")).toHaveLength(0)
    expect(callsFor("update", "list_items")).toHaveLength(0)
    const update = callsFor("update", "lists")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: null })
    expect(update[0].filters).toMatchObject({ id: "list-1", couple_id: "couple-1" })
  })
})

describe("deleteItem / restoreItem — soft-delete d'un article", () => {
  it("pose deleted_at filtré id + list_id, jamais un DELETE", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "list_items") return { error: null }
        return { data: null }
      },
    })

    const result = await deleteItem("list-1", "item-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("delete", "list_items")).toHaveLength(0)
    const update = callsFor("update", "list_items")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: expect.any(String) })
    expect(update[0].filters).toMatchObject({ id: "item-1", list_id: "list-1" })
  })

  it("restaure un article filtré id + list_id", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "list-1", kind: "courses" } }
        if (ctx.table === "list_items") return { error: null }
        return { data: null }
      },
    })

    const result = await restoreItem("list-1", "item-1")

    expect(result).toEqual({ ok: true })
    const update = callsFor("update", "list_items")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: null })
    expect(update[0].filters).toMatchObject({ id: "item-1", list_id: "list-1" })
  })
})

describe("deleteTask / restoreTask — soft-delete d'une tâche", () => {
  it("pose deleted_at filtré id + list_id, jamais un DELETE", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "todo-1", kind: "todo" } }
        if (ctx.table === "tasks") return { error: null }
        return { data: null }
      },
    })

    const result = await deleteTask("todo-1", "task-1")

    expect(result).toEqual({ ok: true })
    expect(callsFor("delete", "tasks")).toHaveLength(0)
    const update = callsFor("update", "tasks")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: expect.any(String) })
    expect(update[0].filters).toMatchObject({ id: "task-1", list_id: "todo-1" })
  })

  it("restaure une tâche filtrée id + list_id", async () => {
    supa = createSupabaseMock({
      handler: (ctx) => {
        if (ctx.table === "profiles") return { data: { couple_id: "couple-1" } }
        if (ctx.table === "lists") return { data: { id: "todo-1", kind: "todo" } }
        if (ctx.table === "tasks") return { error: null }
        return { data: null }
      },
    })

    const result = await restoreTask("todo-1", "task-1")

    expect(result).toEqual({ ok: true })
    const update = callsFor("update", "tasks")
    expect(update).toHaveLength(1)
    expect(update[0].payload).toMatchObject({ deleted_at: null })
    expect(update[0].filters).toMatchObject({ id: "task-1", list_id: "todo-1" })
  })
})
