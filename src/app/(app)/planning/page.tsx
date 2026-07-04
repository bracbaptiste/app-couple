import { redirect } from "next/navigation"
import { CalendarDays } from "lucide-react"

import { requireAuth } from "@/lib/supabase/auth"

/**
 * Planning (/planning) — PLACEHOLDER Phase 1 (PRD V4 §12).
 *
 * Le jeton Planning de l'éventail du Cerveau pointe déjà ici pour que TOUTES les
 * destinations soient atteignables (critère d'acceptation Phase 1). La vraie
 * grille 7 jours × 2 créneaux (§8) est construite en Phase 4 — cet écran ne fait
 * qu'occuper la route, en gardant la même garde auth + couple que les autres.
 */
export default async function PlanningPage() {
  const { profile } = await requireAuth()

  if (!profile?.couple_id) redirect("/onboarding")

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-ink-soft text-ink-soft">
        <CalendarDays className="size-8" strokeWidth={2.5} aria-hidden />
      </span>
      <h1 className="font-display text-lg uppercase text-ink">Planning</h1>
      <p className="text-sm text-ink-soft">
        La semaine du foyer arrive bientôt : repas, tâches et liste de courses de
        la semaine. En pointillés pour l&apos;instant.
      </p>
    </div>
  )
}
