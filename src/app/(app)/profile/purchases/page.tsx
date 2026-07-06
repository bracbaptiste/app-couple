import { ShoppingBag } from "lucide-react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { HistoryView, type HistoryEntry } from "@/components/profile/HistoryView"

/**
 * Historique des achats (/profile/purchases).
 *
 * Lecture seule (server component, sous RLS) : tous les articles cochés des
 * listes de courses accessibles, les 50 plus récents, regroupés par mois. Chaque
 * ligne dit CE QUI a été acheté, OÙ (le nom de la liste) et QUAND.
 *
 * C'est la destination des articles « Déjà pris » au-delà de 24h : passé ce
 * délai, ils quittent la liste vivante pour ce registre figé. Pour décocher un
 * achat récent, on revient sur la liste (section « Déjà pris »).
 */
export default async function PurchaseHistoryPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  const supabase = await createClient()

  // La RLS sur `list_items` (via la liste parente) restreint déjà aux listes
  // accessibles : pas de filtre couple_id explicite ici. `list_items` n'existe
  // que pour les listes de courses, donc pas de filtre `kind` non plus.
  const { data, error } = await supabase
    .from("list_items")
    .select("id, checked_at, library_items(name), lists(name)")
    .eq("is_checked", true)
    .is("deleted_at", null)
    .order("checked_at", { ascending: false })
    .limit(50)

  if (error) throw new Error("Impossible de charger l'historique des achats")

  const entries: HistoryEntry[] = (data ?? [])
    // Garde-fou : on ne garde que les achats horodatés (tri / regroupement sûrs).
    .filter((row) => row.checked_at)
    .map((row) => ({
      id: row.id,
      label: row.library_items?.name ?? "Article",
      context: row.lists?.name ?? "Liste",
      at: row.checked_at as string,
    }))

  return (
    <HistoryView
      title="Historique des achats"
      entries={entries}
      agoPrefix="Acheté"
      icon={
        <ShoppingBag
          className="mt-0.5 size-4 shrink-0 text-sauge"
          strokeWidth={2.5}
          aria-hidden
        />
      }
      emptyMessage="Aucun achat pour l’instant. Coche des articles dans tes listes de courses : tu les retrouveras ici, avec le lieu et la date."
    />
  )
}
