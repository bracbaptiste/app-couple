"use client"

import Link from "next/link"
import { Dialog } from "@base-ui/react/dialog"
import {
  Check,
  Minus,
  Plus,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"

import { RisoButton, risoButtonVariants } from "@/components/ui/riso-button"
import { useSwipeDismiss } from "@/lib/hooks/useSwipeDismiss"
import { useSwipeReveal } from "@/lib/hooks/useSwipeReveal"
import { formatQuantites } from "@/lib/recipes/format"
import { cn } from "@/lib/utils"

/** Largeur révélée au swipe pour l'action « Retirer » (idiom app, cf. list-items). */
const SWIPE_REVEAL = 96

import {
  commitWeekList,
  previewWeekList,
  type GenerationApercu,
  type GenerationLigneView,
} from "./actions"

/** Liste de courses cible proposée à la génération (§8.5.2). */
export type CoursesListView = { id: string; name: string }

/** Étapes du flux : config → récap (validation niveau 2) → succès. */
type Step = "config" | "apercu" | "succes"

/**
 * Bouton + sheet de génération de la liste de courses de la semaine (PRD_V4
 * §8.5). Déclenchement TACTILE ici (le vocal viendra au prompt 12). Trois temps :
 *   1. config    — liste cible + nombre de personnes (défaut 2) ;
 *   2. apercu     — VALIDATION NIVEAU 2 : récap complet (créés, fusions, ignorés)
 *                   AVANT toute écriture (§6 : rien n'est écrit avant validation) ;
 *   3. succès    — tampon « C'EST NOTÉ ! » + lien vers la liste.
 *
 * La semaine générée est celle affichée (`weekStartKey`). Même habillage sheet
 * que `MealPlacementSheet` (Dialog base-ui + glisser pour fermer).
 */
export function GenerateWeekList({
  coursesLists,
  weekStartKey,
}: {
  coursesLists: CoursesListView[]
  weekStartKey: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <RisoButton
        variant="secondary"
        onClick={() => setOpen(true)}
        className="h-11 w-full text-[13px]"
      >
        <Sparkles className="size-4" strokeWidth={2.5} aria-hidden />
        Générer la liste de la semaine
      </RisoButton>

      <GenerateWeekListSheet
        open={open}
        onOpenChange={setOpen}
        coursesLists={coursesLists}
        weekStartKey={weekStartKey}
      />
    </>
  )
}

/**
 * Le sheet de génération, PILOTABLE (open contrôlé) : réutilisé par le bouton
 * tactile ci-dessus ET par le Cerveau (`planning.generer_liste`, prompt 12). Le
 * contenu se remonte à chaque ouverture (`seq`) pour repartir d'un état vierge.
 *
 * Options du vocal (§8.7) : `initialListId` pré-résout la liste cible (« … dans
 * Auchan »), `initialPersonnes` la fixe (défaut 2), `autoPreview` saute l'étape
 * de configuration et lance directement le récapitulatif niveau 2 — RIEN n'est
 * écrit avant validation (§6).
 */
export function GenerateWeekListSheet({
  open,
  onOpenChange,
  coursesLists,
  weekStartKey,
  initialListId,
  initialPersonnes,
  autoPreview,
  brainTexteDicte,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  coursesLists: CoursesListView[]
  weekStartKey: string
  initialListId?: string
  initialPersonnes?: number
  autoPreview?: boolean
  brainTexteDicte?: string
}) {
  // Remonte le contenu à chaque (ré)ouverture → l'état repart à zéro sans reset manuel.
  const [seq, setSeq] = useState(0)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) setSeq((n) => n + 1)
    wasOpen.current = open
  }, [open])

  const { offset, dragging, releasing, onTransitionEnd, swipeHandlers } =
    useSwipeDismiss({ onDismiss: () => onOpenChange(false) })

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onOpenChange(false)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88vh] w-full max-w-sm touch-none flex-col",
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
          <div className="mx-auto mb-[18px] h-[5px] w-12 shrink-0 rounded-full bg-ink" />
          <GenerateContent
            key={seq}
            coursesLists={coursesLists}
            weekStartKey={weekStartKey}
            initialListId={initialListId}
            initialPersonnes={initialPersonnes}
            autoPreview={autoPreview}
            brainTexteDicte={brainTexteDicte}
            onClose={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Contenu du sheet, remonté à chaque ouverture (via `key`) : l'état (étape,
 * sélection, récap) repart à zéro sans effet de réinitialisation manuel.
 */
function GenerateContent({
  coursesLists,
  weekStartKey,
  initialListId,
  initialPersonnes,
  autoPreview,
  brainTexteDicte,
  onClose,
}: {
  coursesLists: CoursesListView[]
  weekStartKey: string
  initialListId?: string
  initialPersonnes?: number
  autoPreview?: boolean
  brainTexteDicte?: string
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>("config")
  // Liste cible : celle pré-résolue par le vocal si elle existe bien, sinon la 1re.
  const initialResolved =
    initialListId && coursesLists.some((l) => l.id === initialListId)
      ? initialListId
      : undefined
  const [listId, setListId] = useState<string>(
    initialResolved ?? coursesLists[0]?.id ?? "",
  )
  const [personnes, setPersonnes] = useState(
    initialPersonnes && initialPersonnes > 0 ? Math.round(initialPersonnes) : 2,
  ) // défaut 2 (§8.5.2)
  const [apercu, setApercu] = useState<GenerationApercu | null>(null)
  // Articles RETIRÉS au récap (§8.5.5) d'un swipe : clés normalisées écartées de
  // l'écriture. Réinitialisé à chaque nouveau récapitulatif.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | undefined>()

  function toggleExclude(cle: string, retire: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (retire) next.add(cle)
      else next.delete(cle)
      return next
    })
  }

  // Vocal (§8.7) : liste pré-résolue + auto-preview → on saute la configuration et
  // on lance directement le récapitulatif niveau 2 (rien d'écrit avant validation).
  const autoRan = useRef(false)
  useEffect(() => {
    if (!autoPreview || autoRan.current) return
    if (!listId) return
    autoRan.current = true
    lancerApercu()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPreview, listId])

  // Aucune liste de courses : rien à cibler.
  if (coursesLists.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Dialog.Title className="text-center font-display text-[20px] uppercase leading-none tracking-tight text-ink">
          Générer la liste
        </Dialog.Title>
        <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-4 text-center text-[13px] text-ink-soft">
          Crée d’abord une liste de courses pour pouvoir y générer la semaine.
        </p>
        <RisoButton variant="ghost" onClick={onClose} className="h-10 w-full text-[11px]">
          Fermer
        </RisoButton>
      </div>
    )
  }

  function lancerApercu() {
    setError(undefined)
    startTransition(async () => {
      const res = await previewWeekList(listId, personnes, weekStartKey)
      if (res.ok) {
        setApercu(res.apercu)
        setExcluded(new Set()) // nouveau récap → aucun retrait en cours
        setStep("apercu")
      } else {
        setError(res.error)
      }
    })
  }

  function valider() {
    setError(undefined)
    startTransition(async () => {
      // Vocal (§8.7) : on transmet la phrase dictée → la génération est journalisée
      // (§7). En tactile, `brainTexteDicte` est absent → aucune ligne de ticket.
      const brain = brainTexteDicte ? { texteDicte: brainTexteDicte } : undefined
      // Les articles retirés au swipe (§8.5.5) sont écartés de l'écriture.
      const res = await commitWeekList(
        listId,
        personnes,
        weekStartKey,
        brain,
        [...excluded],
      )
      if (res.ok) {
        setApercu(res.apercu)
        setStep("succes")
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {step === "config" && (
        <ConfigStep
          coursesLists={coursesLists}
          listId={listId}
          onListId={setListId}
          personnes={personnes}
          onPersonnes={setPersonnes}
          pending={pending}
          onSubmit={lancerApercu}
        />
      )}

      {step === "apercu" && apercu && (
        <ApercuStep
          apercu={apercu}
          excluded={excluded}
          onToggleExclude={toggleExclude}
          pending={pending}
          onBack={() => setStep("config")}
          onValider={valider}
        />
      )}

      {step === "succes" && apercu && (
        <SuccesStep apercu={apercu} onClose={onClose} />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[12px] font-medium leading-snug text-ink"
        >
          {error}
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Étape 1 — configuration (liste cible + nombre de personnes)                */
/* -------------------------------------------------------------------------- */

function ConfigStep({
  coursesLists,
  listId,
  onListId,
  personnes,
  onPersonnes,
  pending,
  onSubmit,
}: {
  coursesLists: CoursesListView[]
  listId: string
  onListId: (id: string) => void
  personnes: number
  onPersonnes: (n: number) => void
  pending: boolean
  onSubmit: () => void
}) {
  return (
    <>
      <div className="shrink-0">
        <Dialog.Title className="text-center font-display text-[20px] uppercase leading-none tracking-tight text-ink">
          Générer la liste
        </Dialog.Title>
        <p className="mt-1 text-center font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          Repas-recette de la semaine → courses
        </p>
      </div>

      {/* Liste cible (§8.5.2). */}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Dans quelle liste ?
        </p>
        <div className="flex flex-col gap-2">
          {coursesLists.map((l) => {
            const active = l.id === listId
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onListId(l.id)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-2 rounded-[10px] border-2 px-3 py-2.5 text-left text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper motion-reduce:transition-none",
                  active
                    ? "border-ink bg-sauge text-ink shadow-riso-ink-sm"
                    : "border-ink/40 bg-paper-light text-ink hover:border-ink",
                )}
              >
                <ShoppingCart className="size-4 shrink-0 text-ink-soft" strokeWidth={2.5} aria-hidden />
                <span className="line-clamp-1 flex-1">{l.name}</span>
                {active && <Check className="size-4 shrink-0 text-ink" strokeWidth={3} aria-hidden />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Nombre de personnes (§8.5.2, défaut 2). */}
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          Pour combien de personnes ?
        </p>
        <div className="flex items-center gap-2">
          <StepperButton
            label="Retirer une personne"
            onClick={() => onPersonnes(Math.max(1, personnes - 1))}
            disabled={personnes <= 1}
            icon={Minus}
          />
          <span className="w-8 text-center font-display text-[20px] text-ink" aria-live="polite">
            {personnes}
          </span>
          <StepperButton
            label="Ajouter une personne"
            onClick={() => onPersonnes(personnes + 1)}
            icon={Plus}
          />
        </div>
      </div>

      <RisoButton onClick={onSubmit} disabled={pending || !listId} className="h-12 w-full text-sm">
        {pending ? "Calcul en cours…" : "Voir le récapitulatif"}
      </RisoButton>
    </>
  )
}

/** Bouton rond du stepper (zone tap ≥ 44px). */
function StepperButton({
  label,
  onClick,
  disabled,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon: typeof Plus
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex size-11 items-center justify-center rounded-[10px] border-2 border-ink bg-paper-light text-ink outline-none transition-[transform,background-color] hover:bg-sauge active:translate-x-px active:translate-y-px focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-40 motion-reduce:transition-none"
    >
      <Icon className="size-5" strokeWidth={2.5} aria-hidden />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/*  Étape 2 — VALIDATION NIVEAU 2 : récap complet AVANT écriture               */
/* -------------------------------------------------------------------------- */

const RAISON_LABEL: Record<"texte" | "sans_ingredient" | "deja_genere", string> = {
  texte: "texte libre",
  sans_ingredient: "sans ingrédient",
  deja_genere: "déjà générée",
}

function ApercuStep({
  apercu,
  excluded,
  onToggleExclude,
  pending,
  onBack,
  onValider,
}: {
  apercu: GenerationApercu
  /** Clés retirées au swipe : écartées de l'écriture (§8.5.5). */
  excluded: Set<string>
  onToggleExclude: (cle: string, retire: boolean) => void
  pending: boolean
  onBack: () => void
  onValider: () => void
}) {
  const { creees, fusionnees, ignores, aEcrire } = apercu
  // Ce qui sera réellement écrit = total moins les articles retirés au swipe.
  const restants = aEcrire - excluded.size

  return (
    <>
      <div className="shrink-0">
        <Dialog.Title className="text-center font-display text-[20px] uppercase leading-none tracking-tight text-ink">
          Récapitulatif
        </Dialog.Title>
        <p className="mt-1 text-center font-mono text-[11px] uppercase tracking-wide text-ink-soft">
          {apercu.listName} · pour {apercu.cible}
        </p>
      </div>

      <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
        {aEcrire === 0 && (
          <p className="rounded-[10px] border-2 border-dashed border-ink bg-paper-light px-4 py-4 text-center text-[13px] text-ink-soft">
            Aucun repas-recette à transformer cette semaine.
          </p>
        )}

        {aEcrire > 0 && (
          <p className="font-mono text-[10px] uppercase tracking-wide text-ink-soft">
            Glisse un article vers la gauche pour le retirer.
          </p>
        )}

        {creees.length > 0 && (
          <RecapSection titre={`Nouveaux articles (${creees.length})`}>
            {creees.map((l, i) => (
              <RecapLigne
                key={`c-${l.cle}-${i}`}
                ligne={l}
                retire={excluded.has(l.cle)}
                onToggleExclude={onToggleExclude}
              />
            ))}
          </RecapSection>
        )}

        {fusionnees.length > 0 && (
          <RecapSection titre={`Fusionnés à des articles déjà présents (${fusionnees.length})`}>
            {fusionnees.map((l, i) => (
              <RecapLigne
                key={`f-${l.cle}-${i}`}
                ligne={l}
                fusion
                retire={excluded.has(l.cle)}
                onToggleExclude={onToggleExclude}
              />
            ))}
          </RecapSection>
        )}

        {ignores.length > 0 && (
          <RecapSection titre={`Repas ignorés (${ignores.length})`}>
            <ul className="flex flex-col gap-1">
              {ignores.map((r, i) => (
                <li
                  key={`i-${i}`}
                  className="flex items-baseline justify-between gap-2 rounded-[8px] border-2 border-ink/20 bg-paper-light/70 px-3 py-1.5 text-[13px] text-ink-soft"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-[10px] uppercase tracking-wide">
                      {r.jour}
                    </span>{" "}
                    <span className="line-clamp-1 align-baseline">{r.libelle}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase">
                    {RAISON_LABEL[r.raison]}
                  </span>
                </li>
              ))}
            </ul>
          </RecapSection>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-2">
        <RisoButton
          onClick={onValider}
          disabled={pending || restants === 0}
          className="h-12 w-full text-sm"
        >
          <ShoppingCart className="size-4" strokeWidth={2.5} aria-hidden />
          {pending
            ? "Écriture…"
            : restants === 0
              ? "Rien à ajouter"
              : `Valider et ajouter (${restants})`}
        </RisoButton>
        <RisoButton variant="ghost" onClick={onBack} disabled={pending} className="h-10 w-full text-[11px]">
          Retour
        </RisoButton>
      </div>
    </>
  )
}

/** Cadre d'une section de récap (créés / fusionnés / ignorés). */
function RecapSection({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {titre}
      </h3>
      {children}
    </section>
  )
}

/**
 * Une ligne de récap : produit + quantité résultante, et le détail transparent
 * de ce que chaque repas apporte (§6 « jamais de fusion silencieuse »). Pour une
 * fusion dans une ligne existante, on montre l'état initial → final.
 *
 * RETIRABLE au swipe (§8.5.5) : glisser vers la gauche découvre l'action « Retirer »
 * (geste mutualisé {@link useSwipeReveal}, comme les articles de liste) ; l'article
 * est alors écarté de l'écriture, réversible via « Rétablir ». Rien n'est écrit tant
 * que « Valider » n'est pas pressé (§6).
 */
function RecapLigne({
  ligne,
  fusion,
  retire,
  onToggleExclude,
}: {
  ligne: GenerationLigneView
  fusion?: boolean
  retire: boolean
  onToggleExclude: (cle: string, retire: boolean) => void
}) {
  const {
    offset,
    setOffset,
    dragging,
    didDragRef,
    close: closeSwipe,
    swipeHandlers,
  } = useSwipeReveal({ revealWidth: SWIPE_REVEAL, enabled: !retire })

  // Retiré : rangée atténuée + barrée, non swipable, avec un « Rétablir ».
  if (retire) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[8px] border-2 border-dashed border-ink/30 bg-paper-light/50 px-3 py-2">
        <span className="min-w-0 truncate text-[14px] font-medium text-ink-soft line-through">
          {ligne.nom}
        </span>
        <button
          type="button"
          onClick={() => onToggleExclude(ligne.cle, false)}
          className="inline-flex shrink-0 items-center gap-1 rounded-[6px] px-1.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft outline-none focus-visible:ring-2 focus-visible:ring-ink"
        >
          <RotateCcw className="size-3.5" strokeWidth={2.5} aria-hidden />
          Rétablir
        </button>
      </div>
    )
  }

  const initial =
    fusion && ligne.quantitesInitiales.length > 0
      ? formatQuantites(ligne.quantitesInitiales)
      : null

  return (
    <div className="relative overflow-hidden rounded-[8px]">
      {/* Calque d'action « Retirer », révélé au glissement (et au focus clavier). */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 z-0 flex overflow-hidden rounded-r-[8px] border-y-2 border-r-2 border-ink transition-opacity duration-200 motion-reduce:transition-none",
          offset === 0 && !dragging ? "opacity-0" : "opacity-100",
        )}
        onFocus={() => setOffset(-SWIPE_REVEAL)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) closeSwipe()
        }}
      >
        <button
          type="button"
          aria-label={`Retirer ${ligne.nom} du récapitulatif`}
          onClick={() => {
            closeSwipe()
            onToggleExclude(ligne.cle, true)
          }}
          className="inline-flex w-24 items-center justify-center gap-1 bg-brique font-mono text-[11px] font-bold uppercase tracking-wide text-paper-light outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-paper-light"
        >
          <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
          Retirer
        </button>
      </div>

      {/* Carte au premier plan : glisse via translateX. `touch-pan-y` réserve le
          scroll vertical au navigateur et l'horizontale au geste. */}
      <div
        className={cn(
          "relative z-10 flex touch-pan-y select-none flex-col gap-1 rounded-[8px] border-2 border-ink bg-paper-light px-3 py-2",
          (offset !== 0 || dragging) && "rounded-r-none",
          dragging
            ? ""
            : "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{ transform: `translateX(${offset}px)` }}
        {...swipeHandlers}
        onClickCapture={(e) => {
          // Fin de glissement : on avale le click. Ligne ouverte : on referme.
          if (didDragRef.current) {
            e.preventDefault()
            e.stopPropagation()
            didDragRef.current = false
            return
          }
          if (offset !== 0) {
            e.preventDefault()
            e.stopPropagation()
            closeSwipe()
          }
        }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-[14px] font-medium text-ink">{ligne.nom}</span>
          <span className="shrink-0 font-mono text-[12px] text-ink">
            {initial && <span className="text-ink-soft">{initial} → </span>}
            {formatQuantites(ligne.quantitesFinales)}
          </span>
        </div>
        <ul className="flex flex-col gap-0.5 border-t border-ink/15 pt-1">
          {ligne.detail.map((d, i) => (
            <li key={i} className="flex items-baseline justify-between gap-2 text-[11px] text-ink-soft">
              <span className="min-w-0 truncate">
                <span className="font-mono uppercase">{d.jour}</span> · {d.repas}
              </span>
              <span className="shrink-0 font-mono">{d.texte}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Étape 3 — succès (tampon « C'EST NOTÉ ! »)                                 */
/* -------------------------------------------------------------------------- */

function SuccesStep({ apercu, onClose }: { apercu: GenerationApercu; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <span className="inline-flex -rotate-3 items-center gap-2 rounded-[10px] border-[2.5px] border-brique bg-brique/10 px-4 py-2 font-display text-[22px] uppercase tracking-tight text-brique shadow-riso-ink-sm">
        <Check className="size-6" strokeWidth={3} aria-hidden />
        C’est noté !
      </span>
      <p className="text-[14px] text-ink">
        {apercu.aEcrire} article{apercu.aEcrire > 1 ? "s" : ""} ajouté
        {apercu.aEcrire > 1 ? "s" : ""} à <span className="font-medium">{apercu.listName}</span>.
      </p>
      <Link
        href={`/lists/${apercu.listId}`}
        className={cn(risoButtonVariants(), "h-12 w-full text-sm")}
      >
        <ShoppingCart className="size-4" strokeWidth={2.5} aria-hidden />
        Voir la liste
      </Link>
      <RisoButton variant="ghost" onClick={onClose} className="h-10 w-full text-[11px]">
        Fermer
      </RisoButton>
    </div>
  )
}
