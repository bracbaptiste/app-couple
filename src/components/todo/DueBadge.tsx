import { cn } from "@/lib/utils"

/**
 * DueBadge — étiquette d'échéance d'une tâche (DESIGN_SYSTEM_V2 §2.4).
 *
 * Silkscreen 10px MAJ, padding 3-6, bordure 1.5px encre, radius 4. Placée à
 * droite du titre, juste avant le marqueur « ajouté par ».
 *
 * ÉTAPE COURANTE : affiche TOUJOURS la date au format « JEU. 20 JUIN » (fr-FR).
 * Les variantes visuelles « AUJOURD'HUI » / « DEMAIN » / « EN RETARD » (fond
 * sauge ou brique selon l'urgence, cf. §2.4) arrivent à l'étape suivante.
 */
type DueBadgeProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Échéance, en ISO (« 2026-06-20 ») ou objet Date. */
  date: string | Date
}

/** Formate une échéance en « JEU. 20 JUIN » (jour abrégé + jour + mois). */
const dueFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "long",
})

function formatDue(date: string | Date): string {
  const value = typeof date === "string" ? new Date(date) : date
  // « jeu. 20 juin » → on retire le point d'abréviation parasite puis MAJ.
  return dueFormatter.format(value).toUpperCase()
}

function DueBadge({ date, className, ...props }: DueBadgeProps) {
  return (
    <span
      data-slot="due-badge"
      className={cn(
        "inline-block shrink-0 whitespace-nowrap rounded-[4px] border-[1.5px] border-ink bg-paper-light px-1.5 py-[3px] font-display text-[10px] uppercase leading-none text-ink-soft",
        className,
      )}
      {...props}
    >
      {formatDue(date)}
    </span>
  )
}

export { DueBadge }
