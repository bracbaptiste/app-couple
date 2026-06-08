/*
 * Service Worker — App Couple
 *
 * Rôle (couche PWA) : rendre l'app installable + mettre en cache les ASSETS
 * STATIQUES de l'app shell pour un démarrage rapide et résilient.
 *
 * ⚠️ Périmètre volontairement étroit :
 *   - On ne met JAMAIS en cache les requêtes Supabase (autre origine → exclues
 *     d'office par le test same-origin) ni les navigations HTML / données Next :
 *     on ne veut pas servir de données métier périmées.
 *   - La logique offline métier (cache des listes + file de mutations,
 *     cf. src/lib/offline/*) reste gérée par la couche applicative, pas ici.
 *
 * Stratégie : cache-first pour les assets immuables (/_next/static, /icons,
 * polices, manifest), réseau pass-through pour tout le reste.
 */

const CACHE = "app-couple-static-v1";

// Préfixes / fichiers same-origin considérés comme assets statiques cachables.
const STATIC_PATHS = ["/_next/static/", "/icons/"];
const STATIC_FILES = ["/manifest.json"];
const STATIC_EXT = /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico)$/i;

function isStaticAsset(url) {
  if (STATIC_FILES.includes(url.pathname)) return true;
  if (STATIC_PATHS.some((p) => url.pathname.startsWith(p))) return true;
  return STATIC_EXT.test(url.pathname);
}

self.addEventListener("install", () => {
  // Activation immédiate de la nouvelle version.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des anciens caches statiques (versions précédentes).
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("app-couple-static-") && k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // On ne touche qu'aux GET same-origin sur des assets statiques.
  // Tout le reste (Supabase, navigations, POST/mutations) passe au réseau.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (!isStaticAsset(url)) return;

  // Cache-first : asset immuable → on sert le cache, sinon on récupère et stocke.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        // Hors ligne et pas en cache : on laisse l'erreur réseau remonter.
        throw err;
      }
    })(),
  );
});
