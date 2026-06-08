"use client"

import { useEffect } from "react"

import { cacheGet, cachePut, type CacheKey } from "./db"

/**
 * Cache de lecture — App Couple, mode hors ligne V1.
 *
 * `useOfflineCache(key, data)` écrit dans IndexedDB la dernière copie connue des
 * données d'un écran à chaque fois qu'elles changent (donc à chaque chargement
 * EN LIGNE, le serveur étant la source). C'est l'unique chemin d'écriture du
 * cache : on enregistre exactement ce que l'écran affiche, sans logique de fetch
 * dupliquée.
 *
 * PORTÉE / LIMITE V1 (importante) :
 *   Next.js rend les écrans via des Server Components ; une navigation ou un
 *   rechargement HORS LIGNE échoue donc AU NIVEAU DU FRAMEWORK (le payload RSC
 *   ne peut pas être fetché) AVANT que ce cache ne puisse servir. Sans Service
 *   Worker, ce cache ne « ressuscite » donc pas une page rechargée sans réseau.
 *
 *   Ce qui marche en V1 : l'écran DÉJÀ OUVERT reste pleinement utilisable hors
 *   ligne (ses données sont en mémoire React) — on peut consulter, cocher,
 *   ajouter ; les mutations partent en file. Le cache IndexedDB est la
 *   FONDATION (données prêtes) pour un futur Service Worker qui servira aussi
 *   les rechargements/navigations hors ligne. `readCache` est exposé pour ce
 *   futur usage et le debug.
 */
export function useOfflineCache<T>(key: CacheKey, data: T): void {
  useEffect(() => {
    // Best-effort : `cachePut` avale ses propres erreurs.
    void cachePut(key, data)
  }, [key, data])
}

/** Lit la dernière copie cachée d'un écran (ou `null`). Pour usage futur / debug. */
export async function readCache<T>(key: CacheKey): Promise<T | null> {
  const entry = await cacheGet<T>(key)
  return entry?.data ?? null
}
