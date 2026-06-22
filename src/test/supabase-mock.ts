import { vi } from "vitest"

/**
 * Mock Supabase **léger** pour tester l'orchestration des Server Actions sans
 * base réelle. Il ne reproduit PAS la sémantique SQL : chaque test fournit un
 * `handler(ctx)` qui décide de la réponse en fonction de la table, de
 * l'opération et des filtres observés. Le `client` expose le sous-ensemble de
 * l'API `@supabase/supabase-js` réellement utilisé par les actions (chaînage
 * `.from().select().eq().ilike().maybeSingle()/.single()`, et les builders
 * `insert/update/delete` directement awaitables).
 *
 * Toutes les requêtes émises sont enregistrées dans `calls`, ce qui permet
 * d'asserter le comportement (déduplication, incrément d'usage, garde-fous).
 */

export type QueryResult = {
  data?: unknown
  error?: unknown
  count?: number | null
}

export type QueryContext = {
  table: string
  op: "select" | "insert" | "update" | "delete" | "rpc"
  filters: Record<string, unknown>
  payload: unknown
  /** Méthode terminale ayant déclenché la résolution. */
  terminal: "maybeSingle" | "single" | "await"
}

export type SupabaseMock = {
  client: {
    auth: { getUser: ReturnType<typeof vi.fn> }
    from: (table: string) => unknown
    rpc: (name: string, payload?: unknown) => Promise<QueryResult>
  }
  /** Historique ordonné des requêtes résolues. */
  calls: QueryContext[]
}

export function createSupabaseMock(opts: {
  user?: { id: string } | null
  handler: (ctx: QueryContext) => QueryResult
}): SupabaseMock {
  const { user = { id: "user-1" }, handler } = opts
  const calls: QueryContext[] = []

  function from(table: string) {
    const state = {
      table,
      op: "select" as QueryContext["op"],
      filters: {} as Record<string, unknown>,
      payload: undefined as unknown,
    }

    const run = (terminal: QueryContext["terminal"]) => {
      const ctx: QueryContext = {
        table: state.table,
        op: state.op,
        filters: { ...state.filters },
        payload: state.payload,
        terminal,
      }
      calls.push(ctx)
      return Promise.resolve<QueryResult>(handler(ctx))
    }

    const builder = {
      // Les colonnes / options de `.select(...)` sont ignorées : le mock ne
      // reproduit pas la projection SQL. Les arguments passés au runtime sont
      // simplement absorbés.
      select() {
        return builder
      },
      insert(payload: unknown) {
        state.op = "insert"
        state.payload = payload
        return builder
      },
      update(payload: unknown) {
        state.op = "update"
        state.payload = payload
        return builder
      },
      delete() {
        state.op = "delete"
        return builder
      },
      eq(col: string, val: unknown) {
        state.filters[col] = val
        return builder
      },
      ilike(col: string, val: unknown) {
        state.filters[`ilike:${col}`] = val
        return builder
      },
      maybeSingle() {
        return run("maybeSingle")
      },
      single() {
        return run("single")
      },
      // Rend le builder awaitable (pour update/insert/delete sans terminale).
      then<T>(
        onFulfilled?: (value: QueryResult) => T,
        onRejected?: (reason: unknown) => T,
      ) {
        return run("await").then(onFulfilled, onRejected)
      },
    }
    return builder
  }

  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from,
      rpc: (name: string, payload?: unknown) => {
        const ctx: QueryContext = {
          table: name,
          op: "rpc",
          filters: {},
          payload,
          terminal: "await",
        }
        calls.push(ctx)
        return Promise.resolve(handler(ctx))
      },
    },
    calls,
  }
}
