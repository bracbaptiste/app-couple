import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Client Supabase côté navigateur (Client Components).
 * À utiliser dans les composants "use client" pour les requêtes,
 * le temps réel et l'auth côté client.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
