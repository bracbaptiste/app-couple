import Anthropic from "@anthropic-ai/sdk"

import {
  parseExtraction,
  PROMPT_EXTRACTION,
  ExtractionParseError,
} from "@/lib/recipes/extraction"
import { createClient } from "@/lib/supabase/server"

/**
 * Route d'extraction de recette (PRD_recettes §7.2).
 *
 * Flux : navigateur → cette route (avec la clé serveur) → Claude Sonnet 4.6 en
 * vision → JSON §7.3 parsé défensivement → renvoyé au navigateur. RIEN n'est
 * enregistré ici : l'enregistrement se fait après l'écran de relecture (§7.5).
 *
 * Sécurité §3 (NON NÉGOCIABLE) : `ANTHROPIC_API_KEY` est lue côté serveur
 * uniquement, jamais préfixée `NEXT_PUBLIC_`, jamais transmise au navigateur.
 */

// Le SDK Anthropic a besoin du runtime Node.js (pas Edge).
export const runtime = "nodejs"

/** Médias acceptés par la vision Claude. */
const MEDIA_TYPES_OK = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const
type MediaTypeOk = (typeof MEDIA_TYPES_OK)[number]

/** Garde-fou taille (l'API rejette au-delà ; on coupe avant l'appel). */
const TAILLE_MAX_OCTETS = 8 * 1024 * 1024 // 8 Mo

/** Garde-fou nombre d'images : une recette peut tenir sur plusieurs pages. */
const MAX_IMAGES = 8

function erreur(message: string, status: number) {
  return Response.json({ error: message }, { status })
}

export async function POST(request: Request) {
  // 1. Garde d'auth : on n'expose pas une route IA payante en accès libre.
  //    Même pattern que les Server Actions du foyer (auth.getUser()).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return erreur("Non authentifié.", 401)

  // 2. Clé serveur. Absente → message clair, sans jamais exposer de secret.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return erreur(
      "Configuration manquante : ANTHROPIC_API_KEY n'est pas définie côté serveur.",
      500,
    )
  }

  // 3. Lecture des images en multipart/form-data (champ « image », répétable).
  //    Une recette peut s'étaler sur plusieurs photos (pages, recto/verso…) :
  //    on accepte plusieurs fichiers et on les transmettra dans le MÊME appel.
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return erreur("Requête invalide : multipart/form-data attendu.", 400)
  }

  const images = form
    .getAll("image")
    .filter((v): v is File => v instanceof File && v.size > 0)

  if (images.length === 0) {
    return erreur("Aucune image reçue (champ « image »).", 400)
  }
  if (images.length > MAX_IMAGES) {
    return erreur(`Trop d'images (max ${MAX_IMAGES} par recette).`, 413)
  }
  for (const image of images) {
    if (!MEDIA_TYPES_OK.includes(image.type as MediaTypeOk)) {
      return erreur(
        `Format non supporté (${image.type || "inconnu"}). Attendu : JPEG, PNG, WebP ou GIF.`,
        415,
      )
    }
    if (image.size > TAILLE_MAX_OCTETS) {
      return erreur("Une image est trop volumineuse (max 8 Mo).", 413)
    }
  }

  // Bloc image par photo (base64), dans l'ordre reçu.
  const imageBlocks = await Promise.all(
    images.map(async (image) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: image.type as MediaTypeOk,
        data: Buffer.from(await image.arrayBuffer()).toString("base64"),
      },
    })),
  )

  // Quand plusieurs photos sont fournies, on précise qu'elles forment UNE SEULE
  // recette (sans toucher au prompt §7.4 partagé/testé : on l'ajoute en préambule).
  const consigneMulti =
    images.length > 1
      ? `Les ${images.length} images suivantes sont plusieurs photos d'UNE SEULE et même recette (par exemple plusieurs pages). Combine-les en une seule recette cohérente.\n\n`
      : ""

  // 4. Appel Claude Sonnet 4.6 en vision. Un seul appel : la vision lit l'image
  //    ET structure le JSON dans la même requête (PRD §3).
  const client = new Anthropic({ apiKey })
  let rawText: string
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      thinking: { type: "disabled" }, // extraction courte : pas de raisonnement étendu
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: consigneMulti + PROMPT_EXTRACTION },
          ],
        },
      ],
    })

    if (response.stop_reason === "refusal") {
      return erreur("L'IA a refusé de traiter cette image.", 422)
    }

    // Concatène les blocs texte de la réponse.
    rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
  } catch (e) {
    // Erreurs API typées (clé invalide, quota, surcharge…), sans fuiter de secret.
    if (e instanceof Anthropic.APIError) {
      return erreur(`Erreur de l'API IA (${e.status ?? "?"}).`, 502)
    }
    return erreur("Échec de l'appel à l'IA.", 502)
  }

  // 5. Parsing défensif + normalisation des noms (§5) — dans le module dédié.
  try {
    const recette = parseExtraction(rawText)
    return Response.json(recette)
  } catch (e) {
    if (e instanceof ExtractionParseError) {
      // 422 : on a bien parlé à l'IA, mais sa réponse n'était pas exploitable.
      return erreur(
        "La réponse de l'IA n'a pas pu être interprétée. Réessaie avec une photo plus nette.",
        422,
      )
    }
    return erreur("Erreur inattendue lors du traitement.", 500)
  }
}
