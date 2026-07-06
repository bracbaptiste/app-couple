"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"

/** Résultat minimal d'une Server Action de restauration (forme commune aux 5 entités). */
export type UndoResult = { ok: true } | { ok: false; error: string }

type UndoToastProps = {
  /** Restaure l'entité supprimée. Le toast se ferme si la restauration réussit. */
  onUndo: () => Promise<UndoResult>
  /** Fin du délai, ou fermeture après une restauration réussie. */
  onDismiss: () => void
  /** Durée d'affichage avant fermeture auto (PRD_V4.1 §4.5 « ~6 s »). */
  durationMs?: number
}

const DEFAULT_DURATION_MS = 6000

/**
 * Toast « Supprimé · ANNULER » partagé par les 5 suppressions soft-delete de la
 * V4.1 (PRD_V4.1 §4.5) — même langage visuel que le toast ANNULER du Cerveau
 * (`brain-listening.tsx`) : encart papier bordé, bouton Annuler ≥44px. Portail
 * non-modal (pas de voile, pas de piège de focus) : une suppression se produit
 * en navigation normale, elle ne doit pas bloquer l'écran.
 *
 * Local à qui supprime (§4.5) : l'autre voit la ligne disparaître/reparaître en
 * temps réel via le Realtime UPDATE existant, sans rien de plus ici. Une fois le
 * délai écoulé, la ligne reste soft-deleted en base mais n'est plus restaurable
 * depuis l'UI (§3 décision 3) — le composant se contente de disparaître.
 */
export function UndoToast({
  onUndo,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
}: UndoToastProps) {
  const [undoing, setUndoing] = useState(false)
  const [error, setError] = useState<string | undefined>()

  // Auto-fermeture après le délai — suspendue pendant une restauration en cours
  // ou après un échec (on laisse le message d'erreur lisible plutôt que le couper).
  useEffect(() => {
    if (undoing || error) return
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [onDismiss, durationMs, undoing, error])

  async function handleUndo() {
    if (undoing) return
    setUndoing(true)
    setError(undefined)
    const result = await onUndo()
    if (!result.ok) {
      setError(result.error)
      setUndoing(false)
      return
    }
    onDismiss()
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        className="undo-toast-in pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-paper-light p-3 shadow-riso-ink-lg motion-reduce:transition-none"
      >
        <p className="min-w-0 text-[14px] leading-snug text-ink">
          {error ?? "Supprimé"}
        </p>
        <RisoButton
          variant="secondary"
          size="sm"
          disabled={undoing}
          onClick={handleUndo}
        >
          {undoing ? (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            "Annuler"
          )}
        </RisoButton>
      </div>
    </div>,
    document.body,
  )
}
