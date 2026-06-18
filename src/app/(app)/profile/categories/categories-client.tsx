"use client"

import { Trash2 } from "lucide-react"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { cn } from "@/lib/utils"
import { Field, FormFeedback } from "@/app/(auth)/form-ui"

import {
  addCategory,
  deleteCategory,
  moveCategory,
  renameCategory,
  type ActionResult,
} from "../actions"

export type CategoryView = {
  id: string
  name: string
  /** Nombre de produits (bibliothèque) rattachés au rayon. */
  itemCount: number
}

/* -------------------------------------------------------------------------- */
/*  Gestion des rayons (page dédiée /profile/categories)                       */
/* -------------------------------------------------------------------------- */

/** Liste éditable des rayons + formulaire d'ajout. */
export function CategoriesManager({
  categories,
}: {
  categories: CategoryView[]
}) {
  const [addState, addAction] = useActionState<ActionResult | null, FormData>(
    addCategory,
    null,
  )
  const formRef = useRef<HTMLFormElement>(null)

  // Réinitialise le champ après un ajout réussi.
  useEffect(() => {
    if (addState?.ok) formRef.current?.reset()
  }, [addState])

  const addError = addState && !addState.ok ? addState.error : undefined

  return (
    <RisoCard shadow="brique" padding="lg">
      <p className="mb-5 text-[12px] leading-snug text-ink-soft">
        Touche un nom pour le renommer · flèches pour réordonner · 🗑 pour
        supprimer.
      </p>

      <ul className="mb-5 flex flex-col gap-2.5">
        {categories.map((cat, index) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            categories={categories}
            isFirst={index === 0}
            isLast={index === categories.length - 1}
          />
        ))}
        {categories.length === 0 && (
          <li className="text-[13px] text-ink-soft">Aucun rayon pour l’instant.</li>
        )}
      </ul>

      <form ref={formRef} action={addAction} className="flex flex-col gap-3">
        <Field label="Nouveau rayon" htmlFor="new_category">
          <div className="flex gap-2">
            <RisoInput
              id="new_category"
              name="name"
              type="text"
              placeholder="Ex : Boucherie"
              maxLength={30}
              required
            />
            <SubmitInline />
          </div>
        </Field>
        <FormFeedback error={addError} />
      </form>
    </RisoCard>
  )
}

/** Bouton « + » d'ajout compact, à droite du champ. */
function SubmitInline() {
  return (
    <RisoButton type="submit" className="h-12 shrink-0 px-4 text-sm">
      Ajouter
    </RisoButton>
  )
}

function CategoryRow({
  category,
  categories,
  isFirst,
  isLast,
}: {
  category: CategoryView
  categories: CategoryView[]
  isFirst: boolean
  isLast: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [error, setError] = useState<string | undefined>()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [replacementId, setReplacementId] = useState("")
  // Évite un double enregistrement : Échap (annulation) déclenche aussi le blur,
  // ce drapeau dit au `commit` du blur de ne rien faire dans ce cas.
  const skipCommit = useRef(false)

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

  /** Valide le renommage (Entrée ou perte de focus). No-op si vide / inchangé. */
  function commit() {
    if (skipCommit.current) {
      skipCommit.current = false
      return
    }
    const trimmed = name.trim()
    if (trimmed === "" || trimmed === category.name) {
      setName(category.name)
      setEditing(false)
      setError(undefined)
      return
    }
    run(() => renameCategory(category.id, name))
  }

  /** Annule l'édition (Échap) et restaure le nom courant sans appel serveur. */
  function cancel() {
    skipCommit.current = true
    setName(category.name)
    setEditing(false)
    setError(undefined)
  }

  const otherCategories = categories.filter((c) => c.id !== category.id)

  return (
    <li className="rounded-[10px] border-2 border-ink bg-paper-light p-2.5">
      <div className="flex items-center gap-2">
        {/* Boutons monter / descendre */}
        <div className="flex flex-col gap-1">
          <ArrowButton
            label="Monter"
            disabled={isFirst || isPending}
            title={isFirst ? "Déjà en haut de la liste" : undefined}
            onClick={() => run(() => moveCategory(category.id, "up"))}
          >
            ▲
          </ArrowButton>
          <ArrowButton
            label="Descendre"
            disabled={isLast || isPending}
            title={isLast ? "Déjà en bas de la liste" : undefined}
            onClick={() => run(() => moveCategory(category.id, "down"))}
          >
            ▼
          </ArrowButton>
        </div>

        {/* Nom : touche-le pour l'éditer directement (pas de bouton Renommer).
            Entrée / clic ailleurs enregistre, Échap annule. */}
        {editing ? (
          <RisoInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              } else if (e.key === "Escape") {
                e.preventDefault()
                cancel()
              }
            }}
            maxLength={30}
            aria-label={`Renommer ${category.name}`}
            className="h-10 flex-1"
            autoFocus
          />
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setConfirmingDelete(false)
              setEditing(true)
            }}
            aria-label={`Renommer ${category.name}`}
            className="flex-1 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
          >
            <p className="font-display text-[15px] uppercase leading-tight text-ink">
              {category.name}
            </p>
            <p className="font-mono text-[11px] text-ink-soft">
              {category.itemCount > 0
                ? `${category.itemCount} produit${
                    category.itemCount > 1 ? "s" : ""
                  }`
                : "vide"}
            </p>
          </button>
        )}

        {/* Suppression : petite poubelle (masquée pendant l'édition du nom). */}
        {!editing && (
          <button
            type="button"
            aria-label={`Supprimer le rayon ${category.name}`}
            aria-expanded={confirmingDelete}
            disabled={isPending}
            onClick={() => setConfirmingDelete((v) => !v)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brique focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px disabled:opacity-50"
          >
            <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>

      {/* Confirmation de suppression + remplacement si nécessaire */}
      {confirmingDelete && (
        <div className="mt-2.5 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2.5">
          {category.itemCount > 0 ? (
            <>
              <p className="text-[12px] leading-snug text-ink">
                Ce rayon contient {category.itemCount} produit
                {category.itemCount > 1 ? "s" : ""}. Choisis un rayon de
                remplacement pour y déplacer ces produits.
              </p>
              <select
                value={replacementId}
                onChange={(e) => setReplacementId(e.target.value)}
                className="h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 font-body text-base text-ink"
              >
                <option value="">— Rayon de remplacement —</option>
                {otherCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p className="text-[12px] leading-snug text-ink">
              Supprimer définitivement le rayon « {category.name} » ?
            </p>
          )}
          <div className="flex gap-1.5">
            <RisoButton
              size="sm"
              disabled={
                isPending || (category.itemCount > 0 && !replacementId)
              }
              onClick={() =>
                run(() =>
                  deleteCategory(
                    category.id,
                    category.itemCount > 0 ? replacementId : null,
                  ),
                )
              }
            >
              Confirmer
            </RisoButton>
            <RisoButton
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setConfirmingDelete(false)
                setReplacementId("")
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
    </li>
  )
}

function ArrowButton({
  label,
  disabled,
  title,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  /** Explication au survol quand le bouton est désactivé (bord de liste). */
  title?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-[6px] border-2 border-ink bg-paper-light text-[10px] leading-none text-ink",
        "active:translate-x-px active:translate-y-px",
        "disabled:opacity-30 disabled:active:translate-x-0 disabled:active:translate-y-0",
      )}
    >
      {children}
    </button>
  )
}
