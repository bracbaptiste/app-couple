"use client"

import { useRouter } from "next/navigation"
import Image from "next/image"
import { Camera, ImageIcon, Check, X, Plus } from "lucide-react"
import { useRef, useState } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { FormFeedback } from "@/app/(auth)/form-ui"
import { parseExtraction, type RecetteExtraite } from "@/lib/recipes/extraction"

import { ReviewForm } from "./review-form"

/**
 * Flux « Ajouter une recette » (PRD_recettes §7.1 → §7.5), en une seule route
 * sous forme de machine à états :
 *
 *   choisir → traitement (extraction IA) → relecture → terminé
 *
 * Une recette peut s'étaler sur PLUSIEURS photos (pages, recto/verso…) : on en
 * sélectionne autant que nécessaire, toutes alimentent le même appel d'extraction
 * (→ une seule recette).
 *
 * Les photos ne servent QU'À l'extraction : elles ne sont jamais conservées
 * (ni dans Storage, ni en base). On garde seulement un aperçu EN MÉMOIRE le temps
 * de la relecture, libéré ensuite. La clé API ne transite jamais ici :
 * l'extraction passe par la route serveur (§3).
 */

/** Formats que la vision Claude sait lire (cf. route serveur). */
const FORMATS_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"]

/** Nombre maximum de photos par recette (aligné sur la route serveur). */
const MAX_IMAGES = 8

type Phase =
  | { name: "choisir" }
  | { name: "traitement" }
  | { name: "relecture"; recette: RecetteExtraite; previewUrls: string[] }
  | { name: "termine" }

/** Envoie toutes les photos à la route d'extraction et parse le résultat. */
async function extraireRecette(files: File[]): Promise<RecetteExtraite> {
  const form = new FormData()
  // Champ « image » répété : la route lit `form.getAll("image")`.
  for (const file of files) form.append("image", file)
  const res = await fetch("/api/recipes/extract", { method: "POST", body: form })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error ?? `Erreur HTTP ${res.status}`)
  }
  // La route renvoie déjà du RecetteExtraite ; on re-parse par sécurité (idempotent).
  return parseExtraction(JSON.stringify(data))
}

export function NewRecipeClient() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>({ name: "choisir" })
  // Photos sélectionnées (dans l'ordre) + leurs aperçus mémoire (même index).
  const [fichiers, setFichiers] = useState<File[]>([])
  const [apercus, setApercus] = useState<string[]>([])
  const [erreur, setErreur] = useState<string | undefined>()

  // Deux entrées distinctes : appareil photo (une à la fois) et galerie (multi).
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  // Au moins une photo lisible, et aucune au format non supporté.
  const aPhotos = fichiers.length > 0
  const toutSupporte = fichiers.every((f) => FORMATS_OK.includes(f.type))

  /** Ajoute des fichiers à la sélection (en respectant le plafond), crée les aperçus. */
  function ajouter(nouveaux: File[]) {
    if (nouveaux.length === 0) return
    setErreur(undefined)
    setFichiers((prev) => {
      const place = Math.max(0, MAX_IMAGES - prev.length)
      const retenus = nouveaux.slice(0, place)
      if (retenus.length < nouveaux.length) {
        setErreur(`Maximum ${MAX_IMAGES} photos par recette.`)
      }
      setApercus((urls) => [
        ...urls,
        ...retenus.map((f) => URL.createObjectURL(f)),
      ])
      return [...prev, ...retenus]
    })
  }

  /** Retire une photo (et libère son aperçu). */
  function retirer(index: number) {
    setApercus((urls) => {
      const url = urls[index]
      if (url) URL.revokeObjectURL(url)
      return urls.filter((_, i) => i !== index)
    })
    setFichiers((prev) => prev.filter((_, i) => i !== index))
  }

  /** Libère tous les aperçus mémoire (sortie d'écran / reset). */
  function libererApercus() {
    setApercus((urls) => {
      urls.forEach((u) => URL.revokeObjectURL(u))
      return []
    })
  }

  async function lancer() {
    if (!aPhotos || !toutSupporte) return
    setErreur(undefined)
    setPhase({ name: "traitement" })

    // On transmet les aperçus déjà créés à l'écran de relecture (mêmes URLs).
    const previewUrls = apercus

    try {
      const recette = await extraireRecette(fichiers)
      setPhase({ name: "relecture", recette, previewUrls })
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : "L’extraction a échoué. Réessaie avec des photos plus nettes.",
      )
      setPhase({ name: "choisir" })
    }
  }

  // --- Phase : relecture éditable (§7.5) ----------------------------------
  if (phase.name === "relecture") {
    return (
      <section className="mx-auto w-full max-w-sm">
        <ReviewForm
          recette={phase.recette}
          photoPreviewUrls={phase.previewUrls}
          onCancel={() => {
            libererApercus()
            setFichiers([])
            setPhase({ name: "choisir" })
          }}
          onSaved={() => {
            libererApercus()
            setFichiers([])
            setPhase({ name: "termine" })
          }}
        />
      </section>
    )
  }

  // --- Phase : enregistrée -------------------------------------------------
  if (phase.name === "termine") {
    return (
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 pt-10 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full border-2 border-ink bg-sauge shadow-riso-ink-sm">
          <Check className="size-8 text-ink" strokeWidth={3} aria-hidden />
        </span>
        <h1 className="font-display text-xl uppercase text-ink">
          Recette enregistrée
        </h1>
        <p className="text-[13px] text-ink-soft">
          Elle est rangée dans ton carnet de recettes.
        </p>
        <div className="flex w-full flex-col gap-2">
          <RisoButton
            onClick={() => setPhase({ name: "choisir" })}
            className="h-12 w-full text-sm"
          >
            Ajouter une autre recette
          </RisoButton>
          <RisoButton
            variant="secondary"
            onClick={() => router.push("/recipes")}
            className="h-12 w-full text-sm"
          >
            Mon carnet
          </RisoButton>
        </div>
      </section>
    )
  }

  // --- Phase : traitement (extraction) ------------------------------------
  if (phase.name === "traitement") {
    return (
      <section className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 pt-16 text-center">
        <span
          className="size-12 animate-spin rounded-full border-[3px] border-ink border-t-transparent"
          aria-hidden
        />
        <div>
          <h1 className="font-display text-lg uppercase text-ink">
            Lecture de la recette…
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            L’IA déchiffre {fichiers.length > 1 ? "tes photos" : "ta photo"}.
            Quelques secondes.
          </p>
        </div>
      </section>
    )
  }

  // --- Phase : choisir des photos (§7.1) ----------------------------------
  return (
    <section className="mx-auto w-full max-w-sm">
      <h1 className="mb-1 font-display text-xl uppercase text-ink">
        Ajouter une recette
      </h1>
      <p className="mb-6 text-[13px] leading-snug text-ink-soft">
        Photographie une recette (même manuscrite) : l’IA en extrait le titre,
        les ingrédients, les étapes et une estimation des calories. Plusieurs
        photos possibles si la recette tient sur plusieurs pages. Tu corriges
        tout ensuite.
      </p>

      {/* Inputs fichier masqués : appareil photo (une) et galerie (multi). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          ajouter(Array.from(e.target.files ?? []))
          e.target.value = "" // permet de reprendre la même photo deux fois
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          ajouter(Array.from(e.target.files ?? []))
          e.target.value = ""
        }}
      />

      <div className="flex flex-col gap-3">
        <RisoButton
          onClick={() => cameraRef.current?.click()}
          disabled={fichiers.length >= MAX_IMAGES}
          className="h-14 w-full text-sm"
        >
          <Camera aria-hidden /> Prendre une photo
        </RisoButton>
        <RisoButton
          variant="secondary"
          onClick={() => galleryRef.current?.click()}
          disabled={fichiers.length >= MAX_IMAGES}
          className="h-14 w-full text-sm"
        >
          <ImageIcon aria-hidden /> Choisir des images
        </RisoButton>
      </div>

      {/* Vignettes des photos sélectionnées, suppression individuelle. */}
      {aPhotos && (
        <div className="mt-5 flex flex-col gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-3 shadow-riso-sauge">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {fichiers.length} photo{fichiers.length > 1 ? "s" : ""}
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {fichiers.map((file, index) => {
              const supporte = FORMATS_OK.includes(file.type)
              return (
                <li
                  key={apercus[index] ?? index}
                  className="relative aspect-square overflow-hidden rounded-[8px] border-2 border-ink"
                >
                  {apercus[index] && (
                    <Image
                      src={apercus[index]}
                      alt={`Photo ${index + 1}`}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  )}
                  {/* Avertissement format non lisible (HEIC…). */}
                  {!supporte && (
                    <span className="absolute inset-0 flex items-center justify-center bg-brique/80 px-1 text-center text-[10px] font-medium text-paper-light">
                      Format non lisible
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => retirer(index)}
                    aria-label={`Retirer la photo ${index + 1}`}
                    className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full border-2 border-ink bg-paper-light text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge"
                  >
                    <X className="size-3.5" strokeWidth={3} aria-hidden />
                  </button>
                </li>
              )
            })}
            {/* Tuile « ajouter » si on n'a pas atteint le plafond. */}
            {fichiers.length < MAX_IMAGES && (
              <li>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  aria-label="Ajouter des photos"
                  className="flex aspect-square w-full items-center justify-center rounded-[8px] border-2 border-dashed border-ink bg-paper text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge"
                >
                  <Plus className="size-6" strokeWidth={2.5} aria-hidden />
                </button>
              </li>
            )}
          </ul>

          {!toutSupporte && (
            <p className="rounded-[8px] border-2 border-brique bg-brique/10 px-2.5 py-2 text-[12px] leading-snug text-ink">
              ⚠️ Une ou plusieurs photos ne sont pas lisibles par l’IA (souvent
              le format iPhone « HEIC »). Retire-les ou convertis-les en
              JPEG/PNG, puis réessaie.
            </p>
          )}

          <RisoButton
            onClick={lancer}
            disabled={!toutSupporte}
            className="h-12 w-full text-sm"
          >
            Lire la recette
          </RisoButton>
        </div>
      )}

      {erreur && (
        <div className="mt-5">
          <FormFeedback error={erreur} />
        </div>
      )}
    </section>
  )
}
