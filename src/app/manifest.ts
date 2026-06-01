import type { MetadataRoute } from "next";

/**
 * Manifest PWA — généré par Next (servi sur /manifest.webmanifest, lié
 * automatiquement dans le <head>). Couleurs issues du Design System Riso.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "App Couple — Listes de courses partagées",
    short_name: "App Couple",
    description:
      "Le cerveau partagé du couple : listes de courses partagées, en temps réel et hors ligne.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F0E5D0", // paper
    theme_color: "#F0E5D0", // paper
    lang: "fr",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
