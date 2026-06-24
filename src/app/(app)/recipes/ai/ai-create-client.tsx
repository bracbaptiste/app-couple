"use client"

import { useRouter } from "next/navigation"
import { Sparkles, Check, ArrowLeft } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

import { RisoButton } from "@/components/ui/riso-button"
import { FormFeedback } from "@/app/(auth)/form-ui"
import { type RecetteExtraite } from "@/lib/recipes/extraction"

import { ReviewForm } from "../new/review-form"

/**
 * Flux « Créer une recette avec l'IA » (PRD_recettes §9.1 — entrée « créer »),
 * mode créatif séparé du mode « Préserver ». Machine à états calquée sur le flux
 * photo (`new-recipe-client.tsx`) :
 *
 *   demande → traitement (Opus 4.8) → relecture → terminé
 *
 * La recette générée atterrit dans le MÊME écran de relecture éditable (§7.5) et
 * s'enregistre avec `source = 'ia'` (§9.3). La clé API ne transite jamais ici :
 * la génération passe par la route serveur (§3).
 */

type Phase =
  | { name: "demande" }
  | { name: "traitement" }
  | {
      name: "relecture"
      recette: RecetteExtraite
      suggestions: string[]
    }
  | { name: "termine" }

/** Quelques amorces pour guider la saisie en langage naturel. */
const EXEMPLES = [
  "une entrée légère à base de courge, riche en protéines",
  "un dessert gourmand au chocolat sans gluten",
  "un plat végétarien rapide pour 2 avec ce qu'il reste : pois chiches, épinards",
]

async function genererRecette(
  demande: string,
): Promise<{ recette: RecetteExtraite; suggestions: string[] }> {
  const res = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "create", demande }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error ?? `Erreur HTTP ${res.status}`)
  }
  return data as { recette: RecetteExtraite; suggestions: string[] }
}

export function AiCreateClient() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ name: "demande" })
  const [demande, setDemande] = useState("")
  const [erreur, setErreur] = useState<string | undefined>()

  const peutGenerer = demande.trim().length > 0

  async function lancer() {
    if (!peutGenerer) return
    setErreur(undefined)
    setPhase({ name: "traitement" })
    try {
      const { recette, suggestions } = await genererRecette(demande.trim())
      setPhase({ name: "relecture", recette, suggestions })
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "La génération a échoué. Reformule ta demande.",
      )
      setPhase({ name: "demande" })
    }
  }

  // --- Phase : relecture éditable (§7.5), source IA -----------------------
  if (phase.name === "relecture") {
    return (
      <section className="mx-auto w-full max-w-sm">
        <ReviewForm
          recette={phase.recette}
          photoPreviewUrls={[]}
          source="ia"
          suggestions={phase.suggestions}
          onCancel={() => setPhase({ name: "demande" })}
          onSaved={() => setPhase({ name: "termine" })}
        />
      </section>
    )
  }

  // --- Phase : enregistrée -------------------------------------------------
  if (phase.name === "termine") {
    return (
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 pt-10 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full border-2 border-ink bg-sauge shadow-riso-ink-sm">
          <Check className="size-8 text-ink" strokeWidth={3} aria-hidden />
        </span>
        <h1 className="font-display text-xl uppercase text-ink">
          Recette enregistrée
        </h1>
        <p className="text-[13px] text-ink-soft">
          Elle est rangée dans ton carnet de recettes.
        </p>
        <div className="flex w-full flex-col gap-2">
          <RisoButton
            onClick={() => {
              setDemande("")
              setPhase({ name: "demande" })
            }}
            className="h-12 w-full text-sm"
          >
            Créer une autre recette
          </RisoButton>
          <RisoButton
            variant="secondary"
            onClick={() => router.push("/recipes")}
            className="h-12 w-full text-sm"
          >
            Mon carnet
          </RisoButton>
        </div>
      </section>
    )
  }

  // --- Phase : traitement (génération) ------------------------------------
  if (phase.name === "traitement") {
    return (
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 pt-16 text-center">
        <span
          className="size-12 animate-spin rounded-full border-[3px] border-ink border-t-transparent"
          aria-hidden
        />
        <div>
          <h1 className="font-display text-lg uppercase text-ink">
            Composition de la recette…
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            L’IA imagine ta recette. Quelques secondes.
          </p>
        </div>
      </section>
    )
  }

  // --- Phase : demande en langage naturel (§9.1) --------------------------
  return (
    <section className="mx-auto w-full max-w-sm">
      <Link
        href="/recipes"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
      >
        <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
        Recettes
      </Link>

      <h1 className="mb-1 mt-1 font-display text-xl uppercase text-ink">
        Créer avec l’IA
      </h1>
      <p className="mb-5 text-[13px] leading-snug text-ink-soft">
        Décris ce que tu veux cuisiner : envie, ingrédients sous la main,
        contrainte (léger, rapide, végétarien…). L’IA compose une recette
        complète que tu pourras relire et corriger avant de l’enregistrer.
      </p>

      <textarea
        value={demande}
        onChange={(e) => setDemande(e.target.value)}
        placeholder="Ex. une entrée légère à base de courge, riche en protéines…"
        aria-label="Décris la recette voulue"
        rows={5}
        maxLength={2000}
        className="w-full resize-y rounded-[10px] border-2 border-ink bg-paper-light px-3 py-2.5 text-base text-ink outline-none focus-visible:shadow-riso-sauge"
      />

      {/* Amorces cliquables */}
      <div className="mt-3 flex flex-col gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Quelques idées
        </span>
        <ul className="flex flex-col gap-2">
          {EXEMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => setDemande(ex)}
                className="w-full rounded-[8px] border-2 border-dashed border-ink bg-paper px-3 py-2 text-left text-[13px] leading-snug text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <RisoButton
        onClick={lancer}
        disabled={!peutGenerer}
        className="mt-5 h-12 w-full text-sm"
      >
        <Sparkles aria-hidden /> Générer la recette
      </RisoButton>

      {erreur && (
        <div className="mt-5">
          <FormFeedback error={erreur} />
        </div>
      )}
    </section>
  )
}
