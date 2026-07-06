import { type Json } from "@/types/database"
import { type createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type AiRateLimitResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

function readBoolean(raw: Json | null, key: string): boolean | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw[key]
  return typeof value === "boolean" ? value : null
}

function readNumber(raw: Json | null, key: string): number | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const value = raw[key]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * Consomme un jeton d'usage pour une route IA.
 *
 * Si la limite est depassee, on bloque avant l'appel Anthropic. La base de donnees
 * fait l'incrementation dans une seule operation, donc deux clics simultanes sont
 * comptes correctement.
 */
export async function consumeAiRateLimit(
  supabase: ServerClient,
  route: string,
  limitPerMinute: number,
): Promise<AiRateLimitResult> {
  const { data, error } = await supabase.rpc("check_ai_rate_limit", {
    p_route: route,
    p_limit: limitPerMinute,
    p_window_seconds: 60,
  })

  if (error) {
    return {
      ok: false,
      status: 500,
      error: "Protection IA indisponible. Reessaie dans un instant.",
    }
  }

  if (readBoolean(data, "ok") === true) return { ok: true }

  const retryAfter = readNumber(data, "retry_after_seconds")
  const suffix = retryAfter ? ` Attends ${retryAfter} s.` : ""
  return {
    ok: false,
    status: 429,
    error: `Trop de demandes IA en peu de temps.${suffix}`,
  }
}
