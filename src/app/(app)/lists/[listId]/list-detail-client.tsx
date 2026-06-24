"use client"

import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"
import { useMemo, useState, useTransition } from "react"

import { AddedByMarker } from "@/components/ui/added-by-marker"
import { CategoryHeader } from "@/components/ui/category-header"
import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { cn } from "@/lib/utils"
import { useRealtimeListItems } from "@/lib/realtime"
import { runMutation } from "@/lib/offline/mutation-queue"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"
import { useOfflineOptimistic } from "@/lib/offline/use-offline-optimistic"
import { useSwipeReveal } from "@/lib/hooks/useSwipeReveal"
import { formatQuantites } from "@/lib/recipes/format"
import { type QuantiteBase } from "@/lib/recipes/fusion"

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
  /** Quantité libre saisie à la main (« 2 boîtes »…). */
  quantity: string | null
  /** Quantités structurées issues des recettes (fusion §6), en unités de base. */
  quantities: QuantiteBase[]
  note: string | null
  isChecked: boolean
  /** Horodatage ISO du cochage (= « acheté le »), ou `null` si à acheter. */
  checkedAt: string | null
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
 * Action interne du réducteur optimiste. Une seule mutation déplace un article
 * d'une section à l'autre sans attendre le serveur :
 *   - `toggle` : coché ⇄ « Déjà pris » (porté par le list_item).
 */
type OptimisticAction = {
  kind: "toggle"
  id: string
  checked: boolean
  /** Horodatage optimiste du cochage (ISO), ou `null` au décochage. */
  checkedAt: string | null
}

/**
 * Réducteur partagé : applique UNE action de cochage à la liste d'articles.
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
  return current.map((it) =>
    it.id === action.id
      ? { ...it, isChecked: action.checked, checkedAt: action.checkedAt }
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
  useOfflineCache(`${coupleId}:list-items:${listId}`, {
    items,
    categories,
    members,
  })

  // Index prénom/couleur par id de profil, pour le marqueur « ajouté par ».
  const membersById = useMemo(() => {
    const map = new Map<string, MemberView>()
    for (const m of members) map.set(m.id, m)
    return map
  }, [members])

  // État optimiste du cochage, porté au niveau de la liste pour que l'article
  // CHANGE DE SECTION immédiatement (rayon ⇄ « Déjà pris »), sans attendre le
  // serveur. Optimiste + résilience hors ligne mutualisés (cf.
  // useOfflineOptimistic) : `displayItems` = état serveur + optimiste en vol +
  // patches hors ligne ; `apply` applique l'action (et la mémorise hors ligne).
  const {
    display: displayItems,
    isPending,
    startAction,
    apply,
  } = useOfflineOptimistic(items, applyOptimisticAction)
  const [actionError, setActionError] = useState<string | undefined>()

  function handleToggle(itemId: string, next: boolean) {
    setActionError(undefined)
    const action: OptimisticAction = {
      kind: "toggle",
      id: itemId,
      checked: next,
      checkedAt: next ? new Date().toISOString() : null,
    }
    startAction(async () => {
      // Application optimiste DANS la transition : la section bouge tout de suite.
      apply(action)
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
          Cette liste est vide. Ajoute des articles depuis la Bibliothèque, avec
          le bouton « Ajouter à une liste ».
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
                    member={item.addedBy ? membersById.get(item.addedBy) ?? null : null}
                    onToggle={handleToggle}
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
                    member={item.addedBy ? membersById.get(item.addedBy) ?? null : null}
                    onToggle={handleToggle}
                    toggling={isPending}
                  />
                ))}
              </ul>

              {/* Au bout de 24h, ces articles quittent la liste pour
                  l'historique des achats (où / quand). */}
              <p className="px-1 font-mono text-[11px] leading-snug text-ink-soft">
                Ces articles disparaissent d’ici 24h, puis rejoignent
                l’historique des achats.
              </p>
              <Link
                href="/profile/purchases"
                className="self-center rounded-[6px] px-2 py-1 font-body text-[12px] text-ink-soft underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                Voir l’historique des achats →
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne d'article                                                            */
/* -------------------------------------------------------------------------- */

type ItemMode = null | "details" | "delete"

/** Largeur révélée par le swipe : deux cibles tactiles de 64px (≥ 44px requis). */
const SWIPE_REVEAL = 128

function ItemRow({
  listId,
  item,
  member,
  onToggle,
  toggling,
}: {
  listId: string
  item: ItemView
  member: MemberView | null
  /** Demande le (dé)cochage au parent, qui gère l'état optimiste partagé. */
  onToggle: (itemId: string, next: boolean) => void
  /** Une transition (cochage) est en cours dans la liste. */
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

  // --- Swipe pour révéler les actions (crayon + corbeille) ----------------
  // Geste mutualisé (cf. useSwipeReveal) : la ligne glisse vers la gauche pour
  // découvrir le calque d'actions, qui reste accessible au clavier. Désengagé
  // quand un panneau (détails / suppression) est ouvert.
  const {
    offset,
    setOffset,
    dragging,
    didDragRef,
    close: closeSwipe,
    swipeHandlers,
  } = useSwipeReveal({ revealWidth: SWIPE_REVEAL, enabled: mode === null })

  return (
    <li
      className={cn(
        "relative overflow-hidden rounded-[10px] transition-opacity",
        checked && "opacity-55",
      )}
    >
      {/* Calque d'actions (Quantité/note + Supprimer), révélé par le glissement
          et accessible au clavier : recevoir le focus ouvre la ligne. */}
      {mode === null && (
        <div
          // Bordure encre continue autour du calque révélé (haut/droite/bas
          // + coins droits arrondis) : prolonge le trait de la carte pour que
          // toute la rangée garde un contour encre fermé une fois ouverte.
          className="absolute inset-y-0 right-0 z-0 flex overflow-hidden rounded-r-[10px] border-y-2 border-r-2 border-ink"
          onFocus={() => setOffset(-SWIPE_REVEAL)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSwipe()
          }}
        >
          <button
            type="button"
            aria-label={`Quantité / note de ${item.name}`}
            disabled={isPending}
            onClick={() => {
              closeSwipe()
              setMode("details")
            }}
            className="inline-flex w-16 items-center justify-center bg-sauge text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink disabled:opacity-50"
          >
            <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Supprimer ${item.name}`}
            disabled={isPending}
            onClick={() => {
              closeSwipe()
              setError(undefined)
              setMode("delete")
            }}
            className="inline-flex w-16 items-center justify-center border-l-2 border-ink bg-brique text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper-light disabled:opacity-50"
          >
            <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      )}

      {/* Carte au premier plan : glisse via translateX. `touch-pan-y` laisse le
          scroll vertical au navigateur et nous réserve l'horizontale. */}
      <div
        className={cn(
          "relative z-10 select-none touch-pan-y rounded-[10px] border-2 border-ink bg-paper-light p-2",
          // Une fois glissée, on carre le bord droit : son trait encre devient
          // une verticale franche, au contact du calque vert/brique, sans liseré
          // de papier dans l'arrondi (au repos, coins arrondis comme avant).
          (offset !== 0 || dragging) && "rounded-r-none",
          mode === null
            ? dragging
              ? ""
              : "transition-transform duration-200 ease-out motion-reduce:transition-none"
            : "",
        )}
        style={
          mode === null ? { transform: `translateX(${offset}px)` } : undefined
        }
        {...swipeHandlers}
        onClickCapture={(e) => {
          // Click de fin de glissement : on l'avale (pas de cochage parasite).
          if (didDragRef.current) {
            e.preventDefault()
            e.stopPropagation()
            didDragRef.current = false
            return
          }
          // Tap sur une ligne déjà ouverte : on referme au lieu de cocher.
          if (offset !== 0) {
            e.preventDefault()
            e.stopPropagation()
            closeSwipe()
          }
        }}
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
              "line-clamp-2 text-[15px] font-medium leading-tight text-ink",
              checked && "line-through",
            )}
          >
            {item.name}
          </p>
          {(() => {
            // Méta sous le nom : on agrège les sources disponibles, séparées par
            // « · ». Les quantités issues des recettes (structurées, fusion §6)
            // d'abord, puis la quantité libre saisie à la main, puis la note.
            const parts = [
              item.quantities.length > 0 ? formatQuantites(item.quantities) : null,
              item.quantity || null,
              item.note || null,
            ].filter(Boolean)
            return parts.length > 0 ? (
              <p className="truncate font-mono text-[11px] text-ink-soft">
                {parts.join(" · ")}
              </p>
            ) : null
          })()}
        </div>

        {/* Marqueur « ajouté par » */}
        <AddedByMarker
          color={member?.color ?? null}
          name={member?.name}
          className="mr-0.5"
        />

      </div>

      {/* Repère de découvrabilité du swipe : languette encre sur le bord droit
          (même rendu que les tuiles de liste). Cliquable → ouvre le calque.
          aria-hidden + hors tabulation : le clavier passe par les boutons du
          calque, focusables. */}
      {mode === null && offset === 0 && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOffset(-SWIPE_REVEAL)}
          title="Afficher les actions (ou glisser la ligne vers la gauche)"
          className="absolute -right-0.5 top-1/2 z-10 inline-flex h-11 w-6 -translate-y-1/2 items-center justify-end outline-none"
        >
          <span aria-hidden className="block h-9 w-1.5 rounded-full bg-ink" />
        </button>
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
      </div>
    </li>
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
          className="h-11 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base text-ink outline-none placeholder:text-ink-soft focus-visible:shadow-riso-sauge"
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
