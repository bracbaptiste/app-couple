"use client"

import { Plus, MoreHorizontal, Tag, Pencil, Trash2, Check } from "lucide-react"
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
import { useRealtimeListItems } from "@/lib/realtime"
import { runMutation } from "@/lib/offline/mutation-queue"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"
import { useOnlineStatus } from "@/lib/offline/use-online-status"
import { FormFeedback } from "@/app/(auth)/form-ui"

import { type ActionResult } from "./actions"

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
  coupleId: string
  /** Rayons du couple, déjà triés par `position`. */
  categories: CategoryView[]
  members: MemberView[]
  items: ItemView[]
}

/** Clé de regroupement pour les articles sans rayon (placés en dernier). */
const NO_CATEGORY = "__none__"

/**
 * Actions internes du réducteur optimiste. Deux mutations déplacent un article
 * d'une section à l'autre sans attendre le serveur :
 *   - `toggle`        : coché ⇄ « Déjà pris » (porté par le list_item) ;
 *   - `recategorize`  : changement de rayon (porté par le library_item, donc
 *                       appliqué à TOUS les articles partageant ce produit).
 */
type OptimisticAction =
  | { kind: "toggle"; id: string; checked: boolean }
  | { kind: "recategorize"; libraryItemId: string; categoryId: string | null }

/**
 * Réducteur partagé : applique UNE action de déplacement à la liste d'articles.
 * Réutilisé à deux endroits avec une sémantique différente :
 *   - dans `useOptimistic` (feedback EN LIGNE, annulé en fin de transition) ;
 *   - sur l'overlay HORS LIGNE (changements PERSISTANTS tant qu'on n'a pas
 *     resynchronisé), pour que la case ne « rebondisse » pas quand la transition
 *     se termine sans rafraîchissement serveur.
 */
function applyOptimisticAction(
  current: ItemView[],
  action: OptimisticAction,
): ItemView[] {
  if (action.kind === "toggle") {
    return current.map((it) =>
      it.id === action.id ? { ...it, isChecked: action.checked } : it,
    )
  }
  // Recatégorisation : le rayon vit sur le library_item, donc on l'applique à
  // tous les articles de la liste qui pointent vers ce même produit.
  return current.map((it) =>
    it.libraryItemId === action.libraryItemId
      ? { ...it, categoryId: action.categoryId }
      : it,
  )
}

/** Pilote l'écran détail : ajout, regroupement par rayon, section « Déjà pris ». */
export function ListDetail({
  listId,
  coupleId,
  categories,
  members,
  items,
}: ListDetailProps) {
  // Temps réel : ajout / cochage / modif / suppression côté partenaire (sur les
  // articles de cette liste, ou une recatégorisation/renommage de rayon)
  // rafraîchit l'écran sans refresh manuel. `useOptimistic` reste prioritaire
  // pour les actions locales ; `refresh()` ne met à jour que la donnée de base.
  useRealtimeListItems(listId, coupleId)

  // Cache de lecture : on enregistre la dernière copie connue de l'écran à
  // chaque chargement (en ligne). Fondation pour la consultation hors ligne
  // (cf. limites dans use-offline-cache.ts).
  useOfflineCache(`list-items:${listId}`, { items, categories, members })

  const online = useOnlineStatus()

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
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    applyOptimisticAction,
  )
  const [isPending, startAction] = useTransition()
  const [actionError, setActionError] = useState<string | undefined>()

  // Overlay HORS LIGNE : `useOptimistic` annule sa valeur dès que la transition
  // se termine, or hors ligne le serveur ne revalide rien → sans cet overlay, la
  // case cochée « rebondirait » à l'état serveur. On accumule donc les actions
  // faites sans réseau ici (elles persistent) et on les rejoue sur l'affichage.
  // Au retour du réseau, le rejeu de la file + `router.refresh()` (porté par
  // l'OfflineIndicator) ramène la vérité serveur : on vide alors l'overlay.
  const [offlinePatches, setOfflinePatches] = useState<OptimisticAction[]>([])
  const wasOnline = useRef(true)
  useEffect(() => {
    if (online && !wasOnline.current) setOfflinePatches([])
    wasOnline.current = online
  }, [online])

  // Affichage = état serveur + optimiste en vol + patches hors ligne persistants.
  const displayItems = useMemo(
    () => offlinePatches.reduce(applyOptimisticAction, optimisticItems),
    [optimisticItems, offlinePatches],
  )

  /** Mémorise un changement de section s'il est fait hors ligne (sinon no-op). */
  function rememberIfOffline(action: OptimisticAction) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setOfflinePatches((prev) => [...prev, action])
    }
  }

  function handleToggle(itemId: string, next: boolean) {
    setActionError(undefined)
    const action: OptimisticAction = { kind: "toggle", id: itemId, checked: next }
    startAction(async () => {
      // Application optimiste DANS la transition : la section bouge tout de suite.
      applyOptimistic(action)
      rememberIfOffline(action)
      // `runMutation` exécute la Server Action en ligne, ou enfile l'action hors
      // ligne en renvoyant { ok: true } (l'overlay garde le visuel à jour).
      const result = await runMutation("toggleItem", {
        listId,
        itemId,
        checked: next,
      })
      if (!result.ok) setActionError(result.error)
    })
  }

  /**
   * Change le rayon d'un article. Le déplacement vers la nouvelle section est
   * optimiste (l'article apparaît immédiatement sous le bon rayon) ; le serveur
   * met à jour `library_items.category_id`, ce qui RECLASSE le produit partout
   * et oriente tous ses futurs ajouts. En cas d'échec, `useOptimistic` restaure
   * l'état serveur (rollback automatique) et l'erreur s'affiche en tête de liste.
   */
  function handleRecategorize(
    libraryItemId: string,
    categoryId: string | null,
  ) {
    setActionError(undefined)
    const action: OptimisticAction = {
      kind: "recategorize",
      libraryItemId,
      categoryId,
    }
    startAction(async () => {
      applyOptimistic(action)
      rememberIfOffline(action)
      const result = await runMutation("moveItemToCategory", {
        listId,
        libraryItemId,
        categoryId,
      })
      if (!result.ok) setActionError(result.error)
    })
  }

  const unchecked = displayItems.filter((i) => !i.isChecked)
  const checked = displayItems.filter((i) => i.isChecked)

  // Regroupe les non-cochés par rayon, dans l'ordre des catégories
  // (categories.position côté serveur), « Sans rayon » en dernier.
  const groups = useMemo(() => {
    // Rayons connus du couple : un article pointant vers un rayon absent (rayon
    // supprimé, ou category_id orphelin) retombe dans « Sans rayon » au lieu de
    // disparaître silencieusement de la liste.
    const knownCategoryIds = new Set(categories.map((c) => c.id))
    const byCat = new Map<string, ItemView[]>()
    for (const item of unchecked) {
      const key =
        item.categoryId && knownCategoryIds.has(item.categoryId)
          ? item.categoryId
          : NO_CATEGORY
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
    // `unchecked` est dérivé de `displayItems` : on dépend de lui et `categories`.
  }, [displayItems, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  const isEmpty = displayItems.length === 0

  return (
    <div className="flex flex-col gap-5">
      <AddItemField listId={listId} />

      {actionError && (
        <p
          role="alert"
          className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
        >
          {actionError}
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
                    onRecategorize={handleRecategorize}
                    toggling={isPending}
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
                    onRecategorize={handleRecategorize}
                    toggling={isPending}
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
  // Adaptateur client : on lit le champ et on passe par `runMutation` pour que
  // l'ajout fonctionne aussi hors ligne (mis en file). LIMITE V1 : hors ligne,
  // l'article n'apparaît PAS tout de suite dans la liste (pas d'insertion
  // optimiste — la résolution bibliothèque/rayon est côté serveur) ; il
  // apparaît après la resynchronisation. Le champ se vide quand même (feedback).
  const action = async (
    _prev: ActionResult | null,
    formData: FormData,
  ): Promise<ActionResult> =>
    runMutation("addItem", {
      listId,
      rawName: String(formData.get("name") ?? ""),
    })

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
  onRecategorize,
  toggling,
}: {
  listId: string
  item: ItemView
  categories: CategoryView[]
  member: MemberView | null
  /** Demande le (dé)cochage au parent, qui gère l'état optimiste partagé. */
  onToggle: (itemId: string, next: boolean) => void
  /** Demande le changement de rayon au parent (optimiste + mémoire couple). */
  onRecategorize: (libraryItemId: string, categoryId: string | null) => void
  /** Une transition (cochage / recatégorisation) est en cours dans la liste. */
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
            <Tag aria-hidden /> Changer de catégorie
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
        <CategorySheet
          item={item}
          categories={categories}
          onClose={() => setMode(null)}
          onPick={(categoryId) => {
            // Déplacement optimiste géré par le parent ; on referme aussitôt la
            // feuille (l'article a déjà rejoint sa nouvelle section).
            onRecategorize(item.libraryItemId, categoryId)
            setMode(null)
          }}
        />
      )}

      {mode === "details" && (
        <DetailsPanel
          item={item}
          disabled={isPending}
          onCancel={() => setMode(null)}
          onSave={(quantity, note) =>
            run(
              () =>
                runMutation("updateItemDetails", {
                  listId,
                  itemId: item.id,
                  quantity,
                  note,
                }),
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
              onClick={() =>
                run(() => runMutation("deleteItem", { listId, itemId: item.id }))
              }
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
/*  Feuille « changer de catégorie »                                           */
/* -------------------------------------------------------------------------- */

/**
 * Bottom-sheet mobile listant les rayons du couple. Sélectionner un rayon
 * change la catégorie du produit (mémoire partagée) ; « Sans rayon » la retire.
 * Le rayon courant est mis en évidence — un `category_id` orphelin (rayon
 * supprimé) retombe sur « Sans rayon » pour ne jamais afficher une coche fantôme.
 */
function CategorySheet({
  item,
  categories,
  onClose,
  onPick,
}: {
  item: ItemView
  categories: CategoryView[]
  onClose: () => void
  onPick: (categoryId: string | null) => void
}) {
  // Ferme à la touche Échap et verrouille le défilement de l'arrière-plan.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  // Rayon effectivement actif (null si non rangé OU rayon supprimé).
  const currentId =
    item.categoryId && categories.some((c) => c.id === item.categoryId)
      ? item.categoryId
      : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Changer la catégorie de ${item.name}`}
    >
      {/* Voile : ferme au tap. */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />

      {/* Panneau ancré en bas, largeur mobile. */}
      <div className="relative flex max-h-[75vh] w-full max-w-sm flex-col rounded-t-[14px] border-2 border-ink bg-paper-light shadow-riso-ink">
        <div className="flex items-start justify-between gap-3 border-b-2 border-dashed border-ink px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-display text-[15px] uppercase leading-none text-ink">
              Changer de catégorie
            </h3>
            <p className="mt-1 truncate font-mono text-[11px] text-ink-soft">
              {item.name}
            </p>
          </div>
          <RisoButton variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </RisoButton>
        </div>

        <ul className="flex flex-col gap-1.5 overflow-y-auto p-3">
          <li>
            <CategoryChoice
              label="Sans rayon"
              selected={currentId === null}
              onClick={() => onPick(null)}
            />
          </li>
          {categories.map((c) => (
            <li key={c.id}>
              <CategoryChoice
                label={c.name}
                selected={currentId === c.id}
                onClick={() => onPick(c.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Une ligne sélectionnable de la feuille de catégories (rayon courant coché). */
function CategoryChoice({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-12 w-full items-center justify-between gap-2 rounded-[8px] border-2 border-ink px-3 text-left text-[15px] font-medium text-ink outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none",
        selected ? "bg-sauge shadow-riso-ink-sm" : "bg-paper-light",
      )}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />}
    </button>
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
