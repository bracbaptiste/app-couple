"use client"

import { useSyncExternalStore } from "react"

/**
 * État réseau du navigateur — App Couple, mode hors ligne V1.
 *
 * S'appuie sur `navigator.onLine` + les évènements `online` / `offline`, via
 * `useSyncExternalStore` (pas de `setState` dans un effet : on s'abonne au store
 * externe « réseau »). Le snapshot serveur vaut `true` : on suppose connecté
 * côté SSR pour ne jamais flasher « hors ligne » au premier paint.
 *
 * LIMITE : `navigator.onLine` ne détecte que l'état de l'interface réseau, pas
 * la joignabilité réelle du serveur (Wi-Fi capté mais sans Internet = signalé
 * « en ligne »). Les mutations gèrent ce cas en repli (cf. `runMutation`), qui
 * enfile l'action si l'appel réseau échoue malgré un `onLine === true`.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback)
  window.addEventListener("offline", callback)
  return () => {
    window.removeEventListener("online", callback)
    window.removeEventListener("offline", callback)
  }
}

/** Snapshot client : l'état réel de l'interface réseau. */
function getSnapshot(): boolean {
  return navigator.onLine
}

/** Snapshot serveur : on suppose connecté (pas de `navigator` en SSR). */
function getServerSnapshot(): boolean {
  return true
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
