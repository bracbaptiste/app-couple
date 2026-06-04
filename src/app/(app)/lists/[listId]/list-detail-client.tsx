"use client"

import { Plus, MoreHorizontal, Tag, Pencil, Trash2 } from "lucide-react"
import {
  useActionState,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react"

import { AddedByMarker } from "@/components/ui/added-by-marker"
import { CategoryHeader } from "@/components/ui/category-header"
import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { cn } from "@/lib/utils"
import { FormFeedback } from "@/app/(auth)/form-ui"

import {
  addItem,
  deleteItem,
  moveItemToCategory,
  toggleItem,
  updateItemDetails,
  type ActionResult,
} from "./actions"

type Color = "sauge" | "brique"

/** Membre du couple (pour résoudre le marqueur « ajouté par »). */
export type MemberView = {
  id: string
  name: string
  color: Color
}

/** Rayon disponible pour le regroupement et le menu « changer de rayon ». */
export type CategoryView = {
  id: string
  name: string
}

/** Un article de la liste, aplati pour le rendu. */
export type ItemView = {
  id: string
  libraryItemId: string
  name: string
  quantity: string | null
  note: string | null
  isChecked: boolean
  /** Rayon du produit, ou `null` si non rangé. */
  categoryId: string | null
  /** Profil ayant ajouté l'article, ou `null`. */
  addedBy: string | null
}

type ListDetailProps = {
  listId: string
  /** Rayons du couple, déjà triés par `position`. */
  categories: CategoryView[]
  members: MemberView[]
  items: ItemView[]
}

/** Clé de regroupement pour les articles sans rayon (placés en dernier). */
const NO_CATEGORY = "__none__"

/** Action interne du réducteur optimiste de cochage. */
type ToggleOptimistic = { id: string; checked: boolean }

/** Pilote l'écran détail : ajout, regroupement par rayon, section « Déjà pris ». */
export function ListDetail({
  listId,
  categories,
  members,
  items,
}: ListDetailProps) {
  // Index prénom/couleur par id de profil, pour le marqueur « ajouté par ».
  const membersById = useMemo(() => {
    const map = new Map<string, MemberView>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  // État optimiste du cochage, porté au niveau de la liste pour que l'article
  // CHANGE DE SECTION immédiatement (rayon ⇄ « Déjà pris »), sans attendre le
  // serveur. `useOptimistic` réapplique la valeur optimiste tant que la
  // transition est en cours, puis revient à `items` (donnée serveur) une fois
  // la Server Action terminée :
  //   - succès → `revalidatePath` a déjà mis `items` à jour : aucun saut visuel ;
  //   - échec  → `items` est inchangé : rollback visuel automatique.
  const [optimisticItems, toggleOptimistic] = useOptimistic(
    items,
    (current: ItemView[], { id, checked }: ToggleOptimistic): ItemView[] =>
      current.map((it) => (it.id === id ? { ...it, isChecked: checked } : it)),
  )
  const [isToggling, startToggle] = useTransition()
  const [toggleError, setToggleError] = useState<string | undefined>()

  function handleToggle(itemId: string, next: boolean) {
    setToggleError(undefined)
    startToggle(async () => {
      // Application optimiste DANS la transition : la section bouge tout de suite.
      toggleOptimistic({ id: itemId, checked: next })
      const result = await toggleItem(listId, itemId, next)
      // Pas de rollback manuel : si `result.ok === false`, la transition se
      // termine et `useOptimistic` restaure l'état serveur (article non déplacé).
      if (!result.ok) setToggleError(result.error)
    })
  }

  const unchecked = optimisticItems.filter((i) => !i.isChecked)
  const checked = optimisticItems.filter((i) => i.isChecked)

  // Regroupe les non-cochés par rayon, dans l'ordre des catégories
  // (categories.position côté serveur), « Sans rayon » en dernier.
  const groups = useMemo(() => {
    const byCat = new Map<string, ItemView[]>()
    for (const item of unchecked) {
      const key = item.categoryId ?? NO_CATEGORY
      const bucket = byCat.get(key)
      if (bucket) bucket.push(item)
      else byCat.set(key, [item])
    }

    const ordered: { id: string; name: string; items: ItemView[] }[] = []
    for (const cat of categories) {
      const bucket = byCat.get(cat.id)
      if (bucket?.length) ordered.push({ id: cat.id, name: cat.name, items: bucket })
    }
    const none = byCat.get(NO_CATEGORY)
    if (none?.length) {
      ordered.push({ id: NO_CATEGORY, name: "Sans rayon", items: none })
    }
    return ordered
    // `unchecked` est dérivé d'`optimisticItems` : on dépend de lui et `categories`.
  }, [optimisticItems, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = optimisticItems.length === 0

  return (
    <div className="flex flex-col gap-5">
      <AddItemField listId={listId} />

      {toggleError && (
        <p
          role="alert"
          className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
        >
          {toggleError}
        </p>
      )}

      {isEmpty ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Cette liste est vide. Ajoute ton premier article ci-dessus.
        </p>
      ) : (
        <>
          {/* Articles à prendre, groupés par rayon */}
          {groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-2">
              <CategoryHeader label={group.name} count={`×${group.items.length}`} />
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    listId={listId}
                    item={item}
                    categories={categories}
                    member={item.addedBy ? membersById.get(item.addedBy) ?? null : null}
                    onToggle={handleToggle}
                    toggling={isToggling}
                  />
                ))}
              </ul>
            </section>
          ))}

          {groups.length === 0 && (
            <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-5 text-center text-sm text-ink-soft">
              Tout est pris ! 🎉
            </p>
          )}

          {/* Section « Déjà pris » — articles cochés, atténués */}
          {checked.length > 0 && (
            <section className="flex flex-col gap-2 opacity-80">
              <div className="flex items-center justify-between gap-3 rounded-[6px] border-2 border-dashed border-ink px-3 py-1.5">
                <h4 className="font-display text-[13px] uppercase leading-none text-ink-soft">
                  Déjà pris
                </h4>
                <span className="font-mono text-[11px] font-bold text-ink-soft">
                  ×{checked.length}
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {checked.map((item) => (
                  <ItemRow
                    key={item.id}
                    listId={listId}
                    item={item}
                    categories={categories}
                    member={item.addedBy ? membersById.get(item.addedBy) ?? null : null}
                    onToggle={handleToggle}
                    toggling={isToggling}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Champ « Ajouter un article… » (DESIGN_SYSTEM §5.5)                         */
/* -------------------------------------------------------------------------- */

function AddItemField({ listId }: { listId: string }) {
  const action = addItem.bind(null, listId)
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    action,
    null,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Réinitialise le champ après un ajout réussi et garde le focus (saisie en rafale).
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset()
      inputRef.current?.focus()
    }
  }, [state])

  const error = state && !state.ok ? state.error : undefined

  return (
    <div className="flex flex-col gap-2">
      <form ref={formRef} action={formAction}>
        {/* Conteneur sauge, bordure encre, ombre encre — icône + à gauche. */}
        <div className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-sauge px-3 shadow-riso-ink focus-within:shadow-riso-brique">
          <Plus className="size-5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
          <input
            ref={inputRef}
            name="name"
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="Ajouter un article…"
            maxLength={60}
            required
            aria-label="Ajouter un article"
            className="h-12 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-body placeholder:text-ink/55"
          />
          <SubmitAdd />
        </div>
      </form>
      <FormFeedback error={error} />
    </div>
  )
}

/** Bouton « + » d'ajout, désactivé pendant l'envoi (via le statut du form). */
function SubmitAdd() {
  return (
    <RisoButton
      type="submit"
      size="sm"
      variant="primary"
      className="my-1.5 h-9 shrink-0"
      aria-label="Ajouter"
    >
      OK
    </RisoButton>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne d'article                                                            */
/* -------------------------------------------------------------------------- */

type ItemMode = null | "menu" | "category" | "details" | "delete"

function ItemRow({
  listId,
  item,
  categories,
  member,
  onToggle,
  toggling,
}: {
  listId: string
  item: ItemView
  categories: CategoryView[]
  member: MemberView | null
  /** Demande le (dé)cochage au parent, qui gère l'état optimiste partagé. */
  onToggle: (itemId: string, next: boolean) => void
  /** Une transition de cochage est en cours quelque part dans la liste. */
  toggling: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<ItemMode>(null)
  const [error, setError] = useState<string | undefined>()
  // Le cochage est piloté par le parent (état optimiste partagé) : on lit
  // directement `item.isChecked`, qui reflète déjà la valeur optimiste.
  const checked = item.isChecked

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else onSuccess?.()
    })
  }

  return (
    <li
      className={cn(
        "rounded-[10px] border-2 border-ink bg-paper-light p-2 transition-opacity",
        checked && "opacity-55",
      )}
    >
      <div className="flex items-center gap-1">
        <RisoCheckbox
          checked={checked}
          onCheckedChange={(next) => onToggle(item.id, next)}
          // On ne bloque pas la case pendant la transition : le cochage /
          // décochage rapide reste possible (chaque tap relance l'optimiste).
          aria-busy={toggling}
          aria-label={checked ? `Décocher ${item.name}` : `Cocher ${item.name}`}
        />

        {/* Nom + quantité */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[15px] font-medium leading-tight text-ink",
              checked && "line-through",
            )}
          >
            {item.name}
          </p>
          {(item.quantity || item.note) && (
            <p className="truncate font-mono text-[11px] text-ink-soft">
              {item.quantity}
              {item.quantity && item.note ? " · " : ""}
              {item.note}
            </p>
          )}
        </div>

        {/* Marqueur « ajouté par » */}
        <AddedByMarker
          color={member?.color ?? null}
          name={member?.name}
          className="mr-0.5"
        />

        {/* Menu « … » */}
        <button
          type="button"
          aria-label="Options de l’article"
          aria-expanded={mode !== null}
          onClick={() => setMode((m) => (m === null ? "menu" : null))}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <MoreHorizontal className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {/* Panneaux d'action (un seul à la fois) */}
      {mode === "menu" && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t-2 border-dashed border-ink pt-2">
          <RisoButton
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => setMode("category")}
          >
            <Tag aria-hidden /> Rayon
          </RisoButton>
          <RisoButton
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => setMode("details")}
          >
            <Pencil aria-hidden /> Quantité / note
          </RisoButton>
          <RisoButton
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => setMode("delete")}
          >
            <Trash2 aria-hidden /> Supprimer
          </RisoButton>
        </div>
      )}

      {mode === "category" && (
        <CategoryPanel
          item={item}
          categories={categories}
          disabled={isPending}
          onCancel={() => setMode(null)}
          onPick={(categoryId) =>
            run(
              () => moveItemToCategory(listId, item.libraryItemId, categoryId),
              () => setMode(null),
            )
          }
        />
      )}

      {mode === "details" && (
        <DetailsPanel
          item={item}
          disabled={isPending}
          onCancel={() => setMode(null)}
          onSave={(quantity, note) =>
            run(
              () => updateItemDetails(listId, item.id, quantity, note),
              () => setMode(null),
            )
          }
        />
      )}

      {mode === "delete" && (
        <div className="mt-2 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2">
          <p className="text-[12px] leading-snug text-ink">
            Retirer « {item.name} » de la liste ?
          </p>
          <div className="flex gap-1.5">
            <RisoButton
              size="sm"
              disabled={isPending}
              onClick={() => run(() => deleteItem(listId, item.id))}
            >
              Confirmer
            </RisoButton>
            <RisoButton
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setMode(null)}
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

/* -------------------------------------------------------------------------- */
/*  Panneau « changer de rayon »                                               */
/* -------------------------------------------------------------------------- */

function CategoryPanel({
  item,
  categories,
  disabled,
  onCancel,
  onPick,
}: {
  item: ItemView
  categories: CategoryView[]
  disabled: boolean
  onCancel: () => void
  onPick: (categoryId: string | null) => void
}) {
  const [value, setValue] = useState(item.categoryId ?? "")

  return (
    <div className="mt-2 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2">
      <label className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        Ranger dans le rayon
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        className="h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 font-body text-base text-ink"
      >
        <option value="">— Sans rayon —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex gap-1.5">
        <RisoButton
          size="sm"
          disabled={disabled}
          onClick={() => onPick(value || null)}
        >
          OK
        </RisoButton>
        <RisoButton variant="ghost" size="sm" disabled={disabled} onClick={onCancel}>
          Annuler
        </RisoButton>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Panneau « quantité / note »                                                */
/* -------------------------------------------------------------------------- */

function DetailsPanel({
  item,
  disabled,
  onCancel,
  onSave,
}: {
  item: ItemView
  disabled: boolean
  onCancel: () => void
  onSave: (quantity: string, note: string) => void
}) {
  const [quantity, setQuantity] = useState(item.quantity ?? "")
  const [note, setNote] = useState(item.note ?? "")

  return (
    <div className="mt-2 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2">
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Quantité
        </label>
        <input
          value={quantity}
          disabled={disabled}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Ex : 2 kg, ×3"
          maxLength={30}
          className="h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base text-ink outline-none placeholder:text-ink-soft/60 focus-visible:shadow-riso-sauge"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Note
        </label>
        <input
          value={note}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex : marque préférée"
          maxLength={200}
          className="h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base text-ink outline-none placeholder:text-ink-soft/60 focus-visible:shadow-riso-sauge"
        />
      </div>
      <div className="flex gap-1.5">
        <RisoButton
          size="sm"
          disabled={disabled}
          onClick={() => onSave(quantity, note)}
        >
          Enregistrer
        </RisoButton>
        <RisoButton variant="ghost" size="sm" disabled={disabled} onClick={onCancel}>
          Annuler
        </RisoButton>
      </div>
    </div>
  )
}
