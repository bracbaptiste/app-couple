"use client"

import { useRef, useState } from "react"
import type React from "react"

/**
 * useSwipeReveal — geste « glisser pour révéler des actions » (Pointer Events,
 * sans librairie), partagé par toutes les rangées swipables de l'appli (tuiles
 * de liste, articles de courses, bibliothèque, tâches).
 *
 * La rangée au premier plan se translate vers la gauche de `offset` (≤ 0) pour
 * découvrir un calque d'actions placé dessous. Le geste est utilisable au doigt,
 * au stylet ET à la souris (cliquer-glisser sur desktop).
 *
 * Points subtils centralisés ici (auparavant copiés dans 4 fichiers) :
 *   - on NE capture PAS le pointeur au `pointerdown` : capturer trop tôt
 *     retargette le `click` final sur la div et vole les taps (case à cocher,
 *     lien). La capture n'a lieu qu'au démarrage d'un vrai glissement ;
 *   - un seuil de 5px distingue le tap du glissement ;
 *   - `didDrag` (exposé) sert à AVALER le `click` émis en fin de glissement,
 *     côté appelant via `onClickCapture`.
 */
type UseSwipeRevealOptions = {
  /** Largeur révélée (px) : borne de translation et seuil de snap. */
  revealWidth: number
  /** Geste actif ? (ex. désengagé en mode édition / confirmation). Défaut: vrai. */
  enabled?: boolean
  /** Appelé quand un pointeur s'engage (ex. couper une animation d'indice). */
  onEngage?: () => void
}

type UseSwipeRevealResult = {
  /** Translation courante (≤ 0). À appliquer en `translateX`. */
  offset: number
  /** Pose directement l'offset (indice de peek, ouverture au focus clavier…). */
  setOffset: React.Dispatch<React.SetStateAction<number>>
  /** Vrai pendant un glissement actif (couper la transition CSS). */
  dragging: boolean
  /** Vrai juste après un glissement : à tester dans `onClickCapture`. */
  didDragRef: React.MutableRefObject<boolean>
  /** Referme la rangée (offset = 0). */
  close: () => void
  /** Ouvre franchement la rangée (offset = -revealWidth). */
  open: () => void
  /** Handlers à étaler sur la rangée au premier plan. */
  swipeHandlers: {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: () => void
    onPointerCancel: () => void
  }
}

export function useSwipeReveal({
  revealWidth,
  enabled = true,
  onEngage,
}: UseSwipeRevealOptions): UseSwipeRevealResult {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Un pointeur est posé (pas encore forcément un glissement).
  const pointerActive = useRef(false)
  const dragStartX = useRef(0)
  const dragStartOffset = useRef(0)
  const didDrag = useRef(false)

  function close() {
    setOffset(0)
  }

  function open() {
    setOffset(-revealWidth)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!enabled) return
    onEngage?.()
    pointerActive.current = true
    dragStartX.current = e.clientX
    dragStartOffset.current = offset
    didDrag.current = false
    // Pas de setPointerCapture ici (cf. doc du hook) : seulement au vrai drag.
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointerActive.current) return
    const dx = e.clientX - dragStartX.current
    if (!didDrag.current) {
      if (Math.abs(dx) <= 5) return // sous le seuil : peut-être un simple tap
      didDrag.current = true
      setDragging(true)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Capture refusée (rare) : le drag marche tant que le pointeur reste là.
      }
    }
    setOffset(Math.max(-revealWidth, Math.min(0, dragStartOffset.current + dx)))
  }

  function onPointerEnd() {
    if (!pointerActive.current) return
    pointerActive.current = false
    if (!didDrag.current) return // simple tap : rien à snapper
    setDragging(false)
    // Snap : au-delà de la moitié on ouvre franchement, sinon on referme.
    setOffset((o) => (o < -revealWidth / 2 ? -revealWidth : 0))
  }

  return {
    offset,
    setOffset,
    dragging,
    didDragRef: didDrag,
    close,
    open,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  }
}
