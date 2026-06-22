"use client"

import Link from "next/link"
import { ChevronRight, LayoutGrid } from "lucide-react"
import { useActionState, useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { cn } from "@/lib/utils"
import { Field, FormFeedback, SubmitButton } from "@/app/(auth)/form-ui"
import { signOut } from "@/app/(auth)/actions"
import { clearOfflineData } from "@/lib/offline/db"

import { leaveCouple, updateProfile, type ActionResult } from "./actions"

type Color = "sauge" | "brique"

const COLOR_META: Record<Color, { label: string; swatch: string }> = {
  sauge: { label: "Sauge", swatch: "bg-sauge text-ink" },
  brique: { label: "Brique", swatch: "bg-brique text-paper-light" },
}

/**
 * Tuile compacte vers la gestion des rayons (/profile/categories).
 * Même gabarit que les tuiles d'historique du Profil : on garde l'écran léger,
 * l'édition (renommer / réordonner / supprimer) vit sur sa page dédiée.
 */
export function CategoriesTile() {
  return (
    <Link
      href="/profile/categories"
      className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-sm outline-none transition-transform focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
    >
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[9px] border-2 border-ink bg-sauge text-ink">
        <LayoutGrid className="size-5" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="flex-1 font-display text-[15px] uppercase text-ink">
        Rayons du couple
      </span>
      <ChevronRight
        className="size-5 shrink-0 text-ink-soft"
        strokeWidth={2.5}
        aria-hidden
      />
    </Link>
  )
}

/* -------------------------------------------------------------------------- */
/*  Identité : prénom + couleur                                                */
/* -------------------------------------------------------------------------- */

export function IdentitySection({
  displayName,
  color,
  partnerColor,
}: {
  displayName: string
  color: Color
  partnerColor: Color | null
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null,
  )
  const [selected, setSelected] = useState<Color>(color)

  const error = state && !state.ok ? state.error : undefined
  const saved = state?.ok ? "Profil enregistré ✓" : undefined

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-5 font-display text-lg uppercase text-ink">
        Mon identité
      </h2>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field label="Prénom" htmlFor="display_name">
          <RisoInput
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            defaultValue={displayName}
            maxLength={40}
            required
          />
        </Field>

        <Field label="Ma couleur" htmlFor="color">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(COLOR_META) as Color[]).map((c) => {
              const meta = COLOR_META[c]
              // Couleur indisponible : prise par le/la partenaire (≠ la mienne).
              const taken = partnerColor === c && c !== color
              const isSelected = selected === c
              return (
                <button
                  key={c}
                  type="button"
                  disabled={taken}
                  // Couleur prise par le/la partenaire : on l'explique au survol.
                  title={taken ? "Couleur déjà prise par ton/ta partenaire" : undefined}
                  aria-pressed={isSelected}
                  onClick={() => setSelected(c)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border-2 border-ink px-3 py-2.5 transition-[box-shadow,transform]",
                    isSelected
                      ? "shadow-riso-ink-sm"
                      : "opacity-60 shadow-none active:translate-x-px active:translate-y-px",
                    taken && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] border-2 border-ink font-display text-[13px] uppercase",
                      meta.swatch,
                    )}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="font-display text-sm uppercase text-ink">
                    {meta.label}
                  </span>
                </button>
              )
            })}
          </div>
          <input type="hidden" name="color" value={selected} />
          {partnerColor && (
            <p className="mt-1 text-[12px] leading-snug text-ink-soft">
              La couleur de ton/ta partenaire ne peut pas être choisie.
            </p>
          )}
        </Field>

        <FormFeedback error={error} message={saved} />

        <SubmitButton pendingLabel="Enregistrement…">
          Enregistrer
        </SubmitButton>
      </form>
    </RisoCard>
  )
}

/* -------------------------------------------------------------------------- */
/*  Zone sensible : déconnexion + quitter l'espace                            */
/* -------------------------------------------------------------------------- */

export function DangerZone() {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | undefined>()

  function leave() {
    setError(undefined)
    startTransition(async () => {
      await clearOfflineData()
      // Succès → la Server Action redirige (pas de retour). On ne gère ici
      // qu'un éventuel échec renvoyé sans redirection.
      const result = await leaveCouple()
      if (result && !result.ok) setError(result.error)
    })
  }

  async function signOutAndClear() {
    await clearOfflineData()
    await signOut()
  }

  return (
    <RisoCard shadow="ink" padding="lg">
      <h2 className="mb-4 font-display text-lg uppercase text-ink">Compte</h2>

      <div className="flex flex-col gap-3">
        {/* Déconnexion : Server Action via <form> (progressive enhancement). */}
        <form action={signOutAndClear} className="contents">
          <RisoButton
            type="submit"
            variant="secondary"
            className="h-12 w-full text-sm"
          >
            Se déconnecter
          </RisoButton>
        </form>

        {!confirming ? (
          <RisoButton
            variant="ghost"
            className="h-12 w-full border-brique text-sm text-brique"
            onClick={() => setConfirming(true)}
          >
            Quitter l&apos;espace couple
          </RisoButton>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-[10px] border-2 border-brique bg-brique/5 p-3">
            <p className="text-[13px] leading-snug text-ink">
              Tu vas quitter l&apos;espace couple. Tu perdras l&apos;accès aux
              listes et rayons partagés (ils restent pour ton/ta partenaire). Tu
              devras recréer ou rejoindre un espace ensuite.
            </p>
            <div className="flex gap-2">
              <RisoButton
                variant="primary"
                className="h-11 flex-1 text-sm"
                disabled={isPending}
                onClick={leave}
              >
                {isPending ? "Sortie…" : "Oui, quitter"}
              </RisoButton>
              <RisoButton
                variant="secondary"
                className="h-11 flex-1 text-sm"
                disabled={isPending}
                onClick={() => setConfirming(false)}
              >
                Annuler
              </RisoButton>
            </div>
            {error && (
              <p role="alert" className="text-[12px] font-medium text-brique">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </RisoCard>
  )
}
