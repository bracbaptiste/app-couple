import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

/**
 * Utilisateur authentifié (depuis le serveur d'auth Supabase) accompagné
 * de son profil applicatif (table `profiles`).
 */
export type AuthenticatedUser = {
  /** Identité vérifiée côté serveur Supabase. */
  user: NonNullable<
    Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>["auth"]["getUser"]>>["data"]["user"]
  >;
  /** Profil applicatif lié, ou `null` s'il n'a pas encore été créé. */
  profile: Profile | null;
};

/**
 * Récupère le profil applicatif de l'utilisateur courant côté serveur.
 *
 * Utilise `auth.getUser()` (et non `getSession()`) pour valider le jeton
 * auprès du serveur Supabase. Retourne `null` si personne n'est connecté.
 */
export async function getCurrentUserProfile(): Promise<Profile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

/**
 * Garde-fou pour les pages/route handlers protégés.
 *
 * Redirige vers `/login` si aucun utilisateur n'est authentifié, sinon
 * retourne l'utilisateur vérifié et son profil applicatif.
 *
 * @example
 * export default async function Page() {
 *   const { profile } = await requireAuth();
 *   return <p>Bonjour {profile?.display_name}</p>;
 * }
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { user, profile };
}
