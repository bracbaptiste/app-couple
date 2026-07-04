"use client"

import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Tuile fantôme — le geste d'ajout dans la collection (PRD V4 §4.6).
 *
 * « Ce qui n'existe pas encore est imprimé en pointillés » : mêmes dimensions
 * qu'une tuile normale, bordure 2px pointillée `ink-soft`, fond transparent, un
 * « + » centré (icône seule, l'`aria-label` porte le nom accessible). Ajoutée
 * SOUS les tuiles existantes ; ne remplace ni ne modifie aucune tuile.
 *
 * Au tap : ouvre le flux d'ajout existant de l'écran (Sheet « Nouvelle liste »,
 * chooser « Nouvelle recette »…) — le comportement d'ouverture est inchangé,
 * seul le point de déclenchement quitte le FAB pour la collection.
 */
export function GhostTile({
  label,
  onClick,
  className,
}: {
  /** Nom accessible (l'icône est seule, sans libellé visible). */
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      onClick={onClick}
      className={cn(
        // min-h ≥ 44px (zone tap) ; pleine largeur pour épouser la colonne de
        // tuiles. Bordure pointillée ink-soft + fond transparent (§4.6).
        "flex min-h-[68px] w-full items-center justify-center rounded-[12px]",
        "border-2 border-dashed border-ink-soft bg-transparent text-ink-soft",
        "outline-none transition-[transform,color] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        "hover:text-ink active:translate-x-px active:translate-y-px motion-reduce:transition-none",
        className,
      )}
    >
      <Plus className="size-6" strokeWidth={2.5} aria-hidden />
    </button>
  )
}
