"use client"

import Link from "next/link"
import { useActionState } from "react"

import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"

import { login, type AuthState } from "../actions"
import { Field, FormFeedback, SubmitButton } from "../form-ui"

const initialState: AuthState = {}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, initialState)

  return (
    <RisoCard shadow="brique" padding="lg">
      <h2 className="mb-5 font-display text-lg uppercase text-ink">Connexion</h2>

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
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </Field>

        <FormFeedback error={state.error} message={state.message} />

        <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
      </form>

      <div className="mt-5 flex flex-col gap-2 text-center text-[13px] text-ink-soft">
        <Link href="/forgot-password" className="underline underline-offset-2">
          Mot de passe oublié ?
        </Link>
        <span>
          Pas encore de compte ?{" "}
          <Link
            href="/signup"
            className="font-semibold text-brique underline underline-offset-2"
          >
            Créer un compte
          </Link>
        </span>
      </div>
    </RisoCard>
  )
}
