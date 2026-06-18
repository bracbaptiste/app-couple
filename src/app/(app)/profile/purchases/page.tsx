import Link from "next/link"
import { ArrowLeft, ShoppingBag } from "lucide-react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/supabase/auth"
import { getDoneAgoLabel } from "@/lib/hooks/useTaskState"

/** Un achat (article coché), aplati pour le rendu de l'historique. */
type HistoryPurchase = {
  id: string
  /** Ce qui a été acheté. */
  name: string
  /** Où : le nom de la liste dont provenait l'article. */
  listName: string
  /** Quand : horodatage du cochage (ISO). */
  checkedAt: string
}

/** Un groupe mensuel d'achats (le plus récent en premier). */
type MonthGroup = {
  /** Clé stable « yyyy-mm » (tri / `key` React). */
  key: string
  /** En-tête lisible, ex. « JUIN 2026 ». */
  label: string
  purchases: HistoryPurchase[]
}

/** Formate « juin 2026 » (mois en toutes lettres + année). */
const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
})

/**
 * Regroupe les achats (déjà triés `checked_at` desc) par mois, en conservant
 * l'ordre d'arrivée — donc les mois les plus récents d'abord, et les achats les
 * plus récents en tête de chaque mois.
 */
function groupByMonth(purchases: HistoryPurchase[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  const byKey = new Map<string, MonthGroup>()

  for (const purchase of purchases) {
    const d = new Date(purchase.checkedAt)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    let group = byKey.get(key)
    if (!group) {
      group = {
        key,
        label: monthFormatter.format(d).toUpperCase(),
        purchases: [],
      }
      byKey.set(key, group)
      groups.push(group)
    }
    group.purchases.push(purchase)
  }

  return groups
}

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
  const { data } = await supabase
    .from("list_items")
    .select("id, checked_at, library_items(name), lists(name)")
    .eq("is_checked", true)
    .order("checked_at", { ascending: false })
    .limit(50)

  const purchases: HistoryPurchase[] = (data ?? [])
    // Garde-fou : on ne garde que les achats horodatés (tri / regroupement sûrs).
    .filter((row) => row.checked_at)
    .map((row) => ({
      id: row.id,
      name: row.library_items?.name ?? "Article",
      listName: row.lists?.name ?? "Liste",
      checkedAt: row.checked_at as string,
    }))

  const groups = groupByMonth(purchases)

  return (
    <section className="mx-auto w-full max-w-sm">
      <div className="mb-4">
        {/* Retour vers le Profil : cible tap 44px, aligné au bord gauche. */}
        <Link
          href="/profile"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Profil
        </Link>
        <h1 className="mt-1 font-display text-xl uppercase text-ink">
          Historique des achats
        </h1>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Aucun achat pour l’instant. Coche des articles dans tes listes de
          courses : tu les retrouveras ici, avec le lieu et la date.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-2">
              <h2 className="border-b-2 border-ink pb-1.5 font-display text-[14px] uppercase leading-none text-ink">
                {group.label}
              </h2>
              <ul className="flex flex-col">
                {group.purchases.map((purchase) => (
                  <li
                    key={purchase.id}
                    className="flex items-start gap-2 border-b border-paper-deep py-2.5 last:border-b-0"
                  >
                    <ShoppingBag
                      className="mt-0.5 size-4 shrink-0 text-sauge"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium leading-tight text-ink">
                        <span className="line-through">{purchase.name}</span>
                        <span className="text-ink-soft">
                          {" "}
                          · {purchase.listName}
                        </span>
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                        Acheté {getDoneAgoLabel(purchase.checkedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
