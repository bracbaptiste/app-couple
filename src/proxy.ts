import type { NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

/**
 * Proxy (ex-middleware, renommé depuis Next.js 16) : rafraîchit la session
 * Supabase et garde les routes protégées. La logique vit dans `updateSession`.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  /*
   * S'exécute sur toutes les routes SAUF :
   *   - _next/static, _next/image  (assets build)
   *   - favicon / manifest / sw / icônes / images
   * Affiner si certaines routes publiques d'API sont ajoutées plus tard.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
