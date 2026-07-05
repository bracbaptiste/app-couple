"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { parseDateKey } from "@/lib/planning/week"
import { formatQuantites } from "@/lib/recipes/format"
import { parseQuantites } from "@/lib/recipes/fusion"

import { type ConsultationCible } from "./command-parsing"

/**
 * CONSULTATION VOCALE — réponse À L'ÉCRAN uniquement (PRD_V4 §2.4, §5.2, §10.6).
 *
 * `consultation.lire` est en LECTURE SEULE : cette action ne fait que des SELECT
 * sous RLS et n'écrit JAMAIS en base (aucune ligne de journal non plus — §7 ne
 * trace que les commandes qui modifient l'état ou les propositions IA acceptées).
 * Pas de synthèse vocale (TTS écarté en V4) : le client affiche un panneau ticket.
 *
 * La cible est déjà résolue et bornée par le routeur ({@link ConsultationCible}) ;
 * on revérifie néanmoins l'appartenance au couple (garde-fou §2.12, double la RLS).
 */

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Moment du jour d'un créneau, pour le libellé humain. */
const CRENEAU_LABEL: Record<string, string> = {
  dejeuner: "Déjeuner",
  diner: "Dîner",
}

/** Panneau renvoyé au client selon la cible (rendu « ticket », §10.6). */
export type ConsultationPanel =
  | {
      type: "liste_courses"
      titre: string
      /** Articles NON cochés (« ce qu'il reste à acheter »), avec leur quantité. */
      articles: { nom: string; quantite: string }[]
    }
  | {
      type: "repas_jour"
      titre: string
      repas: { creneau: string; label: string }[]
    }
  | {
      type: "taches_jour"
      titre: string
      taches: { titre: string; fait: boolean }[]
    }

export type ConsultationResult =
  | { ok: true; panel: ConsultationPanel }
  | { ok: false; error: string }

/** Auth + rattachement couple (même pattern que le reste du module Cerveau). */
async function requireMembership(): Promise<{
  supabase: ServerClient
  coupleId: string
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("couple_id")
    .eq("id", user.id)
    .single()
  if (!profile?.couple_id) redirect("/onboarding")

  return { supabase, coupleId: profile.couple_id }
}

/** Libellé humain d'un jour (« jeudi 9 juillet »), pour le titre du panneau. */
const jourFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
})
function libelleJour(dateKey: string): string {
  const d = parseDateKey(dateKey)
  return d ? jourFmt.format(d) : dateKey
}

/**
 * Exécute une consultation LECTURE SEULE et renvoie le panneau à afficher. Aucune
 * écriture, jamais. La cible vient du routeur (déjà validée) ; on borne quand même
 * chaque lecture au couple courant.
 */
export async function lireConsultation(
  cible: ConsultationCible,
): Promise<ConsultationResult> {
  const { supabase, coupleId } = await requireMembership()

  if (cible.type === "liste_courses") {
    // La liste appartient-elle au couple et est-elle bien une liste de courses ?
    const { data: list } = await supabase
      .from("lists")
      .select("id, name, kind")
      .eq("id", cible.liste_id)
      .eq("couple_id", coupleId)
      .maybeSingle()
    if (!list || list.kind === "todo") {
      return { ok: false, error: "Liste introuvable." }
    }

    // « Ce qu'il reste à acheter » = les lignes NON cochées (§10.6).
    const { data: items } = await supabase
      .from("list_items")
      .select("quantities, created_at, library_items(name)")
      .eq("list_id", cible.liste_id)
      .eq("is_checked", false)
      .order("created_at", { ascending: true })

    const articles = (items ?? []).map((it) => {
      const lib = Array.isArray(it.library_items)
        ? it.library_items[0]
        : it.library_items
      return {
        nom: lib?.name ?? "Article",
        quantite: formatQuantites(parseQuantites(it.quantities)),
      }
    })

    return {
      ok: true,
      panel: { type: "liste_courses", titre: list.name, articles },
    }
  }

  if (cible.type === "repas_jour") {
    const { data: meals } = await supabase
      .from("meal_slots")
      .select("creneau, type, texte, recipes(titre)")
      .eq("couple_id", coupleId)
      .eq("date", cible.date)

    // Ordre stable : déjeuner avant dîner.
    const ordre: Record<string, number> = { dejeuner: 0, diner: 1 }
    const repas = (meals ?? [])
      .map((m) => {
        const recette = Array.isArray(m.recipes) ? m.recipes[0] : m.recipes
        const label = m.type === "texte" ? (m.texte ?? "") : (recette?.titre ?? "")
        return { creneau: CRENEAU_LABEL[m.creneau] ?? m.creneau, label, ordre: ordre[m.creneau] ?? 9 }
      })
      .filter((r) => r.label)
      .sort((a, b) => a.ordre - b.ordre)
      .map(({ creneau, label }) => ({ creneau, label }))

    return {
      ok: true,
      panel: { type: "repas_jour", titre: libelleJour(cible.date), repas },
    }
  }

  // taches_jour : tâches à échéance ce jour-là, bornées aux to-do du couple.
  const { data: lists } = await supabase
    .from("lists")
    .select("id")
    .eq("couple_id", coupleId)
    .eq("kind", "todo")
  const todoIds = (lists ?? []).map((l) => l.id)

  let taches: { titre: string; fait: boolean }[] = []
  if (todoIds.length > 0) {
    const { data: rows } = await supabase
      .from("tasks")
      .select("title, is_done")
      .in("list_id", todoIds)
      .eq("due_date", cible.date)
      .order("is_done", { ascending: true })
    taches = (rows ?? []).map((t) => ({ titre: t.title, fait: t.is_done }))
  }

  return {
    ok: true,
    panel: { type: "taches_jour", titre: libelleJour(cible.date), taches },
  }
}
