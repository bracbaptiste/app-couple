"use client"

import Link from "next/link"
import { useActionState } from "react"

import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"

import { requestPasswordReset, type AuthState } from "../actions"
import { Field, FormFeedback, SubmitButton } from "../form-ui"

const initialState: AuthState = {}

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(
    requestPasswordReset,
    initialState,
  )

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-2 font-display text-lg uppercase text-ink">
        Mot de passe oublié
      </h2>
      <p className="mb-5 text-[13px] leading-snug text-ink-soft">
        Entre ton e-mail : on t&apos;envoie un lien pour choisir un nouveau mot
        de passe.
      </p>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field label="E-mail" htmlFor="email">
          <RisoInput
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="toi@exemple.fr"
            required
          />
        </Field>

        <FormFeedback error={state.error} message={state.message} />

        <SubmitButton pendingLabel="Envoi…">Envoyer le lien</SubmitButton>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-soft">
        <Link href="/login" className="underline underline-offset-2">
          Retour à la connexion
        </Link>
      </p>
    </RisoCard>
  )
}
