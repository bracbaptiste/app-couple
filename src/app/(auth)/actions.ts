"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { resolveLandingPath } from "@/lib/supabase/redirects"

/** État renvoyé aux formulaires (consommé via `useActionState`). */
export type AuthState = {
  error?: string
  /** Message neutre (ex. « vérifie tes mails »), pour les flux sans redirection. */
  message?: string
}

/** Validation e-mail minimale (le vrai contrôle reste côté Supabase). */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Lit l'origine de la requête pour construire des URLs absolues (e-mails). */
async function getOrigin(): Promise<string> {
  const h = await headers()
  return (
    h.get("origin") ??
    (h.get("host") ? `https://${h.get("host")}` : "http://localhost:3000")
  )
}

/**
 * Connexion e-mail + mot de passe. Redirige vers la bonne destination
 * (listes ou onboarding) en cas de succès.
 */
export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Renseigne ton e-mail et ton mot de passe." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: "E-mail ou mot de passe incorrect." }
  }

  redirect(await resolveLandingPath(supabase, data.user.id))
}

/**
 * Inscription e-mail + mot de passe. Si la confirmation par e-mail est activée,
 * aucune session n'est créée : on affiche alors un message d'attente.
 */
export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")

  if (!isValidEmail(email)) {
    return { error: "Entre une adresse e-mail valide." }
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit faire au moins 8 caractères." }
  }
  if (password !== confirm) {
    return { error: "Les deux mots de passe ne correspondent pas." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await getOrigin()}/login` },
  })

  if (error) {
    return { error: "Impossible de créer le compte. Réessaie." }
  }

  // Confirmation e-mail activée → pas de session tant que le lien n'est pas cliqué.
  if (!data.session) {
    return {
      message:
        "Compte créé. Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.",
    }
  }

  // Confirmation désactivée → session immédiate, on enchaîne sur l'onboarding.
  redirect(await resolveLandingPath(supabase, data.user!.id))
}

/** Demande de récupération de mot de passe (envoie l'e-mail de réinitialisation). */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim()

  if (!isValidEmail(email)) {
    return { error: "Entre une adresse e-mail valide." }
  }

  const supabase = await createClient()
  // Le callback échange le code PKCE avant d'ouvrir le formulaire sécurisé.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getOrigin()}/auth/callback?next=/reset-password`,
  })

  // Réponse volontairement neutre : ne révèle pas si l'e-mail existe.
  return {
    message:
      "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.",
  }
}

/** Enregistre le nouveau mot de passe après validation du lien de récupération. */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "")
  const confirm = String(formData.get("confirm") ?? "")

  if (password.length < 8) {
    return { error: "Le mot de passe doit faire au moins 8 caractères." }
  }
  if (password !== confirm) {
    return { error: "Les deux mots de passe ne correspondent pas." }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Ce lien a expiré. Demande un nouveau lien de récupération." }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { error: "Impossible de modifier le mot de passe. Réessaie." }
  }

  redirect(await resolveLandingPath(supabase, user.id))
}

/** Déconnexion : invalide la session puis renvoie vers /login. */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
