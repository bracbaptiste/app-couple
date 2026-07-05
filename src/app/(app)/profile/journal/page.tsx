import { redirect } from "next/navigation"

import { requireAuth } from "@/lib/supabase/auth"
import { fetchBrainJournal } from "@/lib/brain/journal"

import { BrainJournalView } from "./journal-client"

/**
 * Journal du Cerveau — le « ticket de caisse » (PRD_V4 §7).
 *
 * Lecture (server component, sous RLS couple) : les 100 dernières COMMANDES DU
 * CERVEAU (vocal + propositions IA acceptées) — À CÔTÉ de l'historique d'achats,
 * pas à sa place. Le rendu (bord perforé, en-têtes Silkscreen, impression ligne
 * à ligne) et l'interactivité (ANNULER, Realtime) vivent dans le client.
 */
export default async function BrainJournalPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const tickets = await fetchBrainJournal()

  return <BrainJournalView tickets={tickets} coupleId={profile.couple_id} />
}
