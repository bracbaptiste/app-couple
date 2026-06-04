"use client"

import { useFormStatus } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"

/** Bouton de soumission pleine largeur, désactivé + libellé d'attente pendant l'envoi. */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode
  pendingLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <RisoButton
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="h-12 w-full text-sm"
    >
      {pending ? pendingLabel : children}
    </RisoButton>
  )
}

/**
 * Bandeau de retour utilisateur sous le formulaire.
 * `error` → brique (échec) ; `message` → sauge (info neutre / succès).
 */
export function FormFeedback({
  error,
  message,
}: {
  error?: string
  message?: string
}) {
  if (!error && !message) return null

  return (
    <p
      role={error ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "rounded-[8px] border-2 px-3 py-2.5 text-[13px] font-medium leading-snug",
        error
          ? "border-brique bg-brique/10 text-ink"
          : "border-sauge bg-sauge/15 text-ink",
      )}
    >
      {error ?? message}
    </p>
  )
}

/** Libellé + champ, espacement cohérent entre les formulaires. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
