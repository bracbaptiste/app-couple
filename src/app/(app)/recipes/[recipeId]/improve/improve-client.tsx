"use client"

import { useRouter } from "next/navigation"
import { Sparkles, Check, ArrowLeft } from "lucide-react"
import { useState } from "react"
import Link from "next/link"

import { RisoButton } from "@/components/ui/riso-button"
import { FormFeedback } from "@/app/(auth)/form-ui"
import { type RecetteExtraite } from "@/lib/recipes/extraction"

import { ReviewForm } from "../../new/review-form"

/**
 * Flux « Améliorer une recette avec l'IA » (PRD_recettes §9.1 — entrée
 * « améliorer »), mode créatif séparé du mode « Préserver ». La recette de
 * référence est RELUE EN BASE côté serveur (route §9.2) ; ici on ne transmet que
 * son `id` et une consigne libre optionnelle.
 *
 *   consigne → traitement (Opus 4.8) → relecture → terminé
 *
 * Décision produit : l'amélioration crée une NOUVELLE recette (`source = 'ia'`),
 * l'originale reste intacte — non destructif. C'est l'écran de relecture (§7.5)
 * + `createRecipe` qui réalisent l'enregistrement, comme pour la Phase 1.
 */

type Phase =
  | { name: "consigne" }
  | { name: "traitement" }
  | { name: "relecture"; recette: RecetteExtraite; suggestions: string[] }
  | { name: "termine" }

/** Pistes d'amélioration cliquables. */
const EXEMPLES = [
  "rends ce plat plus intéressant",
  "version plus légère",
  "version plus gourmande",
  "rends-le végétarien",
]

async function ameliorerRecette(
  recipeId: string,
  demande: string,
): Promise<{ recette: RecetteExtraite; suggestions: string[] }> {
  const res = await fetch("/api/recipes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "improve", recipeId, demande }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error ?? `Erreur HTTP ${res.status}`)
  }
  return data as { recette: RecetteExtraite; suggestions: string[] }
}

export function ImproveClient({
  recipeId,
  titreOriginal,
}: {
  recipeId: string
  titreOriginal: string
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ name: "consigne" })
  const [demande, setDemande] = useState("")
  const [erreur, setErreur] = useState<string | undefined>()

  async function lancer() {
    setErreur(undefined)
    setPhase({ name: "traitement" })
    try {
      const { recette, suggestions } = await ameliorerRecette(
        recipeId,
        demande.trim(),
      )
      setPhase({ name: "relecture", recette, suggestions })
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "L’amélioration a échoué. Réessaie.",
      )
      setPhase({ name: "consigne" })
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
          onCancel={() => setPhase({ name: "consigne" })}
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
          Nouvelle version enregistrée
        </h1>
        <p className="text-[13px] text-ink-soft">
          La version améliorée est rangée dans ton carnet. L’originale est
          conservée.
        </p>
        <div className="flex w-full flex-col gap-2">
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
            Amélioration en cours…
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            L’IA revisite ta recette. Quelques secondes.
          </p>
        </div>
      </section>
    )
  }

  // --- Phase : consigne libre (§9.1) --------------------------------------
  return (
    <section className="mx-auto w-full max-w-sm">
      <Link
        href={`/recipes/${recipeId}`}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
      >
        <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
        Retour à la recette
      </Link>

      <h1 className="mb-1 mt-1 font-display text-xl uppercase leading-tight text-ink">
        Améliorer avec l’IA
      </h1>
      <p className="mb-5 text-[13px] leading-snug text-ink-soft">
        À partir de «&nbsp;{titreOriginal}&nbsp;». Dis comment l’améliorer, ou
        laisse vide pour laisser l’IA proposer. La version améliorée sera
        enregistrée comme une nouvelle recette — l’originale reste intacte.
      </p>

      <textarea
        value={demande}
        onChange={(e) => setDemande(e.target.value)}
        placeholder="Ex. version plus healthy, ajoute une touche de fraîcheur…"
        aria-label="Comment améliorer cette recette"
        rows={4}
        maxLength={2000}
        className="w-full resize-y rounded-[10px] border-2 border-ink bg-paper-light px-3 py-2.5 text-base text-ink outline-none focus-visible:shadow-riso-sauge"
      />

      <div className="mt-3 flex flex-col gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Pistes
        </span>
        <div className="flex flex-wrap gap-2">
          {EXEMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setDemande(ex)}
              className="rounded-[8px] border-2 border-dashed border-ink bg-paper px-3 py-2 text-[13px] font-medium text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <RisoButton onClick={lancer} className="mt-5 h-12 w-full text-sm">
        <Sparkles aria-hidden /> Améliorer la recette
      </RisoButton>

      {erreur && (
        <div className="mt-5">
          <FormFeedback error={erreur} />
        </div>
      )}
    </section>
  )
}
