"use client"

import Link from "next/link"
import { Check, Minus, Plus, ShoppingCart, X } from "lucide-react"
import { useState, useTransition } from "react"
import { createPortal } from "react-dom"

import { RisoButton, risoButtonVariants } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"
import { decrireFusion } from "@/lib/recipes/format"
import { journalBrainProposition } from "@/lib/brain/journal"
import {
  addRecipeIngredientsToList,
  previewRecipeIngredientsToList,
  type FusionRecapLigne,
} from "./actions"

/**
 * Flux vocal `recettes.ajouter_ingredients` (PRD_V4 §5.2) : « ajoute les
 * ingrédients de la ratatouille à la liste Auchan » (niveau 2, §6).
 *
 * ÉCRAN DE VALIDATION avant écriture : ajustement du nombre de personnes (§8.2)
 * puis récapitulatif de FUSION transparent (§6) — RIEN n'est écrit avant « Valider »
 * ({@link previewRecipeIngredientsToList} lit sans écrire ; {@link
 * addRecipeIngredientsToList} re-lit puis écrit). La proposition acceptée est
 * journalisée (§7).
 */

type Step =
  | { name: "config" }
  | { name: "apercu"; recap: FusionRecapLigne[]; listName: string }
  | { name: "succes"; listName: string }

export function AddIngredientsFlow({
  recipeId,
  titre,
  listId,
  personnes,
  texteDicte,
  onClose,
}: {
  recipeId: string
  titre: string
  listId: string
  /** Nombre de personnes proposé par la voix, ou null → défaut 2 (§8.5.2). */
  personnes: number | null
  texteDicte: string
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>({ name: "config" })
  const [nb, setNb] = useState(personnes && personnes > 0 ? personnes : 2)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()

  function voirApercu() {
    setError(undefined)
    startTransition(async () => {
      const res = await previewRecipeIngredientsToList(recipeId, listId, nb)
      if (res.ok) setStep({ name: "apercu", recap: res.recap, listName: res.listName })
      else setError(res.error)
    })
  }

  function valider() {
    setError(undefined)
    startTransition(async () => {
      const res = await addRecipeIngredientsToList(recipeId, listId, nb)
      if (!res.ok) {
        setError(res.error)
        return
      }
      const listName =
        step.name === "apercu" ? step.listName : "la liste"
      // Proposition IA acceptée → ligne de ticket (§7). Échec non bloquant.
      try {
        await journalBrainProposition(texteDicte, [
          {
            label: `Ingrédients de « ${titre} » → « ${listName} »`,
            lignes: res.recap.map((l) => ({
              nom: l.nom,
              detail: decrireFusion(l.operation, l.quantites),
            })),
          },
        ])
      } catch {
        /* ignore */
      }
      setStep({ name: "succes", listName })
    })
  }

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajouter les ingrédients à une liste"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={pending ? undefined : onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative flex max-h-[88vh] w-full max-w-sm flex-col rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="min-w-0 font-display text-base uppercase leading-tight text-ink">
            {step.name === "succes" ? "C’est noté !" : `Ingrédients · ${titre}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-[8px] text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
          >
            <X className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        {/* --- Étape 1 : ajustement du nombre de personnes -------------------- */}
        {step.name === "config" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                Pour combien de personnes ?
              </span>
              <div className="flex items-center gap-2">
                <StepBtn
                  label="Retirer une personne"
                  onClick={() => setNb((n) => Math.max(1, n - 1))}
                  disabled={nb <= 1}
                  icon={Minus}
                />
                <span className="w-8 text-center font-display text-[20px] text-ink" aria-live="polite">
                  {nb}
                </span>
                <StepBtn
                  label="Ajouter une personne"
                  onClick={() => setNb((n) => n + 1)}
                  icon={Plus}
                />
              </div>
            </div>
            <RisoButton onClick={voirApercu} disabled={pending} className="h-12 w-full text-sm">
              {pending ? "Calcul…" : "Voir le récapitulatif"}
            </RisoButton>
          </div>
        )}

        {/* --- Étape 2 : récap de fusion (transparent, §6) -------------------- */}
        {step.name === "apercu" && (
          <div className="flex min-h-0 flex-col gap-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              Vers « {step.listName} » · pour {nb}
            </p>
            <ul className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1">
              {step.recap.map((l, i) => (
                <li
                  key={`${l.nom}-${i}`}
                  className="flex items-baseline justify-between gap-3 rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-[14px] text-ink"
                >
                  <span className="min-w-0 font-medium">{l.nom}</span>
                  <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                    {decrireFusion(l.operation, l.quantites)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <RisoButton onClick={valider} disabled={pending} className="h-12 w-full text-sm">
                <ShoppingCart className="size-4" strokeWidth={2.5} aria-hidden />
                {pending ? "Ajout…" : `Valider et ajouter (${step.recap.length})`}
              </RisoButton>
              <RisoButton
                variant="ghost"
                size="sm"
                onClick={() => setStep({ name: "config" })}
                disabled={pending}
                className="h-10 w-full text-[11px]"
              >
                Retour
              </RisoButton>
            </div>
          </div>
        )}

        {/* --- Étape 3 : succès ---------------------------------------------- */}
        {step.name === "succes" && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <span className="inline-flex size-12 items-center justify-center rounded-full border-2 border-ink bg-sauge shadow-riso-ink-sm">
              <Check className="size-6 text-ink" strokeWidth={3} aria-hidden />
            </span>
            <p className="text-[14px] text-ink">
              Ingrédients ajoutés à <span className="font-medium">{step.listName}</span>.
            </p>
            <Link
              href={`/lists/${listId}`}
              onClick={onClose}
              className={cn(risoButtonVariants(), "h-12 w-full text-sm")}
            >
              <ShoppingCart className="size-4" strokeWidth={2.5} aria-hidden />
              Voir la liste
            </Link>
            <RisoButton variant="ghost" size="sm" onClick={onClose} className="w-full">
              Fermer
            </RisoButton>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
          >
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Bouton rond du stepper (zone tap ≥ 44px). */
function StepBtn({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon: typeof Plus
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-[10px] border-2 border-ink bg-paper-light text-ink outline-none transition-[transform,background-color] hover:bg-sauge active:translate-x-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40 motion-reduce:transition-none"
    >
      <Icon className="size-5" strokeWidth={2.5} aria-hidden />
    </button>
  )
}
