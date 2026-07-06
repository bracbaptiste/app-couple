import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/types/database"

/** Pages publiques d'authentification (accessibles sans session). */
export const AUTH_PATHS = ["/login", "/signup", "/forgot-password"] as const

/** Flux techniques publics qui ne doivent pas rediriger une session active. */
export const FLOW_PUBLIC_PATHS = ["/auth/callback", "/reset-password"] as const

/** Destination d'un utilisateur connecté qui n'a pas encore de couple. */
export const ONBOARDING_PATH = "/onboarding"

/** Destination d'un utilisateur connecté dont le couple est configuré. */
export const LISTS_PATH = "/lists"

/** `true` si le chemin fait partie des pages publiques d'authentification. */
export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** `true` si le chemin est public (auth + flux techniques). */
export function isPublicPath(pathname: string): boolean {
  return (
    isAuthPath(pathname) ||
    FLOW_PUBLIC_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
  )
}

/**
 * Où envoyer un utilisateur **connecté** selon l'état de son couple :
 *   - pas encore rattaché à un couple → `/onboarding`
 *   - couple configuré                → `/lists`
 *
 * Le profil est créé à l'inscription par le trigger `handle_new_user`
 * (couple_id NULL au départ), donc l'absence de ligne est traitée comme
 * « pas encore de couple ».
 */
export async function resolveLandingPath(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", userId)
    .maybeSingle()

  if (error) throw new Error("Impossible de déterminer la destination utilisateur")
  return data?.couple_id ? LISTS_PATH : ONBOARDING_PATH
}
