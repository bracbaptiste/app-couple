"use client"

import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { SectionMarker } from "@/components/lists/SectionMarker"
import { ListLogo } from "@/components/shared/ListLogo"
import { NewListSheet } from "@/components/lists/NewListSheet"
import { useRealtimeLists } from "@/lib/realtime"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"
import { useSwipeReveal } from "@/lib/hooks/useSwipeReveal"
import { cn } from "@/lib/utils"

import {
  deleteList,
  renameList,
  type ActionResult,
} from "./actions"

export type ListView = {
  id: string
  name: string
  /** Type de liste : courses (V1) ou to-do (V2). */
  kind: "courses" | "todo"
  /** Liste partagée avec la conjointe (logo cerveau bichromique). */
  isShared: boolean
  /** Couleur d'identité du propriétaire (logo des listes non partagées). */
  ownerColor: "sauge" | "brique" | null
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
export function ListsManager({
  lists,
  coupleId,
  partnerName,
}: {
  lists: ListView[]
  coupleId: string
  /** Prénom de la conjointe pour la case « Partager » du sheet (null si seul). */
  partnerName: string | null
}) {
  // Temps réel : un changement de liste ou d'article côté partenaire rafraîchit
  // la grille (décomptes + dernière activité) sans refresh manuel.
  useRealtimeLists(coupleId)

  // Cache de lecture (fondation hors ligne) : on garde la dernière grille connue.
  useOfflineCache("lists", lists)

  // Le bouton « + » ouvre le sheet de création (PRD_V2 §2.3).
  const [creating, setCreating] = useState(false)

  // Regroupement par type pour le hub V2 (l'ordre interne — par position — est
  // préservé puisque `lists` arrive déjà trié).
  const todoLists = lists.filter((l) => l.kind === "todo")
  const coursesLists = lists.filter((l) => l.kind === "courses")

  // Indice de découvrabilité du swipe : la toute première carte du hub (to-do
  // prioritaires, sinon courses) est candidate au « peek ». La décision réelle
  // (premier passage ? prefers-reduced-motion ?) est prise dans la tuile, côté
  // client, pour rester SSR-safe.
  const hintListId = todoLists[0]?.id ?? coursesLists[0]?.id ?? null

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-xl uppercase text-ink">Listes</h1>
      </div>

      {/* FAB « Nouvelle liste » : ancré en bas à droite, à portée du pouce en
          usage à une main, au-dessus de la BottomNav (sticky, z-40) et de sa
          safe-area iOS. Style riso : carré 56px, ombre décalée encre. */}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label="Nouvelle liste"
        onClick={() => setCreating(true)}
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 inline-flex size-12 items-center justify-center rounded-[12px] border-2 border-ink bg-brique text-paper-light shadow-riso-ink outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transition-none"
      >
        <Plus className="size-5" strokeWidth={2.5} aria-hidden />
      </button>

      <NewListSheet
        open={creating}
        onOpenChange={setCreating}
        partnerName={partnerName}
      />

      {lists.length === 0 ? (
        <RisoCard shadow="sauge">
          <p className="text-sm text-ink-soft">
            Aucune liste pour l’instant. Crée ta première liste de courses
            ci-dessus.
          </p>
        </RisoCard>
      ) : (
        <>
          {/* Regroupement par type (PRD_V2 §3.1) : to-do en premier, courses
              ensuite. Le tampon de section n'apparaît que si son groupe existe. */}
          {todoLists.length > 0 && (
            <ListGroup kind="todo" lists={todoLists} hintListId={hintListId} />
          )}
          {coursesLists.length > 0 && (
            <ListGroup
              kind="courses"
              lists={coursesLists}
              hintListId={hintListId}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Un groupe de listes d'un même type, précédé de son tampon de section. */
function ListGroup({
  kind,
  lists,
  hintListId,
}: {
  kind: "courses" | "todo"
  lists: ListView[]
  /** Id de la tuile qui joue l'indice de swipe (ou null). */
  hintListId: string | null
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionMarker kind={kind} />
      <ul className="flex flex-col gap-3.5">
        {lists.map((list, index) => (
          <ListTile
            key={list.id}
            list={list}
            shadow={index % 2 === 0 ? "sauge" : "brique"}
            hint={list.id === hintListId}
          />
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tuile de liste                                                             */
/* -------------------------------------------------------------------------- */

/** Panneau ouvert sous la tuile (un seul à la fois). Renommer/Supprimer se
 *  pilotent par le swipe (la suppression via un Dialog modal). */
type TileMode = null | "edit"

/** Largeur révélée par le swipe : deux cibles tactiles de 64px (≥ 44px requis). */
const SWIPE_REVEAL = 128

function ListTile({
  list,
  shadow,
  hint,
}: {
  list: ListView
  shadow: TileShadow
  /** Joue une fois l'indice de swipe (peek) au montage. */
  hint: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<TileMode>(null)
  const [name, setName] = useState(list.name)
  const [error, setError] = useState<string | undefined>()
  // Confirmation de suppression : Dialog modal base-ui (focus trap + cohérence),
  // ouvert aussi bien par le menu crayon que par la corbeille du swipe.
  const [deleting, setDeleting] = useState(false)

  // --- Swipe pour révéler les actions (crayon + corbeille) ---------------
  // Geste mutualisé (cf. useSwipeReveal) : la carte glisse vers la gauche pour
  // découvrir le calque d'actions. C'est un PLUS tactile ; le clavier / lecteur
  // d'écran passe par les boutons focusables du calque. Désengagé en mode
  // édition / menu ; au premier contact on coupe l'animation d'indice en cours.
  // Minuteurs de l'indice de peek, annulés si l'utilisateur interagit.
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const {
    offset,
    setOffset,
    dragging,
    didDragRef,
    close: closeSwipe,
    swipeHandlers,
  } = useSwipeReveal({
    revealWidth: SWIPE_REVEAL,
    enabled: mode === null,
    onEngage: () => hintTimers.current.forEach(clearTimeout),
  })

  // Indice de découvrabilité : la carte glisse brièvement pour révéler l'action
  // brique, puis se referme. Joué une seule fois par appareil (localStorage), et
  // jamais si prefers-reduced-motion. Le `setOffset` est différé (setTimeout),
  // donc pas de setState synchrone dans le corps de l'effet.
  useEffect(() => {
    if (!hint) return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    let seen = true
    try {
      seen = !!localStorage.getItem("lists-swipe-hint-seen")
      if (!seen) localStorage.setItem("lists-swipe-hint-seen", "1")
    } catch {
      // localStorage indisponible : on s'abstient d'animer, sans casse.
      seen = true
    }
    if (seen) return
    hintTimers.current = [
      setTimeout(() => setOffset(-56), 500),
      setTimeout(() => setOffset(0), 1250),
    ]
    return () => hintTimers.current.forEach(clearTimeout)
    // `setOffset` est stable (setter du hook useSwipeReveal).
  }, [hint, setOffset])

  function run(action: () => Promise<ActionResult>) {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else setMode(null)
    })
  }

  const updatedLabel = formatUpdatedAt(list.updatedAt)

  return (
    <li>
      <div
        className={cn(
          // L'ombre riso vit sur le wrapper : `overflow-hidden` clippe la carte
          // qui glisse (et les coins du calque d'actions) mais JAMAIS l'ombre
          // décalée du wrapper (un box-shadow déborde toujours de son élément).
          "relative overflow-hidden rounded-[12px]",
          shadow === "sauge" ? "shadow-riso-sauge" : "shadow-riso-brique",
        )}
      >
        {/* Calque d'actions (Renommer + Supprimer). Révélé au doigt/souris par le
            glissement, ET accessible au clavier / lecteur d'écran : les boutons
            sont focusables et labellisés ; recevoir le focus ouvre la carte, le
            perdre la referme. C'est le seul chemin vers ces actions (plus de
            crayon visible), il doit donc rester pleinement accessible. */}
        {mode === null && (
          <div
            className="absolute inset-y-0 right-0 z-0 flex"
            onFocus={() => setOffset(-SWIPE_REVEAL)}
            onBlur={(e) => {
              // Le focus quitte le calque (vers un élément hors de lui) → refermer.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSwipe()
            }}
          >
            <button
              type="button"
              aria-label={`Renommer la liste ${list.name}`}
              disabled={isPending}
              onClick={() => {
                closeSwipe()
                setName(list.name)
                setMode("edit")
              }}
              className="inline-flex w-16 items-center justify-center bg-sauge text-ink outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink disabled:opacity-50"
            >
              <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Supprimer la liste ${list.name}`}
              disabled={isPending}
              onClick={() => {
                closeSwipe()
                setDeleting(true)
              }}
              className="inline-flex w-16 items-center justify-center border-l-2 border-ink bg-brique text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper-light disabled:opacity-50"
            >
              <Trash2 className="size-5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        )}

        {/* Carte au premier plan : glisse via translateX. `touch-pan-y` laisse le
            scroll vertical au navigateur et nous réserve l'horizontale. Sans
            transition pendant le drag (suit le doigt) ; `motion-reduce` coupe
            l'animation de snap pour prefers-reduced-motion. */}
        <div
          className={cn(
            // `select-none` : pas de sélection de texte parasite pendant un
            // cliquer-glisser à la souris.
            "relative z-10 touch-pan-y select-none",
            dragging
              ? ""
              : "transition-transform duration-200 ease-out motion-reduce:transition-none",
          )}
          style={{ transform: `translateX(${offset}px)` }}
          {...swipeHandlers}
          onClickCapture={(e) => {
            // Click de fin de glissement : on l'avale (ni navigation ni
            // fermeture) pour que la carte RESTE ouverte sur ses actions.
            if (didDragRef.current) {
              e.preventDefault()
              e.stopPropagation()
              didDragRef.current = false
              return
            }
            // Vrai tap sur une carte déjà ouverte : on referme au lieu de naviguer.
            if (offset !== 0) {
              e.preventDefault()
              e.stopPropagation()
              closeSwipe()
            }
          }}
        >
      <RisoCard shadow="none" padding="default" className="relative">
        {/* Repère de découvrabilité : petite languette encre sur le bord droit,
            qui signale que la carte se tire vers la gauche pour révéler les
            actions. Cliquable (souris/tactile) → ouvre directement le calque,
            pour qui ne devine pas le geste. aria-hidden + hors tabulation : le
            clavier passe par les boutons Renommer/Supprimer, déjà focusables. */}
        {mode === null && offset === 0 && (
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOffset(-SWIPE_REVEAL)}
            title="Afficher les actions (ou glisser la carte vers la gauche)"
            className="absolute -right-0.5 top-1/2 z-10 inline-flex h-11 w-6 -translate-y-1/2 items-center justify-end outline-none"
          >
            <span
              aria-hidden
              className="block h-9 w-1.5 rounded-full bg-ink"
            />
          </button>
        )}

        {mode === "edit" ? (
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
                  setMode(null)
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
            <div className="flex items-center gap-2">
              <Link
                href={`/lists/${list.id}`}
                className="block min-w-0 flex-1 rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
              >
                <h3 className="font-display text-lg uppercase leading-tight text-ink">
                  {list.name}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-display text-2xl leading-none text-ink">
                    {list.unchecked}
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {list.kind === "todo" ? "à faire" : "à acheter"} ·{" "}
                    {list.total} au total
                  </span>
                </div>
                {updatedLabel && (
                  <p className="mt-1 font-mono text-[11px] text-ink-soft">
                    Modifiée le {updatedLabel}
                  </p>
                )}
              </Link>

              {/* Logo cerveau à droite, centré verticalement : bichromique si la
                  liste est partagée, sinon à la couleur du propriétaire (sauge =
                  toi, brique = la conjointe). (Renommer / Supprimer = swipe.) */}
              {(() => {
                const variant = list.isShared ? "shared" : list.ownerColor
                return variant ? (
                  <div className="flex shrink-0 items-center pr-1">
                    <ListLogo variant={variant} />
                  </div>
                ) : null
              })()}
            </div>
          </>
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
        </div>
      </div>

      <DeleteListDialog
        list={list}
        open={deleting}
        onOpenChange={setDeleting}
      />
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/*  Confirmation de suppression (Dialog modal)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Dialog de confirmation avant suppression d'une liste.
 *
 * Modal base-ui (comme NewListSheet) pour le piège de focus et la cohérence.
 * « Annuler » reçoit le focus initial et fait office de bouton par défaut, afin
 * d'éviter les suppressions par erreur de clic ; « Supprimer » (variante brique)
 * lance réellement l'action `deleteList`. À la réussite, la liste disparaît via
 * revalidatePath + temps réel, donc on referme simplement le Dialog.
 */
function DeleteListDialog({
  list,
  open,
  onOpenChange,
}: {
  list: ListView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()
  const cancelRef = useRef<HTMLButtonElement>(null)

  function confirmDelete() {
    setError(undefined)
    startTransition(async () => {
      const result = await deleteList(list.id)
      if (!result.ok) setError(result.error)
      else onOpenChange(false)
    })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // À la fermeture, on repart d'une ardoise propre (erreur effacée).
        if (!next) setError(undefined)
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          initialFocus={cancelRef}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 -translate-y-1/2",
            "rounded-[16px] border-[2.5px] border-ink bg-paper p-5 shadow-riso-ink",
            "transition-[opacity,transform] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none",
          )}
        >
          <Dialog.Title className="font-display text-lg uppercase leading-tight text-ink">
            Supprimer la liste ?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] leading-snug text-ink">
            Êtes-vous sûr de vouloir supprimer la liste « {list.name} »
            {list.total > 0
              ? ` et ses ${list.total} article${list.total > 1 ? "s" : ""}`
              : ""}
            &nbsp;? Cette action est définitive.
          </Dialog.Description>

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-[8px] border-2 border-brique bg-brique/10 px-2.5 py-1.5 text-[12px] font-medium leading-snug text-ink"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <RisoButton
              ref={cancelRef}
              variant="secondary"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Annuler
            </RisoButton>
            <RisoButton
              variant="primary"
              disabled={isPending}
              aria-busy={isPending}
              onClick={confirmDelete}
            >
              {isPending ? "…" : "Supprimer"}
            </RisoButton>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
