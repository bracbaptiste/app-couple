"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { type Json } from "@/types/database"

import {
  undoBrainActions,
  type JournalActionGroup,
  type RecapLigne,
  type UndoOp,
} from "./execute"

/**
 * LE JOURNAL DU CERVEAU — « ticket de caisse » (PRD_V4 §7, §9, §6).
 *
 * Lecture (ticket) + annulation ligne par ligne, À CÔTÉ de l'historique d'achats
 * (il ne trace QUE les commandes du Cerveau). L'ÉCRITURE d'une ligne se fait à
 * l'exécution (cf. `executeBrainActions` dans `./execute.ts`) ; ce module porte :
 *   - {@link fetchBrainJournal} : les 100 dernières commandes du couple (§7) ;
 *   - {@link undoBrainCommand} : l'annulation journalisée (§6) — réserve la ligne,
 *     rejoue les {@link UndoOp}, puis la raye (`statut` `fait` → `annule`, §7).
 *
 * Sécurité : tout passe par la RLS couple de `brain_commands`. L'annulation est
 * un CLAIM atomique (`annule_at` posé pendant le rejeu) : deux annulations
 * concurrentes (les deux membres, ou toast + ticket) ne rejouent jamais deux fois
 * les mêmes gestes.
 */

/** Couleur d'avatar d'un membre (point sauge/brique du ticket, §7). */
export type AuteurColor = "sauge" | "brique"

/** Un ticket (une commande journalisée) prêt à afficher (§7). */
export type JournalTicket = {
  id: string
  createdAt: string
  /** Prénom de l'auteur, ou « ? » si le profil a disparu. */
  auteurNom: string
  auteurColor: AuteurColor
  /** La phrase dictée d'origine. */
  texteDicte: string
  /** Actions exécutées, groupées et détaillées. */
  groups: JournalActionGroup[]
  statut: "fait" | "annule"
  annuleAt: string | null
  /**
   * Vrai si la ligne peut ENCORE être annulée (§12 Phase 3) : exécutée + un bloc
   * d'annulation présent. Une ligne déjà annulée OU non réversible → faux (pas de
   * bouton ANNULER).
   */
  annulable: boolean
}

/** Plafond d'affichage (§7 rétention : 100 dernières, pas de purge auto). */
const JOURNAL_LIMIT = 100

/** Normalise une couleur DB (text libre) vers l'union du front. */
function asColor(value: string | null | undefined): AuteurColor {
  return value === "brique" ? "brique" : "sauge"
}

/** Valide défensivement le jsonb `actions` en groupes affichables. */
function parseGroups(raw: Json | null): JournalActionGroup[] {
  if (!Array.isArray(raw)) return []
  const groups: JournalActionGroup[] = []
  for (const g of raw) {
    if (!g || typeof g !== "object" || Array.isArray(g)) continue
    const o = g as Record<string, unknown>
    const label = typeof o.label === "string" ? o.label : ""
    const rawLignes = Array.isArray(o.lignes) ? o.lignes : []
    const lignes: RecapLigne[] = []
    for (const l of rawLignes) {
      if (!l || typeof l !== "object") continue
      const lo = l as Record<string, unknown>
      if (typeof lo.nom === "string" && typeof lo.detail === "string") {
        lignes.push({ nom: lo.nom, detail: lo.detail })
      }
    }
    if (label || lignes.length > 0) groups.push({ label, lignes })
  }
  return groups
}

/** Extrait les {@link UndoOp} du jsonb `undo_data` (shape { ops: [...] }). */
function extractUndoOps(raw: Json | null): UndoOp[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return []
  const ops = (raw as { ops?: unknown }).ops
  if (!Array.isArray(ops)) return []
  return ops.filter(
    (o): o is UndoOp =>
      !!o && typeof o === "object" && typeof (o as { kind?: unknown }).kind === "string",
  )
}

/** Garde d'auth + rattachement couple (même pattern que le reste du module). */
async function requireCouple() {
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

  return { supabase, userId: user.id, coupleId: profile.couple_id }
}

/**
 * Lit les {@link JOURNAL_LIMIT} dernières commandes du couple (§7), les plus
 * récentes d'abord, avec l'auteur (nom + couleur) pour le point du ticket. RLS
 * couple : on ne voit que son propre journal.
 */
export async function fetchBrainJournal(): Promise<JournalTicket[]> {
  const supabase = await createClient()

  // Commandes + profils du couple lus séparément (2 membres — pas d'embed à deux
  // FK ambiguës vers `profiles`). Tout est borné par la RLS couple.
  const [cmdRes, profRes] = await Promise.all([
    supabase
      .from("brain_commands")
      .select(
        "id, created_at, texte_dicte, actions, statut, undo_data, annule_at, user_id",
      )
      .order("created_at", { ascending: false })
      .limit(JOURNAL_LIMIT),
    supabase.from("profiles").select("id, display_name, color"),
  ])

  const rows = cmdRes.data ?? []
  const profById = new Map((profRes.data ?? []).map((p) => [p.id, p]))

  return rows.map((row) => {
    const auteur = row.user_id ? profById.get(row.user_id) : null
    const statut = row.statut === "annule" ? "annule" : "fait"
    return {
      id: row.id,
      createdAt: row.created_at,
      auteurNom: auteur?.display_name?.trim() || "?",
      auteurColor: asColor(auteur?.color),
      texteDicte: row.texte_dicte,
      groups: parseGroups(row.actions),
      statut,
      annuleAt: row.annule_at,
      // Annulable = encore « fait », pas déjà réservée par une annulation en cours,
      // ET un bloc d'annulation présent (§12 Phase 3).
      annulable:
        statut === "fait" &&
        !row.annule_at &&
        extractUndoOps(row.undo_data).length > 0,
    }
  })
}

/**
 * Journalise une PROPOSITION IA ACCEPTÉE (§7 périmètre : « vocal + propositions IA
 * acceptées »). Utilisée par les intents de niveau 2 Phase 6 après validation :
 * recette proposée enregistrée, ingrédients ajoutés, semaine placée. `undo_data`
 * reste null (ces écritures ne s'annulent pas « en bloc » depuis le ticket : la
 * recette se supprime tactilement, la liste via le retrait ciblé §8.6). L'insert
 * est borné par la RLS (`user_id = auth.uid()`, `couple_id = couple courant`).
 */
export async function journalBrainProposition(
  texteDicte: string,
  groups: JournalActionGroup[],
): Promise<void> {
  const phrase = texteDicte.trim().slice(0, 1000)
  if (!phrase || groups.length === 0) return
  const { supabase, userId, coupleId } = await requireCouple()
  await supabase.from("brain_commands").insert({
    couple_id: coupleId,
    user_id: userId,
    texte_dicte: phrase,
    actions: groups as unknown as Json,
    statut: "fait",
    undo_data: null,
  })
  revalidatePath("/profile/journal")
}

export type UndoCommandResult = { ok: true } | { ok: false; error: string }

/**
 * Annule une commande journalisée (§6). CLAIM atomique : ne bascule que si la
 * ligne est encore `fait` ET réversible (`undo_data` non nul) — ce qui bloque le
 * double-undo (toast + ticket, ou les deux membres en même temps). Rejoue ensuite
 * les {@link UndoOp} sous RLS et raye la ligne. `annule_at`/`annule_by`
 * journalisent l'annulation elle-même (§6).
 */
export async function undoBrainCommand(
  journalId: string,
): Promise<UndoCommandResult> {
  if (!journalId) return { ok: false, error: "Commande introuvable." }
  const { supabase, userId, coupleId } = await requireCouple()

  const { data: claimed, error: claimErr } = await supabase
    .from("brain_commands")
    .update({
      annule_at: new Date().toISOString(),
      annule_by: userId,
    })
    .eq("id", journalId)
    .eq("couple_id", coupleId)
    .eq("statut", "fait")
    .is("annule_at", null)
    .not("undo_data", "is", null)
    .select("undo_data")
    .maybeSingle()

  if (claimErr) {
    return { ok: false, error: "Annulation impossible. Réessaie." }
  }

  if (!claimed) {
    // Déjà annulée/en cours, non réversible, ou introuvable sous RLS.
    return { ok: false, error: "Cette commande a déjà été annulée." }
  }

  // La ligne est réservée mais pas encore rayée : on ne passe à `annule` qu'après
  // un rejeu réussi.
  const ops = extractUndoOps(claimed.undo_data)
  if (ops.length > 0) {
    const undone = await undoBrainActions({ ops })
    if (!undone.ok) {
      await supabase
        .from("brain_commands")
        .update({ annule_at: null, annule_by: null })
        .eq("id", journalId)
        .eq("couple_id", coupleId)
        .eq("statut", "fait")
        .eq("annule_by", userId)
      return undone
    }
  }

  const { error: doneErr } = await supabase
    .from("brain_commands")
    .update({ statut: "annule" })
    .eq("id", journalId)
    .eq("couple_id", coupleId)
    .eq("statut", "fait")
    .eq("annule_by", userId)

  if (doneErr) {
    return { ok: false, error: "Annulation appliquée, mais le ticket n'a pas pu être rayé." }
  }

  revalidatePath("/profile/journal")
  return { ok: true }
}
