"use client"

import { Search, Plus, Pencil, Trash2, Check, X } from "lucide-react"
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"

import { CategoryHeader } from "@/components/ui/category-header"
import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { cn } from "@/lib/utils"
import { useRealtimeLibrary } from "@/lib/realtime"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"
import { FormFeedback } from "@/app/(auth)/form-ui"

import {
  addLibraryItem,
  deleteLibraryItem,
  updateLibraryItem,
  sendManyToList,
  type ActionResult,
} from "./actions"

/** Niveau de fréquence à 4 paliers (cf. `frequencyLevel` côté serveur). */
export type Frequency = 1 | 2 | 3 | 4

/** Un produit de la bibliothèque, aplati pour le rendu. */
export type LibraryItemView = {
  id: string
  name: string
  usageCount: number
  /** ISO — départage les égalités d'usage_count au tri. */
  lastUsedAt: string
  frequency: Frequency
  categoryId: string | null
}

/** Un rayon et ses produits, déjà triés côté serveur. */
export type CategoryGroup = {
  id: string
  name: string
  items: LibraryItemView[]
}

/** Liste cible proposée dans la feuille « Envoyer vers… ». */
export type ListChoice = {
  id: string
  name: string
}

/** Un rayon proposé dans les sélecteurs de catégorie (création / édition). */
export type CategoryChoice = {
  id: string
  name: string
}

/**
 * Style partagé des `<select>` de rayon (création + édition). Native select :
 * accessible, clavier/mobile gratuits ; habillé aux codes Riso (bordure encre,
 * fond crème). La flèche par défaut du navigateur est conservée (lisible).
 */
const SELECT_CLASS =
  "h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base font-medium text-ink outline-none focus-visible:shadow-riso-sauge"

/** Libellé lisible de chaque palier de fréquence. */
const FREQUENCY_LABEL: Record<Frequency, string> = {
  4: "Très fréquent",
  3: "Fréquent",
  2: "Occasionnel",
  1: "Rare",
}

/** Normalise un libellé pour la recherche (insensible casse + accents). */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Comme `normalize`, mais écrase aussi les espaces superflus (bords + doublons
 * internes). Sert à comparer « existe déjà ? » pour éviter les doublons du type
 * "Carottes" vs "carottes ".
 */
function normalizeLoose(value: string): string {
  return normalize(value).replace(/\s+/g, " ").trim()
}

/**
 * Pilote la Bibliothèque : ajout d'un article, barre de recherche, groupes par
 * rayon, pastilles de fréquence. Le flux principal est la SÉLECTION MULTIPLE :
 * on coche plusieurs produits puis un bouton unique les envoie tous vers une
 * liste. Chaque produit garde aussi ses actions individuelles (renommer / supprimer).
 */
export function LibraryBrowser({
  groups,
  lists,
  categories,
  total,
  coupleId,
}: {
  groups: CategoryGroup[]
  lists: ListChoice[]
  categories: CategoryChoice[]
  total: number
  coupleId: string
}) {
  // Temps réel : un produit ajouté / supprimé / recatégorisé par le partenaire
  // (ou une liste créée) rafraîchit la bibliothèque sans refresh manuel.
  useRealtimeLibrary(coupleId)

  // Cache de lecture (fondation hors ligne) : dernière vue connue de la biblio.
  useOfflineCache("library", { groups, lists, total })

  const [query, setQuery] = useState("")
  // Produits cochés pour l'export groupé (par id, survit au filtrage).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Ouvre la feuille « Envoyer vers… » pour la sélection courante.
  const [sheetOpen, setSheetOpen] = useState(false)

  // Ensemble des ids de produits encore présents (pour ignorer une sélection
  // devenue fantôme : produit supprimé / renommé côté partenaire).
  const liveIds = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups) for (const it of g.items) set.add(it.id)
    return set
  }, [groups])

  // Noms normalisés des produits existants — pour décider si le texte saisi
  // correspond déjà à un article (sinon : proposer de l'ajouter).
  const existingNames = useMemo(() => {
    const set = new Set<string>()
    for (const g of groups)
      for (const it of g.items) set.add(normalizeLoose(it.name))
    return set
  }, [groups])

  // Sélection effective = ce qui est coché ET toujours présent. On ne purge pas
  // l'état (pas de setState en effet) : on dérive, ce qui suffit à l'envoi et au
  // décompte. Les ids fantômes sont aussi bornés côté serveur (sendManyToList).
  const selectedIds = useMemo(
    () => [...selected].filter((id) => liveIds.has(id)),
    [selected, liveIds],
  )

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Filtre les produits par nom (le tri/regroupement reste celui du serveur).
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) => normalize(it.name).includes(q)),
      }))
      .filter((g) => g.items.length > 0)
  }, [groups, query])

  const hasResults = filtered.some((g) => g.items.length > 0)
  const selectedCount = selectedIds.length

  return (
    <div className="flex flex-col gap-5">
      <SmartItemField
        query={query}
        onChange={setQuery}
        existingNames={existingNames}
      />

      {total === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Ta bibliothèque est vide. Ajoute un article ci-dessus, ou il s’y rangera
          automatiquement dès que tu en mets un dans une liste.
        </p>
      ) : !hasResults ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Aucun article ne correspond à « {query.trim()} ».
        </p>
      ) : (
        filtered.map((group) => (
          <section key={group.id} className="flex flex-col gap-2">
            <CategoryHeader label={group.name} count={`×${group.items.length}`} />
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  categories={categories}
                  selected={selected.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Espace pour que la dernière ligne ne soit pas masquée par la barre. */}
      {selectedCount > 0 && <div aria-hidden className="h-16" />}

      {selectedCount > 0 && (
        <SelectionBar
          count={selectedCount}
          hasLists={lists.length > 0}
          onSend={() => setSheetOpen(true)}
          onClear={() => setSelected(new Set())}
        />
      )}

      {sheetOpen && (
        <SendSheet
          itemIds={selectedIds}
          count={selectedCount}
          lists={lists}
          onClose={() => setSheetOpen(false)}
          onDone={() => {
            setSheetOpen(false)
            setSelected(new Set())
          }}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Champ intelligent : rechercher OU ajouter un article                       */
/* -------------------------------------------------------------------------- */

/**
 * Une seule barre qui fait les deux à la fois :
 *  - en tapant, on filtre la liste en dessous (via `onChange` → `query`) ;
 *  - si le texte saisi ne correspond EXACTEMENT à aucun article existant (casse
 *    et espaces ignorés) et n'est pas vide, un bouton vert propose de l'ajouter.
 * Un ajout réussi vide le champ et redonne le focus (saisie en rafale). Le rayon
 * n'est pas demandé ici : le serveur le devine, ajustable plus tard via le crayon.
 */
function SmartItemField({
  query,
  onChange,
  existingNames,
}: {
  query: string
  onChange: (next: string) => void
  existingNames: Set<string>
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)

  const trimmed = query.trim()
  // Existe déjà ? Comparaison insensible à la casse, aux accents et aux espaces.
  const alreadyExists = existingNames.has(normalizeLoose(query))
  const canAdd = trimmed.length > 0 && !alreadyExists

  function add() {
    if (!canAdd) return
    setError(undefined)
    startTransition(async () => {
      const result = await addLibraryItem(query, null)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onChange("")
      inputRef.current?.focus()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-paper-light px-3 shadow-riso-ink focus-within:shadow-riso-sauge">
        <Search className="size-5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canAdd) {
              e.preventDefault()
              add()
            }
          }}
          placeholder="Rechercher ou ajouter un article…"
          maxLength={60}
          aria-label="Rechercher ou ajouter un article"
          className="h-12 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-body placeholder:text-ink/55"
        />
      </div>

      {canAdd && (
        <RisoButton
          size="sm"
          disabled={isPending}
          onClick={add}
          aria-busy={isPending}
          className="self-start bg-sauge text-ink shadow-riso-ink-sm"
        >
          <Plus aria-hidden /> Ajouter « {trimmed} »
        </RisoButton>
      )}

      <FormFeedback error={error} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Indicateur de fréquence (4 pastilles)                                      */
/* -------------------------------------------------------------------------- */

/**
 * Quatre pastilles : les `frequency` premières sont pleines (encre), les autres
 * vides (contour). Le libellé textuel reste accessible aux lecteurs d'écran.
 */
function FrequencyDots({ frequency }: { frequency: Frequency }) {
  return (
    <span
      className="flex shrink-0 items-center gap-1"
      role="img"
      aria-label={`Fréquence : ${FREQUENCY_LABEL[frequency].toLowerCase()}`}
      title={FREQUENCY_LABEL[frequency]}
    >
      {[1, 2, 3, 4].map((dot) => (
        <span
          key={dot}
          aria-hidden
          // §5.8 : carrés 9px, bordure 1.5px encre, remplis en brique selon la fréquence.
          className={cn(
            "size-[9px] rounded-[2px] border-[1.5px] border-ink",
            dot <= frequency ? "bg-brique" : "bg-transparent",
          )}
        />
      ))}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne de produit                                                           */
/* -------------------------------------------------------------------------- */

function LibraryRow({
  item,
  categories,
  selected,
  onToggleSelect,
}: {
  item: LibraryItemView
  categories: CategoryChoice[]
  selected: boolean
  onToggleSelect: () => void
}) {
  const [isPending, startTransition] = useTransition()
  // Un seul panneau ouvert à la fois sous la ligne : édition OU suppression.
  const [mode, setMode] = useState<null | "edit" | "delete">(null)
  const [name, setName] = useState(item.name)
  const [categoryId, setCategoryId] = useState<string | null>(item.categoryId)
  const [error, setError] = useState<string | undefined>()

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else onSuccess?.()
    })
  }

  /** Ouvre le panneau d'édition en repartant des valeurs courantes du produit. */
  function openEdit() {
    setName(item.name)
    setCategoryId(item.categoryId)
    setError(undefined)
    setMode("edit")
  }

  /** Enregistre nom + rayon ensemble. No-op géré côté serveur si rien ne change. */
  function saveEdit() {
    if (!name.trim()) {
      setError("Entre un nom d’article.")
      return
    }
    run(
      () => updateLibraryItem(item.id, name, categoryId),
      () => setMode(null),
    )
  }

  const editing = mode === "edit"

  return (
    <li
      className={cn(
        "rounded-[10px] border-2 border-ink p-2.5 transition-colors",
        selected ? "bg-sauge/40" : "bg-paper-light",
      )}
    >
      <div className="flex items-center gap-1.5">
        {/* Case de sélection pour l'export groupé */}
        <RisoCheckbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={
            selected ? `Désélectionner ${item.name}` : `Sélectionner ${item.name}`
          }
        />

        <FrequencyDots frequency={item.frequency} />

        {/* Nom : touche-le pour ouvrir le panneau d'édition (nom + rayon). La
            modification se répercute sur toutes les listes contenant l'article. */}
        <button
          type="button"
          disabled={isPending}
          aria-expanded={editing}
          onClick={() => (editing ? setMode(null) : openEdit())}
          aria-label={`Modifier ${item.name}`}
          className="min-w-0 flex-1 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50"
        >
          <p className="truncate text-[15px] font-medium leading-tight text-ink">
            {item.name}
          </p>
          <p className="font-mono text-[11px] text-ink-soft">
            {FREQUENCY_LABEL[item.frequency]} · {item.usageCount} usage
            {item.usageCount > 1 ? "s" : ""}
          </p>
        </button>

        {/* Modifier (crayon) : ouvre / ferme le même panneau que le tap sur le nom. */}
        <button
          type="button"
          aria-label={`Modifier ${item.name}`}
          aria-expanded={editing}
          disabled={isPending}
          onClick={() => (editing ? setMode(null) : openEdit())}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px disabled:opacity-50"
        >
          <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
        </button>

        {/* Supprimer */}
        <button
          type="button"
          aria-label={`Supprimer ${item.name}`}
          aria-expanded={mode === "delete"}
          disabled={isPending}
          onClick={() => {
            setMode((m) => (m === "delete" ? null : "delete"))
            setError(undefined)
          }}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brique focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px disabled:opacity-50"
        >
          <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {/* Panneau d'édition combiné : nom + rayon */}
      {editing && (
        <div className="mt-2 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Nom
            </label>
            <input
              value={name}
              disabled={isPending}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  saveEdit()
                } else if (e.key === "Escape") {
                  e.preventDefault()
                  setMode(null)
                  setError(undefined)
                }
              }}
              maxLength={60}
              autoFocus
              aria-label={`Renommer ${item.name}`}
              className="h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base font-medium text-ink outline-none focus-visible:shadow-riso-sauge"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              Rayon
            </label>
            <select
              value={categoryId ?? ""}
              disabled={isPending}
              onChange={(e) => setCategoryId(e.target.value || null)}
              aria-label="Rayon de l’article"
              className={SELECT_CLASS}
            >
              <option value="">Sans rayon</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5">
            <RisoButton size="sm" disabled={isPending} onClick={saveEdit}>
              Enregistrer
            </RisoButton>
            <RisoButton
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setMode(null)
                setError(undefined)
              }}
            >
              Annuler
            </RisoButton>
          </div>
        </div>
      )}

      {/* Confirmation de suppression */}
      {mode === "delete" && (
        <div className="mt-2 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-2">
          <p className="text-[12px] leading-snug text-ink">
            Supprimer « {item.name} » de la bibliothèque ? Cela efface sa mémoire
            de rangement et de fréquence.
          </p>
          <div className="flex gap-1.5">
            <RisoButton
              size="sm"
              disabled={isPending}
              onClick={() =>
                run(
                  () => deleteLibraryItem(item.id),
                  () => setMode(null),
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
                setMode(null)
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

/* -------------------------------------------------------------------------- */
/*  Barre d'action de sélection (contextuelle, ancrée en bas)                  */
/* -------------------------------------------------------------------------- */

/**
 * Barre contextuelle visible dès qu'au moins un produit est coché. Elle recouvre
 * la BottomNav le temps de la sélection (pattern « action bar » mobile) : un
 * bouton unique envoie toute la sélection vers une liste, une croix l'efface.
 */
function SelectionBar({
  count,
  hasLists,
  onSend,
  onClear,
}: {
  count: number
  hasLists: boolean
  onSend: () => void
  onClear: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-[2.5px] border-ink bg-paper-light px-3 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-riso-ink">
      <div className="mx-auto flex w-full max-w-sm items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          aria-label="Effacer la sélection"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-paper-light text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px"
        >
          <X className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
        <span className="font-mono text-[12px] font-bold text-ink">
          {count} sélectionné{count > 1 ? "s" : ""}
        </span>
        <RisoButton
          size="sm"
          variant="primary"
          disabled={!hasLists}
          onClick={onSend}
          title={hasLists ? undefined : "Crée d’abord une liste"}
          className="ml-auto"
        >
          <Plus aria-hidden /> Ajouter à une liste
        </RisoButton>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Feuille « Envoyer vers quelle liste ? »                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bottom-sheet mobile listant les listes du couple. Sélectionner une liste y
 * envoie TOUS les produits cochés (un seul geste), renforce leur fréquence, puis
 * referme la feuille et vide la sélection. Échec → message d'erreur in-situ.
 */
function SendSheet({
  itemIds,
  count,
  lists,
  onClose,
  onDone,
}: {
  itemIds: string[]
  count: number
  lists: ListChoice[]
  onClose: () => void
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()
  const [doneListId, setDoneListId] = useState<string | null>(null)

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

  function pick(listId: string) {
    setError(undefined)
    startTransition(async () => {
      const result = await sendManyToList(itemIds, listId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Coche brièvement la liste choisie, puis referme + vide la sélection.
      setDoneListId(listId)
      setTimeout(onDone, 600)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Envoyer la sélection vers une liste"
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
              Envoyer vers quelle liste ?
            </h3>
            <p className="mt-1 truncate font-mono text-[11px] text-ink-soft">
              {count} article{count > 1 ? "s" : ""} sélectionné{count > 1 ? "s" : ""}
            </p>
          </div>
          <RisoButton variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </RisoButton>
        </div>

        {lists.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-soft">
            Aucune liste pour l’instant. Crée d’abord une liste de courses.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 overflow-y-auto p-3">
            {lists.map((list) => (
              <li key={list.id}>
                <button
                  type="button"
                  onClick={() => pick(list.id)}
                  disabled={isPending}
                  className={cn(
                    "flex h-12 w-full items-center justify-between gap-2 rounded-[8px] border-2 border-ink px-3 text-left text-[15px] font-medium text-ink outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-60",
                    doneListId === list.id ? "bg-sauge shadow-riso-ink-sm" : "bg-paper-light",
                  )}
                >
                  <span className="truncate">{list.name}</span>
                  {doneListId === list.id && (
                    <Check className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p
            role="alert"
            className="mx-3 mb-3 rounded-[8px] border-2 border-brique bg-brique/10 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-ink"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
