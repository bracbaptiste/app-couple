"use client"

import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import { Plus, Sparkles } from "lucide-react"

import { useSwipeDismiss } from "@/lib/hooks/useSwipeDismiss"
import { cn } from "@/lib/utils"

/**
 * Sheet « Nouvelle recette » — le flux d'ajout de recette (PRD V4 §4.6).
 *
 * Reprend À L'IDENTIQUE les deux points d'entrée de l'ancien FAB déployable :
 * « Ajouter une recette » (photo / saisie, `/recipes/new`) et « Créer avec l'IA »
 * (`/recipes/ai`). Seul le déclencheur change (la tuile fantôme, plus le FAB) ;
 * les destinations et le flux en aval sont inchangés. Même habillage bottom sheet
 * que `NewListSheet` pour la cohérence.
 */
export function NewRecipeSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { offset, dragging, releasing, onTransitionEnd, swipeHandlers } =
    useSwipeDismiss({ onDismiss: () => onOpenChange(false) })

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm touch-none",
            "rounded-t-[22px] border-t-[2.5px] border-ink bg-paper px-[22px] pb-7 pt-[22px]",
            "transition-transform data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full motion-reduce:transition-none",
          )}
          initialFocus={false}
          style={
            dragging
              ? { transform: `translateY(${offset}px)`, transition: "none" }
              : releasing
                ? { transform: `translateY(${offset}px)` }
                : undefined
          }
          onTransitionEnd={onTransitionEnd}
          {...swipeHandlers}
        >
          {/* Poignée (glisser vers le bas pour fermer). */}
          <div className="mx-auto mb-[18px] h-[5px] w-12 rounded-full bg-ink" />

          <Dialog.Title className="mb-[18px] text-center font-display text-[22px] uppercase leading-none tracking-tight text-ink">
            Nouvelle recette
          </Dialog.Title>

          <div className="flex flex-col gap-3">
            <ChoiceLink
              href="/recipes/new"
              label="Ajouter une recette"
              hint="Photo d’une fiche, même manuscrite, ou saisie"
              icon={Plus}
              variant="primary"
              onNavigate={() => onOpenChange(false)}
            />
            <ChoiceLink
              href="/recipes/ai"
              label="Créer avec l’IA"
              hint="Laisse l’IA composer une recette"
              icon={Sparkles}
              variant="secondary"
              onNavigate={() => onOpenChange(false)}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Une des deux entrées : pastille icône + libellé + sous-titre, tout cliquable. */
function ChoiceLink({
  href,
  label,
  hint,
  icon: Icon,
  variant,
  onNavigate,
}: {
  href: string
  label: string
  hint: string
  icon: typeof Plus
  variant: "primary" | "secondary"
  onNavigate: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group flex items-center gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-3 text-ink shadow-riso-ink-sm outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transition-none"
    >
      <span
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-ink",
          variant === "primary"
            ? "bg-brique text-paper-light"
            : "bg-sauge text-ink",
        )}
      >
        <Icon className="size-5" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-[15px] uppercase leading-tight tracking-tight text-ink">
          {label}
        </span>
        <span className="font-mono text-[11px] leading-snug text-ink-soft">
          {hint}
        </span>
      </span>
    </Link>
  )
}
