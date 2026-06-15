import { ListChecks, ShoppingCart } from "lucide-react"

/**
 * Tampon de section du hub (DESIGN_SYSTEM_V2 §1.1).
 *
 * Icône simple alignée à gauche introduisant un groupe de listes — sans cadre,
 * sans fond, sans ombre. C'est elle qui porte l'info de type (la tuile ne l'a
 * plus). Masquée par l'appelant si son groupe est vide (pas d'icône orpheline).
 */
export function SectionMarker({ kind }: { kind: "courses" | "todo" }) {
  const Icon = kind === "todo" ? ListChecks : ShoppingCart
  const label = kind === "todo" ? "To-do" : "Courses"

  return (
    <div className="flex justify-start pl-1">
      <Icon size={30} strokeWidth={2} className="text-ink" aria-label={label} />
    </div>
  )
}
