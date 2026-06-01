/*
 * Service Worker — App Couple
 *
 * Socle minimal de la V1 (étape Setup) : rend la PWA installable et fournit
 * un point d'ancrage pour la stratégie hors ligne.
 *
 * ⚠️ La logique offline complète (cache des listes + file d'attente des
 * mutations, cf. docs/ARCHITECTURE.md §6) sera ajoutée à l'étape dédiée.
 * Pour l'instant : pass-through réseau, sans cache.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Pass-through : on laisse le navigateur gérer la requête normalement.
  // (Un handler fetch présent est requis pour l'installabilité de la PWA.)
});
