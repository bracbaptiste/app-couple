"use client"

import Link from "next/link"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCard } from "@/components/ui/riso-card"
import { RisoInput } from "@/components/ui/riso-input"
import { SectionMarker } from "@/components/lists/SectionMarker"
import { SharedBadge } from "@/components/shared/SharedBadge"
import { NewListSheet } from "@/components/lists/NewListSheet"
import { useRealtimeLists } from "@/lib/realtime"
import { useOfflineCache } from "@/lib/offline/use-offline-cache"

import {
  clearCheckedItems,
  deleteList,
  renameList,
  type ActionResult,
} from "./actions"

export type ListView = {
  id: string
  name: string
  /** Type de liste : courses (V1) ou to-do (V2). */
  kind: "courses" | "todo"
  /** Liste partagée avec la conjointe (affiche le badge « Partagé »). */
  isShared: boolean
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-xl uppercase text-ink">Listes</h1>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label="Nouvelle liste"
            onClick={() => setCreating(true)}
            className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] border-2 border-ink bg-brique text-paper-light shadow-riso-ink-sm outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px active:shadow-none"
          >
            <Plus className="size-5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      </div>

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
            <ListGroup kind="todo" lists={todoLists} />
          )}
          {coursesLists.length > 0 && (
            <ListGroup kind="courses" lists={coursesLists} />
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
}: {
  kind: "courses" | "todo"
  lists: ListView[]
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
          />
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Tuile de liste                                                             */
/* -------------------------------------------------------------------------- */

/** Panneau ouvert sous la tuile (un seul à la fois). */
type TileMode = null | "edit" | "menu" | "clear" | "delete"

function ListTile({
  list,
  shadow,
}: {
  list: ListView
  shadow: TileShadow
}) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<TileMode>(null)
  const [name, setName] = useState(list.name)
  const [error, setError] = useState<string | undefined>()

  function run(action: () => Promise<ActionResult>) {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) setError(result.error)
      else setMode(null)
    })
  }

  const updatedLabel = formatUpdatedAt(list.updatedAt)
  // Articles « déjà pris » (cochés) que « Vider la liste » retirerait.
  const checked = Math.max(0, list.total - list.unchecked)

  return (
    <li>
      <RisoCard shadow={shadow} padding="default" className="relative">
        {/* Badge « Partagé » (DESIGN_SYSTEM_V2 §1.2 / §2.1) — coin haut droite. */}
        {list.isShared && (
          <div className="absolute right-[10px] top-[10px] z-10">
            <SharedBadge />
          </div>
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

            {/* Action principale : vider les « déjà pris ». Le crayon ouvre le
                menu discret (renommer / supprimer la liste). */}
            <div className="mt-3 flex items-center gap-1.5 border-t-2 border-dashed border-ink pt-3">
              <RisoButton
                variant="secondary"
                size="sm"
                disabled={isPending || checked === 0}
                onClick={() => setMode("clear")}
                title={
                  checked === 0 ? "Rien à vider (aucun article coché)" : undefined
                }
              >
                Vider la liste
                {checked > 0 ? ` · ${checked}` : ""}
              </RisoButton>
              <button
                type="button"
                aria-label="Modifier la liste"
                aria-expanded={mode === "menu"}
                disabled={isPending}
                onClick={() => setMode((m) => (m === "menu" ? null : "menu"))}
                className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </>
        )}

        {/* Menu discret du crayon : renommer ou supprimer la liste */}
        {mode === "menu" && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t-2 border-dashed border-ink pt-3">
            <RisoButton
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => {
                setName(list.name)
                setMode("edit")
              }}
            >
              <Pencil aria-hidden /> Renommer
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

        {/* Confirmation de vidage (retire les articles cochés) */}
        {mode === "clear" && (
          <div className="mt-3 flex flex-col gap-2 border-t-2 border-dashed border-ink pt-3">
            <p className="text-[12px] leading-snug text-ink">
              Retirer les {checked} article{checked > 1 ? "s" : ""} déjà pris de
              « {list.name} » ? Les articles à acheter restent.
            </p>
            <div className="flex gap-1.5">
              <RisoButton
                size="sm"
                disabled={isPending}
                onClick={() => run(() => clearCheckedItems(list.id))}
              >
                Vider
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
      </RisoCard>
    </li>
  )
}
