import { describe, expect, it } from "vitest"

import { isAuthPath, isPublicPath } from "./redirects"

describe("routes publiques des flux d'authentification", () => {
  it("laisse passer le callback Supabase et le formulaire de nouveau mot de passe", () => {
    expect(isPublicPath("/auth/callback")).toBe(true)
    expect(isPublicPath("/reset-password")).toBe(true)
  })

  it("ne redirige pas une session de récupération comme une page de connexion", () => {
    expect(isAuthPath("/reset-password")).toBe(false)
  })
})
