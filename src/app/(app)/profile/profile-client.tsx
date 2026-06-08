"use client"

import { Trash2 } from "lucide-react"
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { cn } from "@/lib/utils"
import { Field, FormFeedback, SubmitButton } from "@/app/(auth)/form-ui"
import { signOut } from "@/app/(auth)/actions"

import {
  addCategory,
  deleteCategory,
  leaveCouple,
  moveCategory,
  renameCategory,
  updateProfile,
  type ActionResult,
} from "./actions"

type Color = "sauge" | "brique"

export type CategoryView = {
  id: string
  name: string
  /** Nombre de produits (bibliothèque) rattachés au rayon. */
  itemCount: number
}

type ProfileManagerProps = {
  displayName: string
  color: Color
  /** Couleur utilisée par le/la partenaire, ou null si seul·e dans l'espace. */
  partnerColor: Color | null
  categories: CategoryView[]
}

const COLOR_META: Record<Color, { label: string; swatch: string }> = {
  sauge: { label: "Sauge", swatch: "bg-sauge text-ink" },
  brique: { label: "Brique", swatch: "bg-brique text-paper-light" },
}

/** Pilote toutes les sections éditables de l'écran Profil. */
export function ProfileManager({
  displayName,
  color,
  partnerColor,
  categories,
}: ProfileManagerProps) {
  return (
    <div className="flex flex-col gap-5">
      <IdentitySection
        displayName={displayName}
        color={color}
        partnerColor={partnerColor}
      />
      <CategoriesSection categories={categories} />
      <DangerZone />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Identité : prénom + couleur                                                */
/* -------------------------------------------------------------------------- */

function IdentitySection({
  displayName,
  color,
  partnerColor,
}: {
  displayName: string
  color: Color
  partnerColor: Color | null
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    updateProfile,
    null,
  )
  const [selected, setSelected] = useState<Color>(color)

  const error = state && !state.ok ? state.error : undefined
  const saved = state?.ok ? "Profil enregistré ✓" : undefined

  return (
    <RisoCard shadow="sauge" padding="lg">
      <h2 className="mb-5 font-display text-lg uppercase text-ink">
        Mon identité
      </h2>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <Field label="Prénom" htmlFor="display_name">
          <RisoInput
            id="display_name"
            name="display_name"
            type="text"
            autoComplete="given-name"
            defaultValue={displayName}
            maxLength={40}
            required
          />
        </Field>

        <Field label="Ma couleur" htmlFor="color">
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(COLOR_META) as Color[]).map((c) => {
              const meta = COLOR_META[c]
              // Couleur indisponible : prise par le/la partenaire (≠ la mienne).
              const taken = partnerColor === c && c !== color
              const isSelected = selected === c
              return (
                <button
                  key={c}
                  type="button"
                  disabled={taken}
                  aria-pressed={isSelected}
                  onClick={() => setSelected(c)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border-2 border-ink px-3 py-2.5 transition-[box-shadow,transform]",
                    isSelected
                      ? "shadow-riso-ink-sm"
                      : "opacity-60 shadow-none active:translate-x-px active:translate-y-px",
                    taken && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-[7px] border-2 border-ink font-display text-[13px] uppercase",
                      meta.swatch,
                    )}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                  <span className="font-display text-sm uppercase text-ink">
                    {meta.label}
                  </span>
                </button>
              )
            })}
          </div>
          <input type="hidden" name="color" value={selected} />
          {partnerColor && (
            <p className="mt-1 text-[12px] leading-snug text-ink-soft">
              La couleur de ton/ta partenaire ne peut pas être choisie.
            </p>
          )}
        </Field>

        <FormFeedback error={error} message={saved} />

        <SubmitButton pendingLabel="Enregistrement…">
          Enregistrer
        </SubmitButton>
      </form>
    </RisoCard>
  )
}

/* -------------------------------------------------------------------------- */
/*  Catégories                                                                 */
/* -------------------------------------------------------------------------- */

function CategoriesSection({ categories }: { categories: CategoryView[] }) {
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
      <h2 className="mb-1 font-display text-lg uppercase text-ink">
        Rayons du couple
      </h2>
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
            onClick={() => run(() => moveCategory(category.id, "up"))}
          >
            ▲
          </ArrowButton>
          <ArrowButton
            label="Descendre"
            disabled={isLast || isPending}
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
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
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

/* -------------------------------------------------------------------------- */
/*  Zone sensible : déconnexion + quitter l'espace                            */
/* -------------------------------------------------------------------------- */

function DangerZone() {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | undefined>()

  function leave() {
    setError(undefined)
    startTransition(async () => {
      // Succès → la Server Action redirige (pas de retour). On ne gère ici
      // qu'un éventuel échec renvoyé sans redirection.
      const result = await leaveCouple()
      if (result && !result.ok) setError(result.error)
    })
  }

  return (
    <RisoCard shadow="ink" padding="lg">
      <h2 className="mb-4 font-display text-lg uppercase text-ink">Compte</h2>

      <div className="flex flex-col gap-3">
        {/* Déconnexion : Server Action via <form> (progressive enhancement). */}
        <form action={signOut} className="contents">
          <RisoButton
            type="submit"
            variant="secondary"
            className="h-12 w-full text-sm"
          >
            Se déconnecter
          </RisoButton>
        </form>

        {!confirming ? (
          <RisoButton
            variant="ghost"
            className="h-12 w-full border-brique text-sm text-brique"
            onClick={() => setConfirming(true)}
          >
            Quitter l&apos;espace couple
          </RisoButton>
        ) : (
          <div className="flex flex-col gap-2.5 rounded-[10px] border-2 border-brique bg-brique/5 p-3">
            <p className="text-[13px] leading-snug text-ink">
              Tu vas quitter l&apos;espace couple. Tu perdras l&apos;accès aux
              listes et rayons partagés (ils restent pour ton/ta partenaire). Tu
              devras recréer ou rejoindre un espace ensuite.
            </p>
            <div className="flex gap-2">
              <RisoButton
                variant="primary"
                className="h-11 flex-1 text-sm"
                disabled={isPending}
                onClick={leave}
              >
                {isPending ? "Sortie…" : "Oui, quitter"}
              </RisoButton>
              <RisoButton
                variant="secondary"
                className="h-11 flex-1 text-sm"
                disabled={isPending}
                onClick={() => setConfirming(false)}
              >
                Annuler
              </RisoButton>
            </div>
            {error && (
              <p role="alert" className="text-[12px] font-medium text-brique">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </RisoCard>
  )
}
