/**
 * Mémoire locale du « dernier outil utilisé » (PRD V4 §4.3).
 *
 * À l'ouverture de l'app, on ré-atterrit sur le dernier outil consulté (Listes,
 * Biblio, Recettes, Planning, Profil) ; Listes par défaut au premier lancement.
 * Purement local (localStorage) : c'est une préférence d'appareil, pas une donnée
 * partagée du couple — elle ne transite jamais par le serveur.
 */

/** Les cinq outils de l'éventail (mêmes routes que `brain-button.tsx`). */
export const TOOLS = [
  "/lists",
  "/library",
  "/recipes",
  "/planning",
  "/profile",
] as const

export type ToolPath = (typeof TOOLS)[number]

/** Outil affiché au tout premier lancement (aucune préférence enregistrée). */
export const DEFAULT_TOOL: ToolPath = "/lists"

const STORAGE_KEY = "last-tool"

/**
 * Ramène un chemin quelconque (y compris une sous-page, ex. `/lists/123`) à
 * l'outil racine auquel il appartient, ou `null` si hors des cinq outils.
 */
export function toolForPath(pathname: string): ToolPath | null {
  return (
    TOOLS.find((t) => pathname === t || pathname.startsWith(`${t}/`)) ?? null
  )
}

/** Dernier outil enregistré, ou l'outil par défaut si rien/valeur invalide. */
export function getLastTool(): ToolPath {
  if (typeof window === "undefined") return DEFAULT_TOOL
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (TOOLS as readonly string[]).includes(stored)) {
      return stored as ToolPath
    }
  } catch {
    // localStorage indisponible (mode privé strict…) : on retombe sur le défaut.
  }
  return DEFAULT_TOOL
}

/**
 * Persiste l'outil correspondant au chemin courant. Ignore silencieusement les
 * chemins hors outils (auth, onboarding…) et les erreurs de stockage.
 */
export function rememberTool(pathname: string): void {
  const tool = toolForPath(pathname)
  if (!tool) return
  try {
    localStorage.setItem(STORAGE_KEY, tool)
  } catch {
    // pas de persistance possible : sans gravité, on garde juste le défaut.
  }
}
