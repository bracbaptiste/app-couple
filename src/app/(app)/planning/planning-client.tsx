"use client"

import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  Pencil,
  Plus,
  Search,
  Trash2,
  Type,
  Utensils,
} from "lucide-react"
import { useMemo, useOptimistic, useState, useTransition } from "react"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoCheckbox } from "@/components/ui/riso-checkbox"
import { useSwipeDismiss } from "@/lib/hooks/useSwipeDismiss"
import { useRealtimePlanning } from "@/lib/realtime"
import { formatWeekLabel, parseDateKey } from "@/lib/planning/week"
import { cn } from "@/lib/utils"

import { placeMeal, clearMeal, togglePlanningTask } from "./actions"

/** Un repas placé dans une case (déjeuner ou dîner d'un jour). */
export type MealSlotView = {
  id: string
  creneau: "dejeuner" | "diner"
  type: "recette" | "texte"
  /** Titre de la recette liée ou texte libre — ce qui s'affiche dans la case. */
  label: string
  /** Recette liée (§8.2 : tap → fiche recette), ou null pour un repas texte. */
  recipeId: string | null
}

/** Une tâche à échéance affichée sous les créneaux d'un jour (§8.3). */
export type PlanningTaskView = {
  id: string
  /** To-do list d'origine : tap sur le libellé → `/lists/[listId]`. */
  listId: string
  title: string
  isDone: boolean
}

/** Une recette proposée dans le sélecteur de placement (id + titre). */
export type RecipePickView = {
  id: string
  titre: string
}

/** Une colonne = un jour de la semaine : ses deux créneaux + ses tâches. */
export type DayColumn = {
  dateKey: string
  /** Nom du jour en toutes lettres (« lundi »). */
  weekday: string
  dayNumber: number
  isToday: boolean
  dejeuner: MealSlotView | null
  diner: MealSlotView | null
  /** Tâches dont l'échéance tombe ce jour-là (§8.3). */
  tasks: PlanningTaskView[]
}

/** Libellés courts des deux créneaux (PRD_V4 §8.1). */
const CRENEAU_LABEL: Record<"dejeuner" | "diner", string> = {
  dejeuner: "Déjeuner",
  diner: "Dîner",
}

/** Contexte d'ouverture du sélecteur de placement pour UNE case. */
type SheetTarget = {
  dateKey: string
  creneau: "dejeuner" | "diner"
  /** Repas déjà présent (mode « remplacer / vider »), ou null (case vide). */
  slot: MealSlotView | null
  /** Libellé lisible de la case (« Dîner · lundi 5 ») pour le titre du sheet. */
  contextLabel: string
}

/**
 * Grille du Planning : 7 jours (lundi → dimanche) × 2 créneaux (§8.1), avec le
 * placement des repas (§8.2) et les tâches à échéance (§8.3).
 *
 * Mobile-first (une colonne de jours empilés) : chaque jour porte son étiquette
 * (mise en évidence si c'est aujourd'hui), ses deux cases déjeuner / dîner, puis
 * ses tâches du jour. Une case VIDE est nativement en pointillés (§4.6 « ce qui
 * n'existe pas encore ») — un état NORMAL, une semaine peut rester en partie vide.
 *
 * Temps réel (§8.1/§8.3) : un repas placé/retiré ou une tâche cochée par l'un
 * apparaît instantanément chez l'autre (le hook rafraîchit le Server Component).
 */
export function PlanningGrid({
  coupleId,
  columns,
  recipes,
  weekStartKey,
  prevWeekKey,
  nextWeekKey,
  currentWeekKey,
}: {
  coupleId: string
  columns: DayColumn[]
  recipes: RecipePickView[]
  weekStartKey: string
  prevWeekKey: string
  nextWeekKey: string
  /** Lundi de la semaine « courante » (pour l'affordance « revenir »). */
  currentWeekKey: string
}) {
  // Temps réel : repas (meal_slots) ET tâches cochées apparaissent sans refresh.
  useRealtimePlanning(coupleId)

  // Un seul sélecteur pour toute la grille. On DISSOCIE la case ciblée (`target`,
  // gardée montée même après fermeture pour l'animation de sortie) de l'état
  // ouvert/fermé (`sheetOpen`) : c'est base-ui qui démonte le Popup, jamais nous
  // (sinon le backdrop modal resterait et bloquerait les clics suivants). Le
  // compteur `openSeq` sert de `key` : chaque ouverture remonte le contenu à neuf.
  const [target, setTarget] = useState<SheetTarget | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [openSeq, setOpenSeq] = useState(0)

  function openSheet(next: SheetTarget) {
    setTarget(next)
    setOpenSeq((n) => n + 1)
    setSheetOpen(true)
  }

  const monday = parseDateKey(weekStartKey)
  const weekLabel = monday ? formatWeekLabel(monday) : ""
  const onCurrentWeek = weekStartKey === currentWeekKey

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-xl uppercase text-ink">Planning</h1>
        {!onCurrentWeek && (
          <Link
            href="/planning"
            className="rounded-full border-2 border-ink px-2.5 py-0.5 font-mono text-[11px] uppercase text-ink outline-none transition-colors hover:bg-sauge focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Cette semaine
          </Link>
        )}
      </div>

      {/* Navigation semaine précédente / libellé / semaine suivante. Ce sont des
          liens (navigation serveur) : l'URL change (?debut=…), donc la semaine
          affichée est partageable et survit au router.refresh() du temps réel. */}
      <nav
        aria-label="Navigation des semaines"
        className="flex items-center justify-between gap-2"
      >
        <WeekArrow
          href={`/planning?debut=${prevWeekKey}`}
          label="Semaine précédente"
          dir="prev"
        />
        <span className="flex items-center gap-1.5 font-display text-sm uppercase text-ink">
          <CalendarDays className="size-4 text-ink-soft" strokeWidth={2.5} aria-hidden />
          {weekLabel}
        </span>
        <WeekArrow
          href={`/planning?debut=${nextWeekKey}`}
          label="Semaine suivante"
          dir="next"
        />
      </nav>

      <ol className="flex flex-col gap-2.5">
        {columns.map((col) => (
          <li key={col.dateKey} className="flex flex-col gap-1.5">
            <div className="flex items-stretch gap-2">
              {/* Étiquette du jour (jour courant mis en évidence : encre pleine). */}
              <div
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center justify-center rounded-[10px] border-2 py-1.5",
                  col.isToday
                    ? "border-ink bg-ink text-paper-light"
                    : "border-ink/25 bg-paper-light text-ink",
                )}
              >
                <span className="font-mono text-[10px] uppercase leading-none opacity-80">
                  {col.weekday.slice(0, 3)}
                </span>
                <span className="font-display text-lg leading-tight">
                  {col.dayNumber}
                </span>
              </div>

              {/* Les deux créneaux du jour. */}
              <div className="grid flex-1 grid-cols-2 gap-2">
                {(["dejeuner", "diner"] as const).map((creneau) => (
                  <SlotCell
                    key={creneau}
                    creneau={creneau}
                    slot={creneau === "dejeuner" ? col.dejeuner : col.diner}
                    today={col.isToday}
                    onOpen={(slot) =>
                      openSheet({
                        dateKey: col.dateKey,
                        creneau,
                        slot,
                        contextLabel: `${CRENEAU_LABEL[creneau]} · ${col.weekday} ${col.dayNumber}`,
                      })
                    }
                  />
                ))}
              </div>
            </div>

            {/* Tâches à échéance ce jour-là (§8.3), sous les créneaux repas. */}
            {col.tasks.length > 0 && (
              <ul className="ml-16 flex flex-col gap-1">
                {col.tasks.map((task) => (
                  <PlanningTaskRow key={task.id} task={task} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {/* Sélecteur de placement (un seul, piloté par la case ciblée). */}
      <MealPlacementSheet
        target={target}
        open={sheetOpen}
        openKey={openSeq}
        recipes={recipes}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}

/** Flèche de navigation entre semaines (cible tactile ≥ 44px). */
function WeekArrow({
  href,
  label,
  dir,
}: {
  href: string
  label: string
  dir: "prev" | "next"
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-[10px] border-2 border-ink bg-paper-light text-ink outline-none transition-[transform,background-color] hover:bg-sauge active:translate-x-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none"
    >
      <Icon className="size-5" strokeWidth={2.5} aria-hidden />
    </Link>
  )
}

/**
 * Une case de la grille (§8.2). Trois rendus :
 *   - VIDE → bouton pointillés « + » (ouvre le sélecteur de placement) ;
 *   - RECETTE → carte-lien vers la fiche recette (tap → §8.2), avec un petit
 *     bouton « crayon » d'angle pour remplacer / vider ;
 *   - TEXTE → carte-bouton (pas de fiche à ouvrir) : tap → remplacer / vider.
 */
function SlotCell({
  creneau,
  slot,
  today,
  onOpen,
}: {
  creneau: "dejeuner" | "diner"
  slot: MealSlotView | null
  today: boolean
  /** Ouvre le sélecteur pour cette case (slot = repas présent, ou null si vide). */
  onOpen: (slot: MealSlotView | null) => void
}) {
  const creneauLabel = CRENEAU_LABEL[creneau]

  // Case vide, native en pointillés : « ce qui n'existe pas encore ».
  if (!slot) {
    return (
      <button
        type="button"
        onClick={() => onOpen(null)}
        aria-label={`Placer un repas — ${creneauLabel}`}
        className={cn(
          "group flex min-h-[64px] flex-col justify-center gap-1 rounded-[10px] border-2 border-dashed px-2 py-1.5 text-left outline-none transition-colors hover:border-ink hover:bg-sauge/30 focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none",
          today ? "border-ink-soft/70" : "border-ink-soft/45",
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-soft/70">
          {creneauLabel}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-soft/70">
          <Plus className="size-3.5" strokeWidth={2.5} aria-hidden />
          Ajouter
        </span>
      </button>
    )
  }

  // Case remplie : carte encrée avec ombre riso courte + libellé du repas.
  const meta = (
    <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-ink-soft">
      {slot.type === "recette" && (
        <Utensils className="size-3" strokeWidth={2.5} aria-hidden />
      )}
      {creneauLabel}
    </span>
  )

  // Repas RECETTE : la carte entière est un lien vers la fiche (§8.2) ; un petit
  // bouton d'angle ouvre le sélecteur (remplacer / vider) sans quitter la page.
  if (slot.type === "recette" && slot.recipeId) {
    return (
      <div className="relative">
        <Link
          href={`/recipes/${slot.recipeId}`}
          className="flex min-h-[64px] flex-col justify-between gap-1 rounded-[10px] border-2 border-ink bg-paper-light px-2 py-1.5 pr-8 shadow-riso-ink-sm outline-none transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none"
        >
          {meta}
          <span className="line-clamp-2 text-[13px] font-medium leading-tight text-ink">
            {slot.label}
          </span>
        </Link>
        <SlotEditButton label={slot.label} onOpen={() => onOpen(slot)} />
      </div>
    )
  }

  // Repas TEXTE (ou recette orpheline) : carte-bouton, tap → remplacer / vider.
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      aria-label={`Modifier le repas « ${slot.label} » — ${creneauLabel}`}
      className="flex min-h-[64px] flex-col justify-between gap-1 rounded-[10px] border-2 border-ink bg-paper-light px-2 py-1.5 text-left shadow-riso-ink-sm outline-none transition-[transform,box-shadow] active:translate-x-px active:translate-y-px active:shadow-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none"
    >
      {meta}
      <span className="line-clamp-2 text-[13px] font-medium leading-tight text-ink">
        {slot.label}
      </span>
    </button>
  )
}

/** Petit bouton d'angle (remplacer / vider) posé sur une case-recette. */
function SlotEditButton({
  label,
  onOpen,
}: {
  label: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Modifier le repas « ${label} »`}
      className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-[7px] border-2 border-ink bg-paper text-ink outline-none transition-colors hover:bg-sauge focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-1 focus-visible:ring-offset-paper motion-reduce:transition-none"
    >
      <Pencil className="size-3" strokeWidth={2.5} aria-hidden />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Ligne de tâche (§8.3)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Une tâche à échéance affichée dans le planning (§8.3). Cochable SUR PLACE (un
 * tap — ADN de l'app) via la case ; le libellé, lui, est un LIEN vers la to-do
 * list d'origine (édition seulement là-bas, jamais dans le planning). Style
 * « fait » apaisé (barré + atténué). Cochage optimiste, réconcilié au refresh.
 */
function PlanningTaskRow({ task }: { task: PlanningTaskView }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()
  // Cochage optimiste : la case bascule tout de suite ; l'état revient de
  // lui-même à la valeur serveur en fin de transition (revalidate/Realtime),
  // sans effet de réconciliation manuel.
  const [checked, setChecked] = useOptimistic(task.isDone)

  function toggle(next: boolean) {
    setError(undefined)
    startTransition(async () => {
      setChecked(next)
      const res = await togglePlanningTask(task.listId, task.id, next)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-[8px] border-2 border-ink/15 bg-paper-light/70 pr-2 transition-opacity",
          checked && "opacity-60",
        )}
      >
        <RisoCheckbox
          checked={checked}
          onCheckedChange={toggle}
          aria-busy={pending}
          aria-label={checked ? `Décocher ${task.title}` : `Cocher ${task.title}`}
          className="size-9"
        />
        <Link
          href={`/lists/${task.listId}`}
          className={cn(
            "min-w-0 flex-1 rounded-[6px] py-1.5 text-[12px] font-medium leading-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-1 focus-visible:ring-offset-paper",
            checked && "text-ink-soft line-through",
          )}
        >
          {task.title}
        </Link>
      </div>
      {error && (
        <p
          role="alert"
          className="ml-9 mt-0.5 text-[11px] font-medium leading-snug text-brique"
        >
          {error}
        </p>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sélecteur de placement (§8.2)                                              */
/* -------------------------------------------------------------------------- */

/** Normalise un libellé pour la recherche (insensible casse + accents). */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

type SheetStep = "menu" | "recette" | "texte"

/**
 * Bottom sheet de placement d'un repas (§8.2) — deux sources : une recette du
 * carnet OU un texte libre. Sur une case déjà occupée, propose aussi « Vider ».
 * La proposition IA (§8.4) arrive en Phase 6 : rien à prévoir ici (une fois
 * validée, elle devient une recette normale sélectionnable dans la même liste).
 *
 * Même habillage que `NewRecipeSheet` (Dialog base-ui + glisser pour fermer).
 */
function MealPlacementSheet({
  target,
  open,
  openKey,
  recipes,
  onClose,
}: {
  /** Case ciblée (gardée montée pendant l'animation de sortie). */
  target: SheetTarget | null
  /** Ouvert/fermé — c'est base-ui qui démonte le Popup à la fermeture. */
  open: boolean
  /** Change à chaque ouverture → `key` du contenu (remontage à neuf). */
  openKey: number
  recipes: RecipePickView[]
  onClose: () => void
}) {
  const { offset, dragging, releasing, onTransitionEnd, swipeHandlers } =
    useSwipeDismiss({ onDismiss: onClose })

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-sm touch-none flex-col",
            "rounded-t-[22px] border-t-[2.5px] border-ink bg-paper px-[22px] pb-7 pt-[22px]",
            "transition-transform data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full motion-reduce:transition-none",
          )}
          initialFocus={false}
          style={
            dragging
              ? { transform: `translateY(${offset}px)`, transition: "none" }
              : releasing
                ? { transform: `translateY(${offset}px)` }
                : undefined
          }
          onTransitionEnd={onTransitionEnd}
          {...swipeHandlers}
        >
          {/* Poignée (glisser vers le bas pour fermer). */}
          <div className="mx-auto mb-[18px] h-[5px] w-12 rounded-full bg-ink" />
          {target && (
            <SheetContent
              key={openKey}
              target={target}
              recipes={recipes}
              onClose={onClose}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Contenu du sheet, remonté à chaque nouvelle case (via `key`) : l'état interne
 * (étape, recherche, texte) repart donc à zéro à chaque ouverture, sans effet
 * de réinitialisation manuel.
 */
function SheetContent({
  target,
  recipes,
  onClose,
}: {
  target: SheetTarget
  recipes: RecipePickView[]
  onClose: () => void
}) {
  // Case occupée → on ouvre directement sur le menu (avec l'option « Vider »).
  const [step, setStep] = useState<SheetStep>("menu")
  const [query, setQuery] = useState("")
  const [texte, setTexte] = useState(
    target.slot?.type === "texte" ? target.slot.label : "",
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()

  const occupied = target.slot !== null

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return recipes
    return recipes.filter((r) => normalize(r.titre).includes(q))
  }, [recipes, query])

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(undefined)
    startTransition(async () => {
      const res = await action()
      if (res.ok) onClose()
      else setError(res.error ?? "Action impossible. Réessaie.")
    })
  }

  function chooseRecipe(recipeId: string) {
    run(() =>
      placeMeal(target.dateKey, target.creneau, { kind: "recette", recipeId }),
    )
  }

  function submitTexte() {
    const clean = texte.trim()
    if (!clean) {
      setError("Entre le repas (ex. « restes »).")
      return
    }
    run(() =>
      placeMeal(target.dateKey, target.creneau, { kind: "texte", texte: clean }),
    )
  }

  function empty() {
    if (!target.slot) return
    const slotId = target.slot.id
    run(() => clearMeal(slotId))
  }

  return (
    <>
      <Dialog.Title className="mb-1 text-center font-display text-[20px] uppercase leading-none tracking-tight text-ink">
        {occupied ? "Modifier le repas" : "Placer un repas"}
      </Dialog.Title>
      <p className="mb-[18px] text-center font-mono text-[11px] uppercase tracking-wide text-ink-soft">
        {target.contextLabel}
      </p>

      {step === "menu" && (
        <div className="flex flex-col gap-3">
          <ChoiceButton
            icon={ChefHat}
            label="Choisir une recette"
            hint="Depuis ton carnet — tap → fiche recette"
            variant="primary"
            onClick={() => setStep("recette")}
          />
          <ChoiceButton
            icon={Type}
            label="Texte libre"
            hint="« restes », « pizza surgelée », « chez mes parents »"
            variant="secondary"
            onClick={() => setStep("texte")}
          />
          {occupied && (
            <button
              type="button"
              onClick={empty}
              disabled={pending}
              className="mt-1 inline-flex items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-brique px-3 py-3 font-display text-[14px] uppercase tracking-tight text-brique outline-none transition-colors hover:bg-brique/10 focus-visible:ring-2 focus-visible:ring-brique focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 motion-reduce:transition-none"
            >
              <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
              Vider la case
            </button>
          )}
        </div>
      )}

      {step === "recette" && (
        <div className="flex flex-col gap-3">
          {recipes.length === 0 ? (
            <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-4 text-center text-[13px] text-ink-soft">
              Ton carnet est vide. Ajoute une recette pour pouvoir la planifier.
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-[10px] border-2 border-ink bg-paper-light px-3">
                <Search className="size-4 shrink-0 text-ink-soft" strokeWidth={2.5} aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Chercher une recette…"
                  autoFocus
                  className="h-11 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-soft"
                />
              </div>
              <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                {filtered.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => chooseRecipe(r.id)}
                      disabled={pending}
                      className="flex w-full items-center gap-2 rounded-[10px] border-2 border-ink bg-paper-light px-3 py-2.5 text-left text-[14px] font-medium text-ink outline-none transition-colors hover:bg-sauge focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 motion-reduce:transition-none"
                    >
                      <Utensils className="size-4 shrink-0 text-ink-soft" strokeWidth={2.5} aria-hidden />
                      <span className="line-clamp-2 leading-tight">{r.titre}</span>
                    </button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="px-1 py-3 text-center font-mono text-[12px] text-ink-soft">
                    Aucune recette pour « {query} ».
                  </li>
                )}
              </ul>
            </>
          )}
          <BackToMenu onClick={() => setStep("menu")} disabled={pending} />
        </div>
      )}

      {step === "texte" && (
        <div className="flex flex-col gap-3">
          <input
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder="Ex : restes, pizza surgelée…"
            maxLength={80}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") submitTexte()
            }}
            className="h-12 w-full rounded-[10px] border-2 border-ink bg-paper-light px-3 text-base text-ink outline-none placeholder:text-ink-soft focus-visible:shadow-riso-sauge"
          />
          <RisoButton
            onClick={submitTexte}
            disabled={pending || texte.trim() === ""}
            className="h-12 w-full text-sm"
          >
            {pending ? "Placement…" : "Placer ce repas"}
          </RisoButton>
          <BackToMenu onClick={() => setStep("menu")} disabled={pending} />
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
        >
          {error}
        </p>
      )}
    </>
  )
}

/** Une des entrées du menu du sheet : pastille icône + libellé + sous-titre. */
function ChoiceButton({
  icon: Icon,
  label,
  hint,
  variant,
  onClick,
}: {
  icon: typeof ChefHat
  label: string
  hint: string
  variant: "primary" | "secondary"
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-[12px] border-2 border-ink bg-paper-light p-3 text-left text-ink shadow-riso-ink-sm outline-none transition-[transform,box-shadow] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:translate-x-[2px] active:translate-y-[2px] active:shadow-none motion-reduce:transition-none"
    >
      <span
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-ink",
          variant === "primary" ? "bg-brique text-paper-light" : "bg-sauge text-ink",
        )}
      >
        <Icon className="size-5" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-[15px] uppercase leading-tight tracking-tight text-ink">
          {label}
        </span>
        <span className="font-mono text-[11px] leading-snug text-ink-soft">
          {hint}
        </span>
      </span>
    </button>
  )
}

/** Retour au menu du sheet depuis une sous-étape (recette / texte). */
function BackToMenu({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled: boolean
}) {
  return (
    <RisoButton
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-full text-[11px]"
    >
      Retour
    </RisoButton>
  )
}
