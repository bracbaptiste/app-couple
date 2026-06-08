"use client"

import { Search, Plus, Trash2, Check } from "lucide-react"
import { useEffect, useMemo, useState, useTransition } from "react"

import { CategoryHeader } from "@/components/ui/category-header"
import { RisoButton } from "@/components/ui/riso-button"
import { cn } from "@/lib/utils"
import { useRealtimeLibrary } from "@/lib/realtime"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"

import { deleteLibraryItem, sendToList, type ActionResult } from "./actions"

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
 * Pilote la Bibliothèque : barre de recherche, groupes par rayon, pastilles de
 * fréquence, et les deux actions par produit (envoyer vers une liste / supprimer).
 */
export function LibraryBrowser({
  groups,
  lists,
  total,
  coupleId,
}: {
  groups: CategoryGroup[]
  lists: ListChoice[]
  total: number
  coupleId: string
}) {
  // Temps réel : un produit ajouté / supprimé / recatégorisé par le partenaire
  // (ou une liste créée) rafraîchit la bibliothèque sans refresh manuel.
  useRealtimeLibrary(coupleId)

  // Cache de lecture (fondation hors ligne) : dernière vue connue de la biblio.
  useOfflineCache("library", { groups, lists, total })

  const [query, setQuery] = useState("")
  // Produit dont la feuille « Envoyer vers… » est ouverte (un seul à la fois).
  const [sending, setSending] = useState<LibraryItemView | null>(null)

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

  return (
    <div className="flex flex-col gap-5">
      <SearchBar value={query} onChange={setQuery} />

      {total === 0 ? (
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-6 text-center text-sm text-ink-soft">
          Ta bibliothèque est vide. Les articles ajoutés à tes listes s’y
          rangent automatiquement.
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
                  hasLists={lists.length > 0}
                  onSend={() => setSending(item)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {sending && (
        <SendSheet
          item={sending}
          lists={lists}
          onClose={() => setSending(null)}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Barre de recherche                                                         */
/* -------------------------------------------------------------------------- */

function SearchBar({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-paper-light px-3 shadow-riso-ink focus-within:shadow-riso-sauge">
      <Search className="size-5 shrink-0 text-ink" strokeWidth={2.5} aria-hidden />
      <input
        type="search"
        inputMode="search"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher un article…"
        aria-label="Rechercher un article"
        className="h-12 w-full bg-transparent text-base font-medium text-ink outline-none placeholder:font-body placeholder:text-ink/55"
      />
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
  hasLists,
  onSend,
}: {
  item: LibraryItemView
  hasLists: boolean
  onSend: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | undefined>()

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else onSuccess?.()
    })
  }

  return (
    <li className="rounded-[10px] border-2 border-ink bg-paper-light p-2.5">
      <div className="flex items-center gap-2.5">
        <FrequencyDots frequency={item.frequency} />

        {/* Nom + nombre d'usages */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-tight text-ink">
            {item.name}
          </p>
          <p className="font-mono text-[11px] text-ink-soft">
            {FREQUENCY_LABEL[item.frequency]} · {item.usageCount} usage
            {item.usageCount > 1 ? "s" : ""}
          </p>
        </div>

        {/* Envoyer vers une liste */}
        <RisoButton
          size="sm"
          variant="secondary"
          disabled={isPending || !hasLists}
          onClick={onSend}
          aria-label={`Envoyer ${item.name} vers une liste`}
          title={hasLists ? undefined : "Crée d’abord une liste"}
        >
          <Plus aria-hidden /> Ajouter
        </RisoButton>

        {/* Supprimer */}
        <button
          type="button"
          aria-label={`Supprimer ${item.name}`}
          disabled={isPending}
          onClick={() => setConfirmingDelete((v) => !v)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-brique focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px disabled:opacity-50"
        >
          <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      </div>

      {/* Confirmation de suppression */}
      {confirmingDelete && (
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
                  () => setConfirmingDelete(false),
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
/*  Feuille « Envoyer vers quelle liste ? »                                    */
/* -------------------------------------------------------------------------- */

/**
 * Bottom-sheet mobile listant les listes du couple. Sélectionner une liste y
 * crée le `list_item` et renforce la fréquence du produit ; la feuille se ferme
 * sur succès. Échec → message d'erreur in-situ, la feuille reste ouverte.
 */
function SendSheet({
  item,
  lists,
  onClose,
}: {
  item: LibraryItemView
  lists: ListChoice[]
  onClose: () => void
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
      const result = await sendToList(item.id, listId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Coche brièvement la liste choisie, puis referme la feuille.
      setDoneListId(listId)
      setTimeout(onClose, 600)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Envoyer ${item.name} vers une liste`}
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
              {item.name}
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
