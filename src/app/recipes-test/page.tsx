"use client"

import { useState } from "react"

/**
 * Page de test TEMPORAIRE (PRD_recettes §7, vérification Phase 1).
 *
 * Permet d'envoyer une photo de recette à la route `/api/recipes/extract` et de
 * voir le JSON structuré renvoyé. À SUPPRIMER une fois l'écran de relecture
 * (§7.5) en place — elle ne fait pas partie de l'UI finale.
 */
/** Formats que la vision Claude sait lire (cf. route serveur). */
const FORMATS_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export default function RecipesTestPage() {
  const [fichier, setFichier] = useState<File | null>(null)
  const [chargement, setChargement] = useState(false)
  const [json, setJson] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  // Format accepté ? (les photos iPhone HEIC, par ex., ne le sont pas.)
  const formatSupporte = fichier ? FORMATS_OK.includes(fichier.type) : false

  async function extraire() {
    if (!fichier) return
    setChargement(true)
    setJson(null)
    setErreur(null)
    try {
      const form = new FormData()
      form.append("image", fichier)
      const res = await fetch("/api/recipes/extract", {
        method: "POST",
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setErreur(data?.error ?? `Erreur HTTP ${res.status}`)
      } else {
        setJson(JSON.stringify(data, null, 2))
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur réseau.")
    } finally {
      setChargement(false)
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>
        Test extraction recette (temporaire)
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginTop: 4 }}>
        Envoie une photo de recette, l&apos;IA renvoie le JSON structuré (§7.3).
      </p>

      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            setFichier(e.target.files?.[0] ?? null)
            setErreur(null)
            setJson(null)
          }}
        />
        <button
          onClick={extraire}
          disabled={!fichier || !formatSupporte || chargement}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #ccc",
            cursor:
              !fichier || !formatSupporte || chargement
                ? "not-allowed"
                : "pointer",
          }}
        >
          {chargement ? "Extraction…" : "Extraire"}
        </button>
      </div>

      {/* Retour visuel : nom du fichier choisi + alerte si format non lisible. */}
      {fichier && (
        <p style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
          Fichier : <strong>{fichier.name}</strong> ({fichier.type || "type inconnu"})
        </p>
      )}
      {fichier && !formatSupporte && (
        <p style={{ marginTop: 4, fontSize: 13, color: "#b00020" }}>
          ⚠️ Ce format n&apos;est pas lisible par l&apos;IA (souvent une photo
          iPhone « HEIC »). Convertis-la en JPEG ou PNG, ou fais une capture
          d&apos;écran, puis réessaie.
        </p>
      )}
      {!fichier && (
        <p style={{ marginTop: 8, fontSize: 13, color: "#888" }}>
          Choisis d&apos;abord une photo (JPEG ou PNG) pour activer le bouton.
        </p>
      )}

      {erreur && (
        <p style={{ marginTop: 16, color: "#b00020" }}>⚠️ {erreur}</p>
      )}

      {json && (
        <pre
          style={{
            marginTop: 16,
            padding: 16,
            background: "#f6f6f6",
            borderRadius: 8,
            overflow: "auto",
            fontSize: 13,
          }}
        >
          {json}
        </pre>
      )}
    </main>
  )
}
