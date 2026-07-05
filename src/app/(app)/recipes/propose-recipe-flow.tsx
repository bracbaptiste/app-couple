"use client"

import { Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { journalBrainProposition } from "@/lib/brain/journal"
import { type RecetteExtraite } from "@/lib/recipes/extraction"

import { ReviewForm } from "./new/review-form"

/**
 * Flux vocal `recettes.proposer` (PRD_V4 §5.2, §8.4) : « propose-moi une recette
 * avec courgettes et feta ».
 *
 * RÉUTILISE le mode créatif V3 SANS RIEN DUPLIQUER : la composition passe par la
 * route serveur EXISTANTE `/api/recipes/generate` (Opus 4.8, §3), puis atterrit
 * dans l'ÉCRAN DE RELECTURE V3 (`ReviewForm`, `source = 'ia'`). Rien n'est
 * enregistré avant validation (§6) ; à l'enregistrement (`createRecipe`), la
 * proposition acceptée est journalisée (§7).
 */

type Phase =
  | { name: "traitement" }
  | { name: "relecture"; recette: RecetteExtraite; suggestions: string[] }
  | { name: "termine" }
  | { name: "erreur"; message: string }

async function genererRecette(
  demande: string,
): Promise<{ recette: RecetteExtraite; suggestions: string[] }> {
  const res = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "create", demande }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? `Erreur HTTP ${res.status}`)
  return data as { recette: RecetteExtraite; suggestions: string[] }
}

export function ProposeRecipeFlow({
  contraintes,
  texteDicte,
  onClose,
}: {
  contraintes: string
  /** Phrase dictée d'origine, journalisée si la proposition est acceptée (§7). */
  texteDicte: string
  onClose: () => void
}) {
  const [phase, setPhase] = useState<Phase>({ name: "traitement" })
  // La demande est fixée à l'ouverture : on ne génère qu'une fois.
  const lance = useRef(false)

  useEffect(() => {
    if (lance.current) return
    lance.current = true
    genererRecette(contraintes || "une recette simple et savoureuse")
      .then(({ recette, suggestions }) =>
        setPhase({ name: "relecture", recette, suggestions }),
      )
      .catch((e) =>
        setPhase({
          name: "erreur",
          message:
            e instanceof Error ? e.message : "La génération a échoué. Reformule.",
        }),
      )
  }, [contraintes])

  if (typeof document === "undefined") return null

  // Relecture V3 : plein écran défilable (l'écran porte sa propre barre d'action).
  if (phase.name === "relecture") {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Relecture de la recette proposée"
        className="fixed inset-0 z-[100] overflow-y-auto bg-paper"
      >
        <div className="mx-auto w-full max-w-sm px-4 py-5">
          <ReviewForm
            recette={phase.recette}
            photoPreviewUrls={[]}
            source="ia"
            suggestions={phase.suggestions}
            onCancel={onClose}
            onSaved={async () => {
              // Proposition IA ACCEPTÉE → ligne de ticket (§7). L'échec de
              // journalisation ne bloque pas : la recette est déjà enregistrée.
              try {
                await journalBrainProposition(texteDicte, [
                  {
                    label: "Recette proposée par le Cerveau",
                    lignes: [{ nom: phase.recette.titre, detail: "enregistrée" }],
                  },
                ])
              } catch {
                /* ignore */
              }
              setPhase({ name: "termine" })
            }}
          />
        </div>
      </div>,
      document.body,
    )
  }

  // Traitement / terminé / erreur : petit panneau centré.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Proposition de recette"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={phase.name === "traitement" ? undefined : onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative w-full max-w-sm rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        {phase.name === "traitement" && (
          <div className="flex flex-col items-center gap-3 py-8 text-center" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-ink motion-reduce:animate-none" aria-hidden />
            <div>
              <h2 className="font-display text-base uppercase text-ink">
                Composition de la recette…
              </h2>
              <p className="mt-1 text-[13px] text-ink-soft">
                Le cerveau imagine ta recette. Quelques secondes.
              </p>
            </div>
          </div>
        )}

        {phase.name === "termine" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="brain-stamp inline-flex -rotate-3 items-center rounded-[10px] border-[3px] border-brique bg-paper px-4 py-2 shadow-riso-brique">
              <span className="font-display text-lg uppercase leading-none text-brique">
                C’est noté !
              </span>
            </div>
            <p className="text-[13px] text-ink-soft">
              La recette est rangée dans ton carnet.
            </p>
            <RisoButton size="sm" onClick={onClose}>
              OK
            </RisoButton>
          </div>
        )}

        {phase.name === "erreur" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base uppercase leading-none text-ink">
                Aïe
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
              >
                <X className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            <p
              role="alert"
              className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[13px] font-medium leading-snug text-ink"
            >
              {phase.message}
            </p>
            <div className="flex justify-end">
              <RisoButton variant="ghost" size="sm" onClick={onClose}>
                Fermer
              </RisoButton>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
