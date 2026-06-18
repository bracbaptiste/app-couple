import type { Metadata, Viewport } from "next";
import { Silkscreen, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import { ServiceWorkerRegister } from "@/components/shared/service-worker-register";

import "./globals.css";

// Display — titres, noms de listes, compteurs (police bitmap tamponnée)
const silkscreen = Silkscreen({
  variable: "--font-silkscreen",
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
});

// UI & corps — sans serif moderne très lisible sur mobile
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

// Mono — usages techniques ponctuels (compteurs de catégorie, etc.)
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "App Couple",
  title: {
    default: "App Couple",
    template: "%s · App Couple",
  },
  description:
    "Le cerveau partagé du couple — listes de courses partagées en temps réel.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "App Couple",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F0E5D0",
  width: "device-width",
  initialScale: 1,
  // Zoom utilisateur laissé libre (accessibilité). L'anti-zoom auto au focus
  // sur iOS est assuré par les champs en text-base (16px), pas par maximumScale.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${silkscreen.variable} ${hanken.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
