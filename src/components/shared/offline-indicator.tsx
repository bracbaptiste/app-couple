"use client"

import { useRouter } from "next/navigation"
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { useOnlineStatus } from "@/lib/offline/use-online-status"
import { pendingCount, replayQueue } from "@/lib/offline/mutation-queue"

/**
 * Indicateur discret « hors ligne » + pilote du rejeu — App Couple, V1.
 *
 * RESPONSABILITÉS (volontairement centralisées ici, dans le layout, pour être
 * actives quel que soit l'écran ouvert) :
 *   1. afficher un bandeau discret quand on est hors ligne, avec le nombre de
 *      modifications en attente de synchro ;
 *   2. au RETOUR du réseau, rejouer la file (`replayQueue`) puis rafraîchir la
 *      page (`router.refresh()`) pour réaligner l'UI sur le serveur ;
 *   3. signaler brièvement le résultat (synchro OK / certaines en échec).
 *
 * Discrétion : rien n'est rendu quand on est en ligne et qu'il n'y a ni synchro
 * en cours ni erreur récente — l'indicateur ne s'invite que lorsqu'il a quelque
 * chose à dire. Il ne bloque jamais l'interface (bandeau non modal).
 */

type SyncState =
  | { phase: "idle" }
  | { phase: "syncing" }
  | { phase: "error"; failed: number }

export function OfflineIndicator() {
  const online = useOnlineStatus()
  const router = useRouter()

  const [pending, setPending] = useState(0)
  const [sync, setSync] = useState<SyncState>({ phase: "idle" })

  // État précédent du réseau, pour ne déclencher le rejeu que sur le FRONT
  // montant (hors ligne → en ligne), pas à chaque rendu.
  const wasOnline = useRef(true)

  // Rafraîchit le compteur « en attente » à intervalle léger tant qu'il y a des
  // mutations en file ou qu'on est hors ligne (le badge reste juste après un
  // ajout offline). Peu coûteux : une lecture IndexedDB locale.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      const n = await pendingCount()
      if (alive) setPending(n)
    }
    void tick()
    const id = window.setInterval(tick, 2000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [online, sync])

  const flush = useCallback(async () => {
    const before = await pendingCount()
    if (before === 0) return

    setSync({ phase: "syncing" })
    const result = await replayQueue()
    setPending(await pendingCount())

    if (result.failed > 0) {
      setSync({ phase: "error", failed: result.failed })
    } else {
      setSync({ phase: "idle" })
    }
    // Réaligne l'UI sur le serveur : les Server Actions rejouées ont déjà
    // revalidé leurs chemins, `refresh()` rapatrie les données fraîches.
    router.refresh()
  }, [router])

  // Rejeu au retour du réseau (front montant hors ligne → en ligne).
  useEffect(() => {
    if (online && !wasOnline.current) {
      void flush()
    }
    wasOnline.current = online
  }, [online, flush])

  // Rien à dire → on ne rend rien (discrétion totale en ligne).
  const showOffline = !online
  const showSyncing = sync.phase === "syncing"
  const showError = sync.phase === "error"
  if (!showOffline && !showSyncing && !showError) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-40 flex items-center justify-center gap-2 border-b-2 border-ink px-3 py-1.5 text-center font-mono text-[11px] font-bold",
        showOffline && "bg-paper-light text-ink-soft",
        showSyncing && "bg-sauge text-ink",
        showError && "bg-brique/15 text-ink",
      )}
    >
      {showOffline && (
        <>
          <CloudOff className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
          <span>
            Hors ligne
            {pending > 0 && ` · ${pending} modif. en attente`}
          </span>
        </>
      )}
      {showSyncing && (
        <>
          <RefreshCw
            className="size-3.5 shrink-0 animate-spin"
            strokeWidth={2.5}
            aria-hidden
          />
          <span>Synchronisation…</span>
        </>
      )}
      {showError && (
        <>
          <TriangleAlert
            className="size-3.5 shrink-0"
            strokeWidth={2.5}
            aria-hidden
          />
          <span>
            {sync.failed} modif. non synchronisée
            {sync.failed > 1 ? "s" : ""} — réessaie plus tard
          </span>
        </>
      )}
    </div>
  )
}
