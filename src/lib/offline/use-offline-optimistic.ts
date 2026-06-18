"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react"

import { useOnlineStatus } from "@/lib/offline/use-online-status"

/**
 * useOfflineOptimistic — feedback immédiat des mutations de liste, résilient
 * hors ligne. Mutualise la mécanique partagée par l'écran courses et l'écran
 * to-do (auparavant copiée dans les deux).
 *
 * Deux couches superposées sur la donnée serveur :
 *   1. `useOptimistic` : applique l'action en vol, PUIS revient à la donnée
 *      serveur en fin de transition (succès → `revalidatePath` l'a déjà mise à
 *      jour, aucun saut ; échec → rollback visuel automatique) ;
 *   2. overlay HORS LIGNE persistant : hors réseau le serveur ne revalide rien,
 *      donc sans cet overlay la valeur optimiste « rebondirait » à l'état
 *      serveur dès la fin de la transition. On accumule les actions faites sans
 *      réseau et on les rejoue sur l'affichage. Au retour du réseau, le rejeu de
 *      la file de mutations + `router.refresh()` (OfflineIndicator) ramène la
 *      vérité serveur : on vide alors l'overlay.
 *
 * `apply(action)` DOIT être appelée à l'intérieur de `startAction` (contrainte
 * de `useOptimistic`), juste avant de lancer la Server Action via `runMutation`.
 *
 * @param base   donnée serveur courante (déjà à jour via revalidatePath).
 * @param reduce réducteur pur appliquant une action à l'état (identité stable :
 *               le déclarer au niveau module).
 */
export function useOfflineOptimistic<TItem, TAction>(
  base: TItem[],
  reduce: (state: TItem[], action: TAction) => TItem[],
): {
  /** État à afficher = serveur + optimiste en vol + patches hors ligne. */
  display: TItem[]
  /** Une mutation est en cours (pour désactiver les entrées pendant le vol). */
  isPending: boolean
  /** Enveloppe de transition : y exécuter `apply` puis `runMutation`. */
  startAction: (scope: () => void | Promise<void>) => void
  /** Applique l'action en optimiste, et la mémorise si l'on est hors ligne. */
  apply: (action: TAction) => void
} {
  const online = useOnlineStatus()
  const [optimistic, applyOptimistic] = useOptimistic(base, reduce)
  const [isPending, startAction] = useTransition()

  const [offlinePatches, setOfflinePatches] = useState<TAction[]>([])
  const wasOnline = useRef(true)
  useEffect(() => {
    if (online && !wasOnline.current) setOfflinePatches([])
    wasOnline.current = online
  }, [online])

  const display = useMemo(
    () => offlinePatches.reduce(reduce, optimistic),
    [optimistic, offlinePatches, reduce],
  )

  const apply = useCallback(
    (action: TAction) => {
      applyOptimistic(action)
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setOfflinePatches((prev) => [...prev, action])
      }
    },
    [applyOptimistic],
  )

  return { display, isPending, startAction, apply }
}
