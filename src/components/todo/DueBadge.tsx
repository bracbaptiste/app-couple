import { cn } from "@/lib/utils"
import { getDueLabel } from "@/lib/hooks/useTaskState"

/**
 * DueBadge — étiquette d'échéance d'une tâche (DESIGN_SYSTEM_V2 §2.4).
 *
 * Silkscreen 10px MAJ, padding 3-6, bordure 1.5px encre, radius 4. Placée à
 * droite du titre, juste avant le marqueur « ajouté par ».
 *
 * Le texte vient de {@link getDueLabel} (EN RETARD / AUJOURD'HUI / DEMAIN /
 * « JEU. 20 JUIN »). Le style varie selon l'urgence :
 *   - EN RETARD              → fond brique, texte paper-light
 *   - AUJOURD'HUI / DEMAIN   → fond sauge, texte ink
 *   - sinon                  → fond paper-light, texte ink-soft (défaut)
 */
type DueBadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Échéance, en ISO (« 2026-06-20 ») ou objet Date. */
  date: string | Date
}

/** Classes de fond/texte selon l'étiquette d'urgence. */
function badgeTone(label: string): string {
  if (label === "EN RETARD") return "bg-brique text-paper-light"
  if (label === "AUJOURD'HUI" || label === "DEMAIN") return "bg-sauge text-ink"
  return "bg-paper-light text-ink-soft"
}

function DueBadge({ date, className, ...props }: DueBadgeProps) {
  const label = getDueLabel(date)

  return (
    <span
      data-slot="due-badge"
      className={cn(
        "inline-block shrink-0 whitespace-nowrap rounded-[4px] border-[1.5px] border-ink px-1.5 py-[3px] font-display text-[10px] uppercase leading-none",
        badgeTone(label),
        className,
      )}
      {...props}
    >
      {label}
    </span>
  )
}

export { DueBadge }
