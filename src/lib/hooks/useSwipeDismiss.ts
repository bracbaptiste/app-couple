"use client"

import { useRef, useState } from "react"
import type React from "react"

/**
 * useSwipeDismiss — geste « glisser vers le bas pour fermer » d'une feuille qui
 * monte du bas (bottom sheet), en Pointer Events sans librairie. Pendant à
 * `useSwipeReveal` (glisser horizontal) mais pour l'axe vertical descendant.
 *
 * La feuille suit le doigt vers le bas (`offset` ≥ 0). Au relâchement, si on a
 * dépassé `threshold`, on appelle `onDismiss` (fermeture) ; sinon elle revient
 * franchement à sa place (snap-back animé).
 *
 * Points subtils :
 *   - on n'engage le glissement que pour un mouvement clairement vertical ET
 *     descendant (sinon on laisse passer le scroll / la sélection) ;
 *   - on ne démarre pas un glissement depuis un champ ou un contrôle (saisie,
 *     bouton, lien) : l'utilisateur doit pouvoir taper et cocher normalement ;
 *   - on ne capture le pointeur qu'au démarrage d'un vrai glissement, pour ne
 *     pas voler les taps.
 */
type UseSwipeDismissOptions = {
  /** Appelée quand le glissement franchit le seuil (ferme la feuille). */
  onDismiss: () => void
  /** Distance (px) au-delà de laquelle on ferme au relâchement. Défaut: 90. */
  threshold?: number
  /** Geste actif ? Défaut: vrai. */
  enabled?: boolean
}

type UseSwipeDismissResult = {
  /** Translation verticale courante (≥ 0). À appliquer en `translateY`. */
  offset: number
  /** Vrai pendant un glissement actif (couper la transition CSS). */
  dragging: boolean
  /** Vrai pendant le retour animé à sa place (garde le `translateY` rendu). */
  releasing: boolean
  /** À brancher sur `onTransitionEnd` de la feuille pour solder le snap-back. */
  onTransitionEnd: () => void
  /** Handlers à étaler sur la feuille. */
  swipeHandlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
}

export function useSwipeDismiss({
  onDismiss,
  threshold = 90,
  enabled = true,
}: UseSwipeDismissOptions): UseSwipeDismissResult {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [releasing, setReleasing] = useState(false)
  // Un pointeur est posé (pas encore forcément un glissement).
  const pointerActive = useRef(false)
  const startY = useRef(0)
  const startX = useRef(0)
  const didDrag = useRef(false)
  // Offset courant en ref : la décision de fermeture au relâchement le lit ici,
  // pas depuis la closure de state (Base UI peut figer le handler avec un offset
  // périmé → la feuille ne se fermerait jamais).
  const offsetRef = useRef(0)

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled) return
    // Pas de glissement depuis un champ / contrôle : on laisse taper et cocher.
    if (
      (e.target as HTMLElement).closest(
        "input, textarea, select, button, a, [role='button']",
      )
    ) {
      return
    }
    pointerActive.current = true
    startY.current = e.clientY
    startX.current = e.clientX
    didDrag.current = false
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointerActive.current) return
    const dy = e.clientY - startY.current
    const dx = e.clientX - startX.current
    if (!didDrag.current) {
      // Sous le seuil de 6px : peut-être un simple tap, on attend.
      if (Math.abs(dy) <= 6 && Math.abs(dx) <= 6) return
      // Mouvement vers le haut ou plutôt horizontal : ce n'est pas un dismiss,
      // on abandonne ce pointeur (laisse passer scroll / sélection).
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
        pointerActive.current = false
        return
      }
      didDrag.current = true
      setReleasing(false)
      setDragging(true)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Capture refusée (rare) : le drag marche tant que le pointeur reste là.
      }
    }
    const next = Math.max(0, dy)
    offsetRef.current = next
    setOffset(next)
  }

  function onPointerEnd() {
    if (!pointerActive.current) return
    pointerActive.current = false
    if (!didDrag.current) return // simple tap : rien à faire
    setDragging(false)
    const crossed = offsetRef.current > threshold
    offsetRef.current = 0
    if (crossed) {
      // Franchi : on ferme. L'animation de sortie du Dialog reprend la main.
      setOffset(0)
      onDismiss()
    } else {
      // Pas assez loin : retour animé à sa place (translateY 0 + transition CSS).
      setReleasing(true)
      setOffset(0)
    }
  }

  function onTransitionEnd() {
    // Fin du snap-back : on rend la main à l'animation d'ouverture/fermeture.
    if (releasing) setReleasing(false)
  }

  return {
    offset,
    dragging,
    releasing,
    onTransitionEnd,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  }
}
