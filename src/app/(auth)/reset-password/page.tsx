"use client"

import { useActionState } from "react"

import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"

import { updatePassword, type AuthState } from "../actions"
import { Field, FormFeedback, SubmitButton } from "../form-ui"

const initialState: AuthState = {}

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState(updatePassword, initialState)

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-2 font-display text-lg uppercase text-ink">
        Nouveau mot de passe
      </h2>
      <p className="mb-5 text-[13px] leading-snug text-ink-soft">
        Choisis un nouveau mot de passe d’au moins 8 caractères.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field label="Nouveau mot de passe" htmlFor="password">
          <RisoInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirmer" htmlFor="confirm">
          <RisoInput
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>

        <FormFeedback error={state.error} message={state.message} />
        <SubmitButton pendingLabel="Enregistrement…">
          Enregistrer le mot de passe
        </SubmitButton>
      </form>
    </RisoCard>
  )
}
