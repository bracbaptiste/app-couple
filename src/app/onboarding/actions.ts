"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

/** Couleurs d'identité disponibles (PRD §5.3). */
const COLORS = ["sauge", "brique"] as const
type Color = (typeof COLORS)[number]

type RpcResult = { ok?: boolean; code?: string; invite_code?: string }

function asRpcResult(value: unknown): RpcResult {
  return value && typeof value === "object" ? (value as RpcResult) : {}
}

/**
 * État renvoyé au formulaire « Créer ». En cas de succès on NE redirige PAS
 * tout de suite : on renvoie l'`inviteCode` pour que le créateur puisse le
 * partager avec son/sa partenaire avant de continuer vers les listes.
 */
export type CreateState = {
  error?: string
  inviteCode?: string
}

/** État renvoyé au formulaire « Rejoindre » (redirige vers /lists si succès). */
export type JoinState = {
  error?: string
}

/** Borne un prénom : non vide, longueur raisonnable. */
function normalizeName(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, 40)
}

/**
 * Crée un nouvel espace couple :
 *   1. insère la ligne `couples` (invite_code généré par défaut côté DB)
 *   2. complète le profil (display_name, color, couple_id)
 *   3. crée les catégories de départ
 * Renvoie l'invite_code (succès) au lieu de rediriger, pour l'afficher.
 */
export async function createCouple(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const displayName = normalizeName(formData.get("display_name"))
  const color = String(formData.get("color") ?? "") as Color

  if (!displayName) {
    return { error: "Entre ton prénom." }
  }
  if (!COLORS.includes(color)) {
    return { error: "Choisis une couleur." }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Une transaction DB unique : couple, profil et catégories sont tous créés
  // ou tous annulés. Aucun état d'onboarding partiel ne peut subsister.
  const { data, error } = await supabase.rpc("create_couple", {
    p_display_name: displayName,
    p_color: color,
  })

  if (error) {
    return { error: "Impossible de créer l'espace couple. Réessaie." }
  }

  const result = asRpcResult(data)
  if (result.code === "ALREADY_MEMBER") redirect("/lists")
  if (!result.ok || !result.invite_code) {
    return { error: "Impossible de créer l'espace couple. Réessaie." }
  }

  return { inviteCode: result.invite_code }
}

/**
 * Rejoint un espace existant via son code d'invitation. Toute la logique
 * (validation du code, cap de 2 membres, couleur restante, rattachement) est
 * atomique côté DB dans la fonction `join_couple`. On traduit ses exceptions
 * en messages clairs.
 */
export async function joinCouple(
  _prev: JoinState,
  formData: FormData,
): Promise<JoinState> {
  const code = String(formData.get("invite_code") ?? "").replace(/\D/g, "")
  const displayName = normalizeName(formData.get("display_name"))

  if (!displayName) {
    return { error: "Entre ton prénom." }
  }
  if (code.length !== 6) {
    return { error: "Le code d'invitation fait 6 chiffres." }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: existing } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .single()
  if (existing?.couple_id) redirect("/lists")

  const { data, error } = await supabase.rpc("join_couple", {
    p_code: code,
    p_display_name: displayName,
  })

  if (error) {
    return { error: "Impossible de rejoindre cet espace. Réessaie." }
  }

  const result = asRpcResult(data)
  if (!result.ok) return { error: messageFromJoinCode(result.code) }

  redirect("/lists")
}

/** Traduit le code structuré de `join_couple` en message utilisateur. */
function messageFromJoinCode(code?: string): string {
  if (code === "INVALID_CODE") {
    return "Ce code d'invitation n'existe pas. Vérifie les 6 chiffres."
  }
  if (code === "COUPLE_FULL") {
    return "Cet espace est déjà complet (2 personnes maximum)."
  }
  if (code === "NAME_REQUIRED") {
    return "Entre ton prénom."
  }
  if (code === "RATE_LIMITED") {
    return "Trop de tentatives. Attends 15 minutes avant de réessayer."
  }
  if (code === "ALREADY_MEMBER") {
    return "Ton compte appartient déjà à un espace couple."
  }
  return "Impossible de rejoindre cet espace. Réessaie."
}
