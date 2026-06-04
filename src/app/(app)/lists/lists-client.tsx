"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useTransition, useActionState } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { Field, FormFeedback } from "@/app/(auth)/form-ui"

import {
  createList,
  deleteList,
  renameList,
  type ActionResult,
} from "./actions"

export type ListView = {
  id: string
  name: string
  /** Nombre total d'articles. */
  total: number
  /** Nombre d'articles non cochés (restant à acheter). */
  unchecked: number
  /** Dernière activité connue (ISO) ou null. */
  updatedAt: string | null
}

/** Ombres alternées sauge ↔ brique pour rythmer la grille (DESIGN_SYSTEM §4). */
type TileShadow = "sauge" | "brique"

/** Formate une date ISO en libellé court français (ex. « 4 juin »). */
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
})

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return dateFormatter.format(new Date(ms))
}

/** Pilote le hub des listes : création + grille de tuiles éditables. */
export function ListsManager({ lists }: { lists: ListView[] }) {
  return (
    <div className="flex flex-col gap-5">
      <CreateListForm />

      {lists.length === 0 ? (
        <RisoCard shadow="sauge">
          <p className="text-sm text-ink-soft">
            Aucune liste pour l’instant. Crée ta première liste de courses
            ci-dessus.
          </p>
        </RisoCard>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {lists.map((list, index) => (
            <ListTile
              key={list.id}
              list={list}
              shadow={index % 2 === 0 ? "sauge" : "brique"}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Création                                                                   */
/* -------------------------------------------------------------------------- */

function CreateListForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    createList,
    null,
  )
  const formRef = useRef<HTMLFormElement>(null)

  // Réinitialise le champ après une création réussie.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset()
  }, [state])

  const error = state && !state.ok ? state.error : undefined

  return (
    <RisoCard shadow="ink" padding="lg">
      <h2 className="mb-4 font-display text-lg uppercase text-ink">
        Nouvelle liste
      </h2>
      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        <Field label="Nom de la liste" htmlFor="new_list">
          <div className="flex gap-2">
            <RisoInput
              id="new_list"
              name="name"
              type="text"
              placeholder="Ex : Courses de la semaine"
              maxLength={50}
              required
            />
            <RisoButton type="submit" className="h-12 shrink-0 px-4 text-sm">
              Créer
            </RisoButton>
          </div>
        </Field>
        <FormFeedback error={error} />
      </form>
    </RisoCard>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tuile de liste                                                             */
/* -------------------------------------------------------------------------- */

function ListTile({
  list,
  shadow,
}: {
  list: ListView
  shadow: TileShadow
}) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(list.name)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | undefined>()

  function run(action: () => Promise<ActionResult>) {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else {
        setEditing(false)
        setConfirmingDelete(false)
      }
    })
  }

  const updatedLabel = formatUpdatedAt(list.updatedAt)

  return (
    <li>
      <RisoCard shadow={shadow} padding="default">
        {editing ? (
          /* --- Mode renommage --- */
          <div className="flex flex-col gap-3">
            <RisoInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
            <div className="flex gap-1.5">
              <RisoButton
                size="sm"
                disabled={isPending}
                onClick={() => run(() => renameList(list.id, name))}
              >
                OK
              </RisoButton>
              <RisoButton
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setName(list.name)
                  setEditing(false)
                  setError(undefined)
                }}
              >
                Annuler
              </RisoButton>
            </div>
          </div>
        ) : (
          /* --- Mode lecture : la tuile entière ouvre la liste --- */
          <>
            <Link
              href={`/lists/${list.id}`}
              className="block rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            >
              <h3 className="font-display text-lg uppercase leading-tight text-ink">
                {list.name}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-display text-2xl leading-none text-ink">
                  {list.unchecked}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  à acheter · {list.total} au total
                </span>
              </div>
              {updatedLabel && (
                <p className="mt-1 font-mono text-[11px] text-ink-soft">
                  Modifiée le {updatedLabel}
                </p>
              )}
            </Link>

            <div className="mt-3 flex gap-1.5 border-t-2 border-dashed border-ink pt-3">
              <RisoButton
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => setEditing(true)}
              >
                Renommer
              </RisoButton>
              <RisoButton
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => setConfirmingDelete((v) => !v)}
              >
                Suppr.
              </RisoButton>
            </div>
          </>
        )}

        {/* Confirmation de suppression */}
        {confirmingDelete && !editing && (
          <div className="mt-3 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-3">
            <p className="text-[12px] leading-snug text-ink">
              Supprimer définitivement la liste « {list.name} »
              {list.total > 0
                ? ` et ses ${list.total} article${list.total > 1 ? "s" : ""}`
                : ""}
              ?
            </p>
            <div className="flex gap-1.5">
              <RisoButton
                size="sm"
                disabled={isPending}
                onClick={() => run(() => deleteList(list.id))}
              >
                Confirmer
              </RisoButton>
              <RisoButton
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => {
                  setConfirmingDelete(false)
                  setError(undefined)
                }}
              >
                Annuler
              </RisoButton>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-2 rounded-[8px] border-2 border-brique bg-brique/10 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-ink"
          >
            {error}
          </p>
        )}
      </RisoCard>
    </li>
  )
}
