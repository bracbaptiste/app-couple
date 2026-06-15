import Link from "next/link"
import { ArrowLeft, ListChecks, Pencil } from "lucide-react"

/**
 * Écran d'une to-do list (kind = 'todo').
 *
 * SQUELETTE V2 — l'intérieur (ajout de tâche, liste triée, section « Fait »)
 * arrive dans une étape ultérieure (cf. ARCHITECTURE_V2 §7, dossier
 * `components/todo`). Pour l'instant : header (retour + titre + crayon) cohérent
 * avec l'écran courses, et un placeholder centré. La barre de nav du bas est
 * fournie par le layout `(app)`.
 */
export function TodoListView({ name }: { name: string }) {
  return (
    <div className="flex flex-col">
      <div className="mb-4">
        {/* Retour : cible tap 44px (DESIGN_SYSTEM §8), aligné au bord gauche. */}
        <Link
          href="/lists"
          className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <ArrowLeft className="size-4" strokeWidth={2.5} aria-hidden />
          Listes
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="font-display text-xl uppercase text-ink">{name}</h1>
          {/* Crayon (renommer) — désactivé tant que le module to-do n'est pas câblé. */}
          <button
            type="button"
            disabled
            aria-label="Renommer la liste (bientôt disponible)"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink-soft opacity-50"
          >
            <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

      {/* Placeholder centré — le module to-do arrive bientôt. */}
      <div className="flex flex-col items-center gap-3 rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-16 text-center">
        <ListChecks className="size-10 text-ink-soft" strokeWidth={2} aria-hidden />
        <p className="font-display text-lg uppercase text-ink-soft">
          Module to-do bientôt disponible
        </p>
      </div>
    </div>
  )
}
