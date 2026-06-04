"use client"

import Link from "next/link"
import { useActionState } from "react"

import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"

import { signup, type AuthState } from "../actions"
import { Field, FormFeedback, SubmitButton } from "../form-ui"

const initialState: AuthState = {}

export default function SignupPage() {
  const [state, formAction] = useActionState(signup, initialState)

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-5 font-display text-lg uppercase text-ink">
        Créer un compte
      </h2>

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

        <Field label="Mot de passe" htmlFor="password">
          <RisoInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="8 caractères minimum"
            minLength={8}
            required
          />
        </Field>

        <Field label="Confirme le mot de passe" htmlFor="confirm">
          <RisoInput
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            required
          />
        </Field>

        <FormFeedback error={state.error} message={state.message} />

        <SubmitButton pendingLabel="Création…">Créer mon compte</SubmitButton>
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-soft">
        Déjà un compte ?{" "}
        <Link
          href="/login"
          className="font-semibold text-brique underline underline-offset-2"
        >
          Se connecter
        </Link>
      </p>
    </RisoCard>
  )
}
