"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker côté client (PWA installable).
 * Monté une fois dans le layout racine. Sans rendu visuel.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      process.env.NODE_ENV !== "production"
    ) {
      // En dev on évite le SW pour ne pas interférer avec le HMR.
      return;
    }

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Échec silencieux : l'app reste fonctionnelle sans le SW.
      });
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
