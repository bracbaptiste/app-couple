"use client"

import Link from "next/link"
import { useActionState, useState } from "react"

import { RisoButton, risoButtonVariants } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { cn } from "@/lib/utils"

import { Field, FormFeedback, SubmitButton } from "@/app/(auth)/form-ui"

import {
  createCouple,
  joinCouple,
  type CreateState,
  type JoinState,
} from "./actions"

type Mode = "choice" | "create" | "join"

const createInitial: CreateState = {}
const joinInitial: JoinState = {}

/** Aiguillage entre l'écran de choix et les deux formulaires. */
export function OnboardingFlow() {
  const [mode, setMode] = useState<Mode>("choice")

  if (mode === "create") return <CreateForm onBack={() => setMode("choice")} />
  if (mode === "join") return <JoinForm onBack={() => setMode("choice")} />

  return (
    <RisoCard shadow="brique" padding="lg">
      <h2 className="mb-2 font-display text-lg uppercase text-ink">
        Bienvenue
      </h2>
      <p className="mb-6 text-[13px] leading-snug text-ink-soft">
        Un espace couple réunit vos listes de courses. Crée le tien ou rejoins
        celui de ton/ta partenaire.
      </p>

      <div className="flex flex-col gap-3">
        <RisoButton
          variant="primary"
          className="h-12 w-full text-sm"
          onClick={() => setMode("create")}
        >
          Créer un espace
        </RisoButton>
        <RisoButton
          variant="secondary"
          className="h-12 w-full text-sm"
          onClick={() => setMode("join")}
        >
          Rejoindre avec un code
        </RisoButton>
      </div>
    </RisoCard>
  )
}

/** Petit lien « retour » partagé par les deux formulaires. */
function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="mt-5 w-full text-center text-[13px] text-ink-soft underline underline-offset-2"
    >
      ← Retour
    </button>
  )
}

/** Sélecteur de couleur d'identité (sauge / brique). */
function ColorPicker({
  value,
  onChange,
}: {
  value: "sauge" | "brique"
  onChange: (c: "sauge" | "brique") => void
}) {
  const options = [
    { id: "sauge", label: "Sauge", swatch: "bg-sauge text-ink" },
    { id: "brique", label: "Brique", swatch: "bg-brique text-paper-light" },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((o) => {
        const selected = value === o.id
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-center gap-2.5 rounded-[10px] border-2 border-ink px-3 py-2.5 transition-[box-shadow,transform]",
              selected
                ? "shadow-riso-ink-sm"
                : "opacity-60 shadow-none active:translate-x-px active:translate-y-px",
            )}
          >
            <span
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] border-2 border-ink font-display text-[13px] uppercase",
                o.swatch,
              )}
            >
              {selected ? "✓" : ""}
            </span>
            <span className="font-display text-sm uppercase text-ink">
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Formulaire « Créer un espace » + écran de succès affichant le code. */
function CreateForm({ onBack }: { onBack: () => void }) {
  const [state, formAction] = useActionState(createCouple, createInitial)
  const [color, setColor] = useState<"sauge" | "brique">("sauge")

  if (state.inviteCode) {
    return <CreateSuccess inviteCode={state.inviteCode} />
  }

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-5 font-display text-lg uppercase text-ink">
        Créer un espace
      </h2>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field label="Ton prénom" htmlFor="display_name">
          <RisoInput
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            placeholder="Camille"
            maxLength={40}
            required
          />
        </Field>

        <Field label="Ta couleur" htmlFor="color">
          <ColorPicker value={color} onChange={setColor} />
          <input type="hidden" name="color" value={color} />
        </Field>

        <FormFeedback error={state.error} />

        <SubmitButton pendingLabel="Création…">Créer l&apos;espace</SubmitButton>
      </form>

      <BackLink onBack={onBack} />
    </RisoCard>
  )
}

/** Succès de création : on montre le code à partager avant d'aller aux listes. */
function CreateSuccess({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Pas de presse-papier (contexte non sécurisé) : le code reste lisible.
    }
  }

  return (
    <RisoCard shadow="brique" padding="lg">
      <h2 className="mb-2 font-display text-lg uppercase text-ink">
        Espace créé !
      </h2>
      <p className="mb-5 text-[13px] leading-snug text-ink-soft">
        Partage ce code avec ton/ta partenaire pour qu&apos;il/elle te
        rejoigne. Tu pourras le retrouver dans les réglages.
      </p>

      <button
        type="button"
        onClick={copy}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-3 py-4 font-display text-3xl tracking-[0.3em] text-ink shadow-riso-sauge"
        aria-label={`Code d'invitation ${inviteCode}, appuie pour copier`}
      >
        {inviteCode}
      </button>

      <p
        aria-live="polite"
        className="mb-5 text-center text-[12px] font-medium text-ink-soft"
      >
        {copied ? "Code copié ✓" : "Appuie sur le code pour le copier"}
      </p>

      <Link
        href="/lists"
        className={cn(risoButtonVariants(), "h-12 w-full text-sm")}
      >
        Aller à mes listes
      </Link>
    </RisoCard>
  )
}

/** Formulaire « Rejoindre avec un code » (redirige vers /lists si succès). */
function JoinForm({ onBack }: { onBack: () => void }) {
  const [state, formAction] = useActionState(joinCouple, joinInitial)

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-5 font-display text-lg uppercase text-ink">
        Rejoindre un espace
      </h2>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field label="Code d'invitation" htmlFor="invite_code">
          <RisoInput
            id="invite_code"
            name="invite_code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="123456"
            className="text-center text-xl tracking-[0.4em]"
            required
          />
        </Field>

        <Field label="Ton prénom" htmlFor="join_display_name">
          <RisoInput
            id="join_display_name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            placeholder="Alex"
            maxLength={40}
            required
          />
        </Field>

        <FormFeedback error={state.error} />

        <SubmitButton pendingLabel="Connexion…">Rejoindre</SubmitButton>
      </form>

      <p className="mt-4 text-center text-[12px] leading-snug text-ink-soft">
        La couleur libre te sera attribuée automatiquement.
      </p>

      <BackLink onBack={onBack} />
    </RisoCard>
  )
}
