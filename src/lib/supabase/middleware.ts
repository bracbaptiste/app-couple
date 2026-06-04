import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/types/database"

import { isPublicPath, isAuthPath, resolveLandingPath } from "./redirects"

/**
 * Rafraîchit la session Supabase à chaque requête et applique les redirections
 * d'authentification. Appelé depuis `proxy.ts` (ex-middleware, renommé Proxy
 * depuis Next.js 16).
 *
 * Règles :
 *   - non connecté sur une page protégée            → /login
 *   - connecté sur une page d'auth (login/signup…)  → /lists ou /onboarding
 *
 * ⚠️ `getUser()` (et non `getSession()`) revalide le jeton côté serveur Supabase
 * et ne doit PAS être contourné : c'est ce qui maintient les cookies à jour.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Important : ne rien exécuter entre createServerClient et getUser, sous peine
  // de déconnexions aléatoires difficiles à déboguer.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Non connecté + page protégée → /login
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // Connecté + page d'auth → sa destination (listes ou onboarding)
  if (user && isAuthPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = await resolveLandingPath(supabase, user.id)
    url.search = ""
    return NextResponse.redirect(url)
  }

  // IMPORTANT : retourner `supabaseResponse` tel quel pour préserver les cookies.
  return supabaseResponse
}
