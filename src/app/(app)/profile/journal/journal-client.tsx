"use client"

import Link from "next/link"
import { ArrowLeft, Loader2, Undo2 } from "lucide-react"
import { useState, useTransition } from "react"

import { cn } from "@/lib/utils"
import { useRealtimeBrainJournal } from "@/lib/realtime"
import { undoBrainCommand, type JournalTicket } from "@/lib/brain/journal"

/**
 * BrainJournalView — le ticket de caisse du Cerveau (PRD_V4 §7).
 *
 * Rendu « imprimé » : bord perforé (masque CSS `.brain-ticket`), en-têtes
 * Silkscreen (`font-display`) + corps monospace, chaque commande « s'imprime »
 * (translation verticale `.ticket-print-in`, décoratif → neutralisé sous
 * `prefers-reduced-motion`). Une commande encore réversible porte ANNULER ; une
 * commande annulée est rayée d'un trait d'encre.
 *
 * Realtime (§7) : `useRealtimeBrainJournal` rafraîchit la page serveur à chaque
 * nouvelle ligne / annulation du partenaire — sans rechargement.
 */

/** Horodatage court fr-FR, ex. « 4 juil. · 14:32 ». */
const stampFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
})

function formatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  // Sépare la date de l'heure par «·» (le formateur met déjà « à »).
  return stampFormatter.format(d).replace(", ", " · ").replace(" à ", " · ")
}

type Props = {
  tickets: JournalTicket[]
  coupleId: string
}

export function BrainJournalView({ tickets, coupleId }: Props) {
  useRealtimeBrainJournal(coupleId)

  return (
    <section className="mx-auto w-full max-w-sm">
      <div className="mb-4">
        <Link
          href="/profile"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Profil
        </Link>
        <h1 className="mt-1 font-display text-xl uppercase text-ink">
          Journal du Cerveau
        </h1>
        <p className="mt-1 text-[13px] leading-snug text-ink-soft">
          Chaque commande dictée au Cerveau, annulable ligne par ligne.
        </p>
      </div>

      {tickets.length === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Aucune commande pour l’instant. Parle au Cerveau (appui long) : « Ajoute
          le lait à la liste Auchan » — tu retrouveras chaque commande ici.
        </p>
      ) : (
        // Le ticket : un seul rouleau perforé, chaque commande = un feuillet.
        <div className="brain-ticket px-4 py-3">
          <TicketHeader />
          <ul className="flex flex-col">
            {tickets.map((t) => (
              <TicketLine key={t.id} ticket={t} />
            ))}
          </ul>
          <TicketFooter count={tickets.length} />
        </div>
      )}
    </section>
  )
}

/** En-tête « caisse » du rouleau (Silkscreen + double filet). */
function TicketHeader() {
  return (
    <div className="mb-1 border-b-2 border-dashed border-ink pb-2 text-center">
      <p className="font-display text-[13px] uppercase leading-none text-ink">
        Le Cerveau
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
        Ticket de commandes
      </p>
    </div>
  )
}

/** Pied de rouleau : total + « merci » façon ticket. */
function TicketFooter({ count }: { count: number }) {
  return (
    <div className="mt-1 border-t-2 border-dashed border-ink pt-2 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft">
        {count} commande{count > 1 ? "s" : ""} · le cerveau partagé
      </p>
    </div>
  )
}

/** Une commande = un feuillet du ticket (§7 : horodatage, auteur, phrase, actions, statut). */
function TicketLine({ ticket }: { ticket: JournalTicket }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const annule = ticket.statut === "annule"

  function annuler() {
    setError(null)
    startTransition(async () => {
      const res = await undoBrainCommand(ticket.id)
      // Succès → Realtime/refresh raye la ligne. Échec (déjà annulé…) → message.
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <li className="ticket-print-in border-b border-dashed border-ink-soft py-3 last:border-b-0">
      {/* Ligne d'en-tête : auteur + horodatage. */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "inline-block size-2.5 rounded-full border border-ink",
              ticket.auteurColor === "sauge" ? "bg-sauge" : "bg-brique",
            )}
          />
          <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink">
            {ticket.auteurNom}
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
          {formatStamp(ticket.createdAt)}
        </span>
      </div>

      {/* Corps rayé d'un trait d'encre quand la commande est annulée (§7). */}
      <div className={cn("relative mt-1.5", annule && "brain-ticket-struck")}>
        {/* La phrase dictée. */}
        <p className="font-mono text-[13px] italic leading-snug text-ink">
          « {ticket.texteDicte} »
        </p>

        {/* Le détail des actions, groupé. */}
        {ticket.groups.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {ticket.groups.map((g, gi) => (
              <div key={gi}>
                {g.label && (
                  <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
                    {g.label}
                  </p>
                )}
                <ul className="flex flex-col">
                  {g.lignes.map((l, li) => (
                    <li
                      key={li}
                      className="flex items-baseline justify-between gap-3 font-mono text-[12px] text-ink"
                    >
                      <span className="min-w-0">{l.nom}</span>
                      <span className="shrink-0 text-ink-soft">{l.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Statut / action. */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {annule ? (
          <span className="inline-flex -rotate-2 items-center rounded-[4px] border-2 border-ink-soft px-1.5 py-0.5 font-display text-[10px] uppercase leading-none text-ink-soft">
            Annulé
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-wide text-sauge">
            Fait
          </span>
        )}

        {ticket.annulable && !annule && (
          <button
            type="button"
            onClick={annuler}
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[8px] border-2 border-ink bg-paper-light px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink shadow-riso-brique outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-60"
          >
            {pending ? (
              <Loader2
                className="size-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
            ) : (
              <Undo2 className="size-3.5" strokeWidth={2.5} aria-hidden />
            )}
            Annuler
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 font-mono text-[11px] text-brique">
          {error}
        </p>
      )}
    </li>
  )
}
