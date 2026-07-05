"use client"

import { Loader2, Sparkles, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { cn } from "@/lib/utils"
import { journalBrainProposition } from "@/lib/brain/journal"
import { ReviewForm } from "@/app/(app)/recipes/new/review-form"
import { type PropositionPlacement } from "@/lib/planning/proposal"

import { placeMeal } from "./actions"

/**
 * Flux vocal `planning.proposer_semaine` (PRD_V4 §8.4, Phase 6) : « propose-moi
 * une semaine avec 3 dîners végétariens » (niveau 2).
 *
 * Déroulé, RIEN placé avant validation (§6) :
 *   1. traitement — appel Opus via `/api/planning/propose-week` (priorité aux
 *      recettes existantes ; les nouvelles sont marquées « nouvelle recette ») ;
 *   2. review     — proposition sur la grille, REFUSABLE CASE PAR CASE (une case
 *      par ligne, décochable) ;
 *   3. placement  — pour chaque case retenue : recette existante → `placeMeal` ;
 *      NOUVELLE recette → passe d'abord par l'ÉCRAN DE RELECTURE V3 (`ReviewForm`,
 *      `source = 'ia'`) qui la crée, puis `placeMeal` (§8.2) ;
 *   4. succès     — la proposition acceptée est journalisée (§7).
 */

type Ligne = { nom: string; detail: string }

type Phase =
  | { name: "traitement" }
  | { name: "review" }
  | { name: "placing" }
  | { name: "reviewNew" }
  | { name: "succes"; count: number }
  | { name: "erreur"; message: string }

async function proposerSemaine(
  contraintes: string,
  weekStartKey: string,
): Promise<PropositionPlacement[]> {
  const res = await fetch("/api/planning/propose-week", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contraintes, weekStartKey }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Erreur HTTP ${res.status}`)
  return (data.placements ?? []) as PropositionPlacement[]
}

export function WeekProposalFlow({
  contraintes,
  weekStartKey,
  texteDicte,
  onClose,
}: {
  contraintes: string
  weekStartKey: string
  texteDicte: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ name: "traitement" })
  const [placements, setPlacements] = useState<PropositionPlacement[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [error, setError] = useState<string | undefined>()

  // File des NOUVELLES recettes retenues à relire une par une, et l'accumulateur
  // des repas réellement placés (pour la ligne de ticket §7). Refs : traversent les
  // async sans capture périmée.
  const [newQueue, setNewQueue] = useState<PropositionPlacement[]>([])
  const placedRef = useRef<Ligne[]>([])
  const lance = useRef(false)

  useEffect(() => {
    if (lance.current) return
    lance.current = true
    proposerSemaine(contraintes, weekStartKey)
      .then((p) => {
        setPlacements(p)
        setSelected(new Set(p.map((_, i) => i))) // tout coché par défaut
        setPhase({ name: "review" })
      })
      .catch((e) =>
        setPhase({
          name: "erreur",
          message: e instanceof Error ? e.message : "La proposition a échoué.",
        }),
      )
  }, [contraintes, weekStartKey])

  function toggle(i: number, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(i)
      else next.delete(i)
      return next
    })
  }

  /** Termine le lot : journalise les repas placés (§7) puis écran de succès. */
  async function terminer() {
    const placed = placedRef.current
    if (placed.length > 0) {
      try {
        await journalBrainProposition(texteDicte, [
          { label: "Semaine proposée par le Cerveau", lignes: placed },
        ])
      } catch {
        /* ignore */
      }
    }
    setPhase({ name: "succes", count: placed.length })
  }

  /** Place les recettes EXISTANTES retenues, puis enchaîne les nouvelles. */
  async function valider() {
    setError(undefined)
    const retenues = placements.filter((_, i) => selected.has(i))
    if (retenues.length === 0) return
    placedRef.current = []
    setPhase({ name: "placing" })

    // 1) recettes existantes : placement direct (§8.2).
    for (const p of retenues) {
      if (p.kind !== "existante") continue
      const res = await placeMeal(p.date, p.creneau, {
        kind: "recette",
        recipeId: p.recipe_id,
      })
      if (res.ok) placedRef.current.push({ nom: p.titre, detail: p.label })
    }

    // 2) nouvelles recettes : file de relecture V3 (créées puis placées).
    const news = retenues.filter((p) => p.kind === "nouvelle")
    if (news.length > 0) {
      setNewQueue(news)
      setPhase({ name: "reviewNew" })
    } else {
      await terminer()
    }
  }

  /** Nouvelle recette enregistrée (via ReviewForm) → on la place, puis suivante. */
  async function onNewSaved(recipeId: string) {
    const current = newQueue[0]
    if (current && current.kind === "nouvelle") {
      const res = await placeMeal(current.date, current.creneau, {
        kind: "recette",
        recipeId,
      })
      if (res.ok) placedRef.current.push({ nom: current.recette.titre, detail: current.label })
    }
    await avancerFile()
  }

  /** Passe à la nouvelle recette suivante (ou termine si la file est vide). */
  async function avancerFile() {
    const reste = newQueue.slice(1)
    setNewQueue(reste)
    if (reste.length > 0) {
      setPhase({ name: "reviewNew" })
    } else {
      await terminer()
    }
  }

  if (typeof document === "undefined") return null

  // Relecture V3 d'une nouvelle recette proposée (plein écran défilable).
  if (phase.name === "reviewNew" && newQueue.length > 0 && newQueue[0].kind === "nouvelle") {
    const current = newQueue[0]
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Relecture d’une nouvelle recette proposée"
        className="fixed inset-0 z-[100] overflow-y-auto bg-paper"
      >
        <div className="mx-auto w-full max-w-sm px-4 py-5">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border-2 border-brique bg-brique/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide text-brique">
            <Sparkles className="size-3" strokeWidth={2.5} aria-hidden />
            Nouvelle recette · {current.label}
          </div>
          <ReviewForm
            key={`${current.date}-${current.creneau}`}
            recette={current.recette}
            photoPreviewUrls={[]}
            source="ia"
            onCancel={() => {
              // Refuser cette nouvelle recette : on ne la place pas, on avance.
              void avancerFile()
            }}
            onSaved={(recipeId) => {
              void onNewSaved(recipeId)
            }}
          />
        </div>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Proposition de semaine"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={phase.name === "traitement" || phase.name === "placing" ? undefined : onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-sm flex-col rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-base uppercase leading-none text-ink">
            {phase.name === "succes" ? "C’est noté !" : "Semaine proposée"}
          </h2>
          {phase.name !== "traitement" && phase.name !== "placing" && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
            >
              <X className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
          )}
        </div>

        {(phase.name === "traitement" || phase.name === "placing") && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-ink motion-reduce:animate-none" aria-hidden />
            <p className="text-[13px] text-ink-soft">
              {phase.name === "traitement"
                ? "Le cerveau compose ta semaine…"
                : "Placement en cours…"}
            </p>
          </div>
        )}

        {phase.name === "review" && (
          <div className="flex min-h-0 flex-col gap-3">
            <p className="font-body text-[13px] leading-snug text-ink-soft">
              Décoche les repas que tu ne veux pas. Les « nouvelles recettes »
              passeront par l’écran de relecture avant d’être enregistrées.
            </p>
            <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
              {placements.map((p, i) => {
                const on = selected.has(i)
                const titre = p.kind === "existante" ? p.titre : p.recette.titre
                return (
                  <li key={`${p.date}-${p.creneau}`}>
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-[8px] border-2 px-2 py-1.5 transition-colors",
                        on ? "border-ink bg-paper" : "border-ink/25 bg-paper/50",
                      )}
                    >
                      <RisoCheckbox
                        checked={on}
                        onCheckedChange={(next) => toggle(i, next)}
                        aria-label={on ? `Refuser ${titre}` : `Accepter ${titre}`}
                        className="size-9"
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                          {p.label}
                        </span>
                        <span
                          className={cn(
                            "line-clamp-1 text-[14px] font-medium leading-tight text-ink",
                            !on && "text-ink-soft line-through",
                          )}
                        >
                          {titre}
                        </span>
                      </div>
                      {p.kind === "nouvelle" && (
                        <span className="shrink-0 rounded-full border border-brique px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-brique">
                          nouvelle
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <RisoButton variant="ghost" size="sm" onClick={onClose}>
                Annuler
              </RisoButton>
              <RisoButton size="sm" onClick={valider} disabled={selected.size === 0}>
                Placer ({selected.size})
              </RisoButton>
            </div>
          </div>
        )}

        {phase.name === "succes" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="brain-stamp inline-flex -rotate-3 items-center rounded-[10px] border-[3px] border-brique bg-paper px-4 py-2 shadow-riso-brique">
              <span className="font-display text-lg uppercase leading-none text-brique">
                C’est noté !
              </span>
            </div>
            <p className="text-[14px] text-ink">
              {phase.count > 0
                ? `${phase.count} repas placé${phase.count > 1 ? "s" : ""} sur la semaine.`
                : "Aucun repas placé."}
            </p>
            <RisoButton size="sm" onClick={onClose}>
              OK
            </RisoButton>
          </div>
        )}

        {phase.name === "erreur" && (
          <p
            role="alert"
            className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[13px] font-medium leading-snug text-ink"
          >
            {phase.message}
          </p>
        )}

        {error && phase.name === "review" && (
          <p
            role="alert"
            className="mt-2 rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
          >
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
