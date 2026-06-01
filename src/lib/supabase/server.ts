import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

/**
 * Client Supabase côté serveur (Server Components, Route Handlers, Server Actions).
 * `cookies()` est asynchrone sous Next.js (App Router) : ce helper est donc async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Peut échouer si appelé depuis un Server Component (lecture seule) :
          // dans ce cas le middleware/route handler rafraîchira la session.
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Ignoré : appelé depuis un contexte sans écriture de cookies.
          }
        },
      },
    },
  );
}
