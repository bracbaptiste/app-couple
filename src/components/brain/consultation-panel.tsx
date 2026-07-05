"use client"

import { Loader2, X, ShoppingCart, Utensils, ListChecks } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import {
  lireConsultation,
  type ConsultationPanel,
} from "@/lib/brain/consultation"
import { type ConsultationCible } from "@/lib/brain/command-parsing"

/**
 * Panneau « ticket » d'une CONSULTATION VOCALE (PRD_V4 §2.4, §10.6). Réponse À
 * L'ÉCRAN uniquement : aucune écriture, aucune synthèse vocale (TTS écarté en V4).
 * Monté par le Cerveau après un intent `consultation.lire` : il appelle l'action
 * LECTURE SEULE {@link lireConsultation} et imprime le résultat comme un ticket.
 */
export function ConsultationPanel({
  cible,
  onClose,
}: {
  cible: ConsultationCible
  onClose: () => void
}) {
  const [panel, setPanel] = useState<ConsultationPanel | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  // Le composant est monté à neuf pour chaque consultation (jamais réutilisé pour
  // une autre cible) : l'état initial `loading = true` suffit, pas de reset ici.
  useEffect(() => {
    let vivant = true
    lireConsultation(cible)
      .then((res) => {
        if (!vivant) return
        if (res.ok) setPanel(res.panel)
        else setError(res.error)
      })
      .catch(() => vivant && setError("Lecture impossible. Réessaie."))
      .finally(() => vivant && setLoading(false))
    return () => {
      vivant = false
    }
  }, [cible])

  if (typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Consultation"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative w-full max-w-sm rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-base uppercase leading-none text-ink">
            {panel ? titreEntete(panel) : "Le cerveau regarde…"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
          >
            <X className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        {loading && (
          <div
            className="flex items-center gap-2 py-6 text-ink-soft"
            aria-live="polite"
          >
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            <span className="font-mono text-[12px] uppercase tracking-wide">
              Lecture…
            </span>
          </div>
        )}

        {!loading && error && (
          <p
            role="alert"
            className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[13px] font-medium leading-snug text-ink"
          >
            {error}
          </p>
        )}

        {!loading && panel && (
          <>
            {/* Sous-titre = la cible lue (nom de liste / jour). */}
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              {panel.titre}
            </p>
            {/* Ticket imprimé : bord perforé + lignes monospaces (§7 esthétique). */}
            <div className="rounded-[10px] border-2 border-dashed border-ink bg-paper p-3">
              <TicketBody panel={panel} />
            </div>
          </>
        )}

        <div className="mt-3 flex justify-end">
          <RisoButton variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </RisoButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** En-tête selon la nature de la consultation. */
function titreEntete(panel: ConsultationPanel): string {
  switch (panel.type) {
    case "liste_courses":
      return "Reste à acheter"
    case "repas_jour":
      return "Au menu"
    case "taches_jour":
      return "À faire"
  }
}

/** Corps du ticket selon la cible (articles / repas / tâches). */
function TicketBody({ panel }: { panel: ConsultationPanel }) {
  if (panel.type === "liste_courses") {
    if (panel.articles.length === 0) {
      return (
        <p className="flex items-center gap-2 text-[13px] text-ink-soft">
          <ShoppingCart className="size-4" strokeWidth={2.5} aria-hidden />
          Tout est coché — rien à acheter.
        </p>
      )
    }
    return (
      <ul className="flex flex-col gap-1.5">
        {panel.articles.map((a, i) => (
          <li
            key={`${a.nom}-${i}`}
            className="flex items-baseline justify-between gap-3 text-[14px] text-ink"
          >
            <span className="min-w-0 font-medium">{a.nom}</span>
            {a.quantite && (
              <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                {a.quantite}
              </span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (panel.type === "repas_jour") {
    if (panel.repas.length === 0) {
      return (
        <p className="flex items-center gap-2 text-[13px] text-ink-soft">
          <Utensils className="size-4" strokeWidth={2.5} aria-hidden />
          Rien de planifié ce jour-là.
        </p>
      )
    }
    return (
      <ul className="flex flex-col gap-1.5">
        {panel.repas.map((r, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-[14px] text-ink">
            <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ink-soft">
              {r.creneau}
            </span>
            <span className="min-w-0 flex-1 text-right font-medium">{r.label}</span>
          </li>
        ))}
      </ul>
    )
  }

  // taches_jour
  if (panel.taches.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-ink-soft">
        <ListChecks className="size-4" strokeWidth={2.5} aria-hidden />
        Rien à faire ce jour-là.
      </p>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {panel.taches.map((t, i) => (
        <li
          key={`${t.titre}-${i}`}
          className={
            t.fait
              ? "text-[14px] text-ink-soft line-through"
              : "text-[14px] font-medium text-ink"
          }
        >
          {t.titre}
        </li>
      ))}
    </ul>
  )
}
