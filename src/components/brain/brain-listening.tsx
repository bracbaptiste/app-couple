"use client"

import { Loader2, WifiOff, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"

import { RisoButton } from "@/components/ui/riso-button"
import { addTask } from "@/app/(app)/lists/[listId]/task-actions"
import { type AddTaskOptions } from "@/components/todo/AddTaskBar"
import {
  MESSAGE_SUPPRESSION,
  niveauAction,
  type BrainAction,
  type BrainCommandResult,
  type Clarification,
  type EcranContext,
  type NavCible,
  type Outil,
} from "@/lib/brain/command-parsing"
import {
  executeBrainActions,
  undoBrainActions,
  type BrainUndo,
  type RecapLigne,
} from "@/lib/brain/execute"
import { undoBrainCommand } from "@/lib/brain/journal"
import { useOnlineStatus } from "@/lib/offline/use-online-status"
import {
  TaskReviewSheet,
  taskActionToInitial,
  type ReviewListOption,
  type ReviewMember,
} from "@/components/todo/TaskReviewSheet"
import {
  GenerateWeekListSheet,
  type CoursesListView,
} from "@/app/(app)/planning/generate-week-list"
import { ConsultationPanel } from "@/components/brain/consultation-panel"
import { ProposeRecipeFlow } from "@/app/(app)/recipes/propose-recipe-flow"
import { AddIngredientsFlow } from "@/app/(app)/recipes/add-ingredients-flow"
import { WeekProposalFlow } from "@/app/(app)/planning/week-proposal-flow"

/**
 * BrainListening — l'UI vocale du Cerveau (PRD V4 §5.4/§5.5, §4.2, §6).
 *
 * Chaîne d'états : Écoute → Réflexion → puis selon le lot d'actions (§6) :
 *   - ambiguïté de liste → CLARIFICATION à choix (§5.3, jamais de choix arbitraire) ;
 *   - 1 seule action niveau 1 → tampon direct « C'EST NOTÉ ! » + ANNULER ;
 *   - 1 seule `taches.ajouter` (niveau 2) → écran de validation V2.1 pré-rempli ;
 *   - plusieurs actions OU ≥ 1 niveau 2 → RÉCAP unique, chaque ligne désactivable,
 *     exécution après validation globale.
 *
 * Entrée voix = DICTÉE NATIVE du clavier (comme V2.1) : un textarea focalisé se
 * remplit (la « transcription en direct », §5.5) ; « Terminé » envoie au routeur
 * `/api/brain-command`. Hors-ligne (§5.5) : panneau grisé, aucun appel, aucune
 * erreur brute. Toute animation est décorative (§4.4) : chaque état reste lisible
 * sans elle.
 */

const TEXT_MAX = 1000

/** Durée d'affichage du toast récap avec ANNULER (§6 « ~6 s »). */
const TOAST_MS = 6000

/** Intents exécutés côté serveur en niveau 1 ({@link executeBrainActions}). */
const INTENTS_SERVEUR_NIVEAU_1 = new Set<BrainAction["intent"]>([
  "courses.ajouter_article",
  "courses.cocher_article",
  "courses.decocher_article",
  "bibliotheque.ajouter_article",
  "taches.cocher",
  "planning.placer_repas",
])

/** Routes des outils (§2.1) pour `navigation.ouvrir` (niveau 1 client). */
const OUTIL_HREF: Record<Outil, string> = {
  listes: "/lists",
  bibliotheque: "/library",
  recettes: "/recipes",
  planning: "/planning",
  profil: "/profile",
}

function navHref(cible: NavCible): string {
  if (cible.type === "outil") return OUTIL_HREF[cible.outil]
  if (cible.type === "liste") return `/lists/${cible.liste_id}`
  return `/recipes/${cible.recipe_id}`
}

type Step =
  | "offline"
  | "dictate"
  | "thinking"
  | "clarify"
  | "recap"
  | "taskReview"
  | "planningGen"
  // Écrans IA Phase 6 (§5.2), montés hors modale : consultation lecture seule,
  // proposition de recette, ajout d'ingrédients, proposition de semaine.
  | "special"
  | "done"
  | "message"
  | "error"

/**
 * Intents IA Phase 6 (§5.2) montés dans un écran DÉDIÉ (hors modale du panneau) :
 * consultation lecture seule, proposition de recette / de semaine (Opus), ajout
 * d'ingrédients avec validation. Portés par `pendingSpecial` + step `special`.
 */
type SpecialAction = Extract<
  BrainAction,
  {
    intent:
      | "consultation.lire"
      | "recettes.proposer"
      | "recettes.ajouter_ingredients"
      | "planning.proposer_semaine"
  }
>

const INTENTS_SPECIAL = new Set<BrainAction["intent"]>([
  "consultation.lire",
  "recettes.proposer",
  "recettes.ajouter_ingredients",
  "planning.proposer_semaine",
])

function estSpecial(a: BrainAction): a is SpecialAction {
  return INTENTS_SPECIAL.has(a.intent)
}

/** Contexte tâche renvoyé par la route pour monter l'écran V2.1 (§5.2). */
type TaskContext = {
  todoLists: ReviewListOption[]
  members: ReviewMember[]
}

/** Contexte planning renvoyé par la route pour monter l'écran de génération (§8.7). */
type PlanningContext = {
  coursesLists: CoursesListView[]
  weekStartKey: string
}

/** Génération de la semaine en attente (liste cible pré-résolue + personnes). */
type GenPending = { listId: string; personnes: number }

/** Réponse complète du routeur : schéma §5.3 + contextes tâche / planning. */
type BrainResponse = BrainCommandResult & {
  taskContext?: TaskContext
  planningContext?: PlanningContext
}

/** Une ligne du récap multi-intentions (§6), individuellement désactivable. */
type RecapItem = { action: BrainAction; enabled: boolean }

type Props = {
  /** Ouvre le panneau (déclenché par l'appui long sur le cerveau). */
  open: boolean
  /** Ferme le panneau et revient au repos. */
  onClose: () => void
  /** Écran courant (défauts d'ambiguïté §5.1) : route + éventuelle liste ouverte. */
  ecran: EcranContext | null
}

export function BrainListening({ open, onClose, ecran }: Props) {
  const router = useRouter()
  const online = useOnlineStatus()

  // Hors-ligne dès l'ouverture (§5.5) : on n'écoute pas, on l'annonce.
  const [step, setStep] = useState<Step>(online ? "dictate" : "offline")
  const [text, setText] = useState("")
  const [message, setMessage] = useState("")

  // Niveau 1 exécuté : récap transparent + données d'annulation (toast ANNULER).
  const [recap, setRecap] = useState<RecapLigne[]>([])
  const [undo, setUndo] = useState<BrainUndo | null>(null)
  // Id de la ligne de journal (§7) : l'ANNULER du toast passe par le même chemin
  // que le ticket (statut → annulé). `null` = fallback annulation directe.
  const [journalId, setJournalId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  // Ambiguïté de liste (§5.3).
  const [clarify, setClarify] = useState<Clarification | null>(null)

  // Récap multi-intentions (§6) + contexte pour l'écran V2.1.
  const [items, setItems] = useState<RecapItem[]>([])
  const [taskContext, setTaskContext] = useState<TaskContext | null>(null)

  // Génération de la semaine (§8.7, niveau 2) : contexte + cible pré-résolue.
  const [planningContext, setPlanningContext] = useState<PlanningContext | null>(null)
  const [gen, setGen] = useState<GenPending | null>(null)
  // Génération à ouvrir APRÈS les tâches, dans un lot mixte (comme navPending).
  const genPending = useRef<GenPending | null>(null)

  // Écran IA Phase 6 en cours (consultation / propositions / ingrédients).
  const [pendingSpecial, setPendingSpecial] = useState<SpecialAction | null>(null)
  // Écran IA différé après les tâches, dans un lot mixte (un seul par lot).
  const specialPending = useRef<SpecialAction | null>(null)

  // File d'écrans de validation V2.1 (taches.ajouter à valider un par un).
  const [taskQueue, setTaskQueue] = useState<BrainAction[]>([])
  const [reviewKey, setReviewKey] = useState(0)
  // Navigation à effectuer APRÈS les validations, dans un lot mixte.
  const navPending = useRef<NavCible | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const close = useCallback(() => onClose(), [onClose])

  // NB : l'état repart vierge à chaque ouverture parce que le parent MONTE ce
  // composant à l'ouverture et le DÉMONTE à la fermeture (montage conditionnel).

  // Étape dictée : focaliser le textarea pour faire apparaître le clavier (micro).
  useEffect(() => {
    if (open && step === "dictate") textareaRef.current?.focus()
  }, [open, step])

  // Échap ferme le panneau (sauf pendant la réflexion, non annulable).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && step !== "thinking") close()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, step, close])

  // Toast de succès : auto-fermeture après ~6 s (§6), sauf ANNULER entre-temps.
  useEffect(() => {
    if (step !== "done") return
    const timer = setTimeout(() => close(), TOAST_MS)
    return () => clearTimeout(timer)
  }, [step, close])

  /* --------------------------------------------------------- exécutions */

  /** Exécute un lot de niveau 1 serveur, puis affiche le tampon + toast ANNULER. */
  const executerNiveau1 = useCallback(
    async (actions: BrainAction[], texteDicte: string) => {
      setStep("thinking")
      try {
        const exec = await executeBrainActions(actions, texteDicte)
        if (!exec.ok) {
          setMessage(exec.error)
          setStep("error")
          return false
        }
        setRecap(exec.recap)
        setUndo(exec.undo)
        setJournalId(exec.journalId)
        setStep("done")
        return true
      } catch {
        setMessage("L'exécution a échoué. Réessaie.")
        setStep("error")
        return false
      }
    },
    [],
  )

  /** Ouvre l'écran de génération de la semaine (§8.7, niveau 2), cible pré-résolue. */
  const ouvrirGeneration = useCallback((g: GenPending) => {
    setGen(g)
    setStep("planningGen")
  }, [])

  /** Ouvre un écran IA Phase 6 dédié (consultation / propositions / ingrédients). */
  const ouvrirSpecial = useCallback((a: SpecialAction) => {
    setPendingSpecial(a)
    setStep("special")
  }, [])

  /** Ouvre l'écran V2.1 pour la 1re tâche de la file (ou termine le lot). */
  const ouvrirFileTaches = useCallback(
    (queue: BrainAction[]) => {
      if (queue.length > 0) {
        setTaskQueue(queue)
        setReviewKey((k) => k + 1)
        setStep("taskReview")
        return
      }
      // File vide : génération de la semaine différée (niveau 2), puis un écran IA
      // Phase 6 différé, puis navigation, sinon tampon (si un niveau 1 a tourné).
      if (genPending.current) {
        const g = genPending.current
        genPending.current = null
        ouvrirGeneration(g)
        return
      }
      if (specialPending.current) {
        const a = specialPending.current
        specialPending.current = null
        ouvrirSpecial(a)
        return
      }
      if (navPending.current) {
        const href = navHref(navPending.current)
        navPending.current = null
        close()
        router.push(href)
        return
      }
      setStep((s) => (s === "taskReview" ? "done" : s))
    },
    [close, router, ouvrirGeneration, ouvrirSpecial],
  )

  /* -------------------------------------------------- classement du lot */

  /** Classe le résultat du routeur et embranche vers le bon écran (§6). */
  const traiterResultat = useCallback(
    (result: BrainResponse, phrase: string) => {
      // Ambiguïté de liste : question à choix, jamais de choix arbitraire (§5.3).
      if (result.clarification) {
        setClarify(result.clarification)
        setStep("clarify")
        return
      }

      const actions = result.actions ?? []
      // Demande de suppression (§5.2) : jamais par la voix.
      if (
        actions.some((a) => a.intent === "inconnu" && a.raison === "suppression")
      ) {
        setMessage(MESSAGE_SUPPRESSION)
        setStep("message")
        return
      }
      // On ignore les `inconnu` non pertinents : seules les vraies actions comptent.
      const reelles = actions.filter((a) => a.intent !== "inconnu")
      if (reelles.length === 0) {
        setMessage("Je n'ai pas compris. Reformule ta phrase.")
        setStep("message")
        return
      }

      setTaskContext(result.taskContext ?? null)
      setPlanningContext(result.planningContext ?? null)

      // Chemin le plus simple : une seule action.
      if (reelles.length === 1) {
        const a = reelles[0]
        if (a.intent === "taches.ajouter") {
          navPending.current = null
          ouvrirFileTaches([a])
          return
        }
        // Génération de la semaine (§8.7, niveau 2) : écran de validation pré-rempli.
        if (a.intent === "planning.generer_liste") {
          ouvrirGeneration({ listId: a.liste_id, personnes: a.personnes })
          return
        }
        // Écrans IA Phase 6 (§5.2) : consultation lecture seule, propositions,
        // ajout d'ingrédients — chacun a son propre écran dédié.
        if (estSpecial(a)) {
          ouvrirSpecial(a)
          return
        }
        if (a.intent === "navigation.ouvrir") {
          const href = navHref(a.cible)
          close()
          router.push(href)
          return
        }
        void executerNiveau1([a], phrase)
        return
      }

      // Plusieurs actions (ou ≥ 1 niveau 2) → récap unique désactivable (§6).
      setItems(reelles.map((action) => ({ action, enabled: true })))
      setStep("recap")
    },
    [close, router, executerNiveau1, ouvrirFileTaches, ouvrirGeneration, ouvrirSpecial],
  )

  /** Appelle le routeur avec un écran donné (surchargé lors d'une clarification). */
  const envoyer = useCallback(
    async (phrase: string, ecranCtx: EcranContext | null) => {
      setMessage("")
      setStep("thinking")
      let result: BrainResponse
      try {
        const res = await fetch("/api/brain-command", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: phrase, contexte_ecran: ecranCtx }),
        })
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          setMessage(data?.error ?? "Le traitement a échoué. Réessaie.")
          setStep("error")
          return
        }
        result = (await res.json()) as BrainResponse
      } catch {
        // Réseau tombé en cours de route (la dictée exige le réseau, §5.5).
        setMessage("Le cerveau a besoin de réseau pour t'écouter.")
        setStep("error")
        return
      }
      traiterResultat(result, phrase)
    },
    [traiterResultat],
  )

  /** « Terminé » : envoie la phrase dictée (ou bascule hors-ligne, §5.5). */
  function send() {
    const phrase = text.trim().slice(0, TEXT_MAX)
    if (!phrase) return
    if (!online) {
      setStep("offline")
      return
    }
    void envoyer(phrase, ecran)
  }

  /** Choix d'une option de clarification : rejoue la phrase, liste imposée (§5.3). */
  function choisirListe(listeId: string) {
    const phrase = text.trim().slice(0, TEXT_MAX)
    if (!phrase) return
    setClarify(null)
    void envoyer(phrase, { route: ecran?.route ?? null, liste_id: listeId })
  }

  /**
   * Choix d'une recette pour un placement ambigu (§8.7) : on complète directement
   * le placement en attente avec la recette choisie (pas de re-routage — la phrase
   * resterait ambiguë), puis on exécute en niveau 1 (tampon + ANNULER).
   */
  function choisirRecette(recipeId: string, titre: string) {
    if (!clarify?.placement) return
    const action: BrainAction = {
      intent: "planning.placer_repas",
      date: clarify.placement.date,
      creneau: clarify.placement.creneau,
      repas: { kind: "recette", recipe_id: recipeId, titre },
    }
    setClarify(null)
    void executerNiveau1([action], text.trim().slice(0, TEXT_MAX))
  }

  /** « Valider » du récap : exécute le niveau 1, puis enchaîne les écrans V2.1. */
  async function validerRecap() {
    const retenues = items.filter((i) => i.enabled).map((i) => i.action)
    if (retenues.length === 0) return

    const serveur = retenues.filter((a) => INTENTS_SERVEUR_NIVEAU_1.has(a.intent))
    const taches = retenues.filter((a) => a.intent === "taches.ajouter")
    const navs = retenues.filter((a) => a.intent === "navigation.ouvrir")
    // Une seule navigation possible en fin de lot (la dernière l'emporte).
    const derniereNav = navs[navs.length - 1]
    navPending.current =
      derniereNav && derniereNav.intent === "navigation.ouvrir"
        ? derniereNav.cible
        : null
    // Génération de la semaine (niveau 2) : différée après les tâches (§6). Une
    // seule par lot (la dernière l'emporte). Ouverte par `ouvrirFileTaches`.
    const derniereGen = retenues
      .filter((a) => a.intent === "planning.generer_liste")
      .at(-1)
    genPending.current =
      derniereGen && derniereGen.intent === "planning.generer_liste"
        ? { listId: derniereGen.liste_id, personnes: derniereGen.personnes }
        : null
    // Écran IA Phase 6 différé (§5.2) : un seul par lot (le premier l'emporte),
    // ouvert après les tâches (comme la génération). Cas mono-intention traité en
    // amont ; en lot mixte, on ne monte qu'un écran dédié à la fois.
    specialPending.current = retenues.find(estSpecial) ?? null

    if (serveur.length > 0) {
      const ok = await executerNiveau1(serveur, text.trim().slice(0, TEXT_MAX))
      if (!ok) return // erreur affichée ; on n'enchaîne pas.
    }
    ouvrirFileTaches(taches)
  }

  /** Confirmation d'un écran V2.1 : crée la tâche puis passe à la suivante. */
  async function confirmerTache(
    listId: string,
    title: string,
    opts: AddTaskOptions,
  ) {
    try {
      await addTask({
        taskId: crypto.randomUUID(),
        listId,
        rawTitle: title,
        dueDate: opts.dueDate ? opts.dueDate.toISOString().slice(0, 10) : null,
        assignedTo: opts.assignedTo,
        recurrence: opts.recurrence,
      })
    } catch {
      // Échec de création : on ferme proprement (rattrapable tactilement).
    }
    const reste = taskQueue.slice(1)
    setTaskQueue(reste)
    ouvrirFileTaches(reste)
  }

  /**
   * ANNULER (§6/§7) : défait le lot niveau 1. Chemin nominal = la ligne de
   * journal (`undoBrainCommand`) → même annulation que depuis le ticket (statut
   * `fait` → `annule`, rayée, temps réel). Fallback = annulation directe si la
   * ligne de journal n'a pas pu être écrite (`journalId` null).
   */
  async function annuler() {
    if (undoing) return
    if (!journalId && !undo) return
    setUndoing(true)
    try {
      if (journalId) await undoBrainCommand(journalId)
      else if (undo) await undoBrainActions(undo)
    } catch {
      // Échec d'annulation : on ferme quand même (rattrapable depuis le ticket).
    }
    close()
  }

  /** « Voir le ticket » (§7) : ferme le panneau et ouvre le journal du Cerveau. */
  function voirTicket() {
    close()
    router.push("/profile/journal")
  }

  if (!open || typeof document === "undefined") return null

  // Écran de génération de la semaine (§8.7, niveau 2) : sheet EXISTANT du prompt
  // 10, monté hors de la modale du panneau, liste cible pré-résolue + auto-preview
  // (rien n'est écrit avant validation, §6).
  if (step === "planningGen" && gen) {
    if (!planningContext) {
      return renderMessagePanel(
        "Aïe",
        "Impossible d'ouvrir la génération de la semaine.",
        close,
      )
    }
    return (
      <GenerateWeekListSheet
        open
        onOpenChange={(next) => {
          if (!next) close()
        }}
        coursesLists={planningContext.coursesLists}
        weekStartKey={planningContext.weekStartKey}
        initialListId={gen.listId}
        initialPersonnes={gen.personnes}
        autoPreview
        brainTexteDicte={text.trim().slice(0, TEXT_MAX)}
      />
    )
  }

  // Écrans IA Phase 6 (§5.2), montés séparément, hors de la modale du panneau. Le
  // texte dicté est transmis pour journaliser les propositions acceptées (§7).
  if (step === "special" && pendingSpecial) {
    const phrase = text.trim().slice(0, TEXT_MAX)
    switch (pendingSpecial.intent) {
      case "consultation.lire":
        // Lecture seule (§2.4) : aucun écriture, pas de journal.
        return <ConsultationPanel cible={pendingSpecial.cible} onClose={close} />
      case "recettes.proposer":
        return (
          <ProposeRecipeFlow
            contraintes={pendingSpecial.contraintes}
            texteDicte={phrase}
            onClose={close}
          />
        )
      case "recettes.ajouter_ingredients":
        return (
          <AddIngredientsFlow
            recipeId={pendingSpecial.recipe_id}
            titre={pendingSpecial.titre}
            listId={pendingSpecial.liste_id}
            personnes={pendingSpecial.personnes}
            texteDicte={phrase}
            onClose={close}
          />
        )
      case "planning.proposer_semaine":
        if (!planningContext) {
          return renderMessagePanel(
            "Aïe",
            "Impossible d'ouvrir la proposition de semaine.",
            close,
          )
        }
        return (
          <WeekProposalFlow
            contraintes={pendingSpecial.contraintes}
            weekStartKey={planningContext.weekStartKey}
            texteDicte={phrase}
            onClose={close}
          />
        )
    }
  }

  // Écran V2.1 (§5.2, niveau 2) : monté séparément, hors de la modale du panneau.
  if (step === "taskReview" && taskContext && taskQueue.length > 0) {
    const a = taskQueue[0]
    if (a.intent !== "taches.ajouter") return null
    const defaultListId = taskContext.todoLists[0]?.id ?? ""
    if (!defaultListId) {
      // Aucune to-do list : impossible d'ajouter une tâche → message clair.
      return renderMessagePanel(
        "Aïe",
        "Aucune liste de tâches pour y ranger ça.",
        close,
      )
    }
    const initial = taskActionToInitial(a, {
      lists: taskContext.todoLists,
      members: taskContext.members,
      defaultListId,
      defaultAssignee: null,
    })
    return (
      <TaskReviewSheet
        key={reviewKey}
        open
        initial={initial}
        lists={taskContext.todoLists}
        members={taskContext.members}
        onClose={close}
        onConfirm={confirmerTache}
        confirmLabel={taskQueue.length > 1 ? "Ajouter et suivant" : "Ajouter"}
      />
    )
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Commande vocale"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      {/* Voile encre — tap = fermeture (sauf pendant la réflexion, non annulable). */}
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={step === "thinking" ? undefined : close}
        className="absolute inset-0 bg-ink/40"
      />

      <div className="relative w-full max-w-sm rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        {/* ------------------------------------------------- Étape : hors-ligne */}
        {step === "offline" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base uppercase leading-none text-ink-soft">
                Hors-ligne
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
              >
                <X className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            {/* Panneau grisé : l'écoute est indisponible, le reste de l'app marche. */}
            <div className="flex items-center gap-3 rounded-[8px] border-2 border-dashed border-ink-soft bg-paper px-3 py-3 opacity-70">
              <WifiOff
                className="size-6 shrink-0 text-ink-soft"
                strokeWidth={2.5}
                aria-hidden
              />
              <p
                role="status"
                className="text-[13px] font-medium leading-snug text-ink"
              >
                Le cerveau a besoin de réseau pour t’écouter.
              </p>
            </div>
            <div className="flex justify-end">
              <RisoButton variant="ghost" size="sm" onClick={close}>
                Fermer
              </RisoButton>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- Étape : Écoute */}
        {step === "dictate" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send()
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base uppercase leading-none text-ink">
                Je t’écoute…
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
              >
                <X className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>

            {/* Habillage décoratif (§4.2/§4.4) : anneaux pointillés + barres d'encre. */}
            <div aria-hidden className="flex items-center justify-center gap-4 py-1">
              <span className="relative inline-flex size-14 items-center justify-center">
                <span className="brain-listen-ring absolute inset-0 rounded-full border-2 border-dashed border-brique" />
                <span
                  className="brain-listen-ring absolute inset-0 rounded-full border-2 border-dashed border-brique"
                  style={{ animationDelay: "900ms" }}
                />
                <span className="flex items-center gap-1">
                  <span className="brain-logo is-listening size-3 rounded-full border-2 border-ink bg-sauge" />
                  <span
                    className="brain-logo is-listening size-3 rounded-full border-2 border-ink bg-brique"
                    style={{ animationDelay: "-400ms" }}
                  />
                </span>
              </span>
              <div className="flex h-8 items-end gap-1">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="brain-ink-bar h-full w-1.5 rounded-full bg-ink"
                    style={{ animationDelay: `${i * 120}ms` }}
                  />
                ))}
              </div>
            </div>

            <p className="font-body text-[13px] leading-snug text-ink-soft">
              Tape sur le micro de ton clavier pour dicter, ou écris. Ex : «
              Ajoute le lait et le beurre à la liste Auchan ».
            </p>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={3}
              maxLength={TEXT_MAX}
              placeholder="Dicte ou écris ta commande…"
              aria-label="Commande à dicter"
              className="w-full resize-none rounded-[8px] border-2 border-ink bg-paper-light px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft/60 focus-visible:shadow-riso-sauge"
            />
            <div className="flex justify-end gap-2">
              <RisoButton variant="ghost" size="sm" onClick={close}>
                Annuler
              </RisoButton>
              <RisoButton type="submit" size="sm" disabled={!text.trim()}>
                Terminé
              </RisoButton>
            </div>
          </form>
        )}

        {/* ------------------------------------------------- Étape : Réflexion */}
        {step === "thinking" && (
          <div
            className="flex flex-col items-center gap-3 py-8 text-ink-soft"
            aria-live="polite"
          >
            {/* Oscillations « ils se parlent » (§4.2) : sauge ⇄ brique. */}
            <span className="flex items-center gap-1.5" aria-hidden>
              <span className="brain-thinking-l size-3.5 rounded-full border-2 border-ink bg-sauge" />
              <span className="brain-thinking-r size-3.5 rounded-full border-2 border-ink bg-brique" />
            </span>
            <p className="font-mono text-[12px] uppercase tracking-wide">
              Le cerveau réfléchit…
            </p>
          </div>
        )}

        {/* ---------------------------------------------- Étape : Clarification */}
        {step === "clarify" && clarify && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base uppercase leading-none text-ink">
                {clarify.question}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
              >
                <X className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            <p className="font-body text-[13px] leading-snug text-ink-soft">
              {clarify.placement
                ? "Choisis une recette, ou redis le nom."
                : "Choisis une liste, ou redis le nom."}
            </p>
            <div className="flex flex-wrap gap-2">
              {clarify.options.map((opt) => (
                <button
                  key={opt.recipe_id ?? opt.liste_id ?? opt.label}
                  type="button"
                  onClick={() =>
                    clarify.placement && opt.recipe_id
                      ? choisirRecette(opt.recipe_id, opt.label)
                      : opt.liste_id
                        ? choisirListe(opt.liste_id)
                        : undefined
                  }
                  className="inline-flex min-h-11 items-center rounded-[8px] border-2 border-ink bg-paper-light px-3 py-1.5 font-mono text-[12px] font-bold uppercase tracking-wide text-ink shadow-riso-sauge outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <RisoButton
                variant="ghost"
                size="sm"
                onClick={() => {
                  setClarify(null)
                  setStep("dictate")
                }}
              >
                Redire
              </RisoButton>
            </div>
          </div>
        )}

        {/* --------------------------------------------------- Étape : Récap */}
        {step === "recap" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base uppercase leading-none text-ink">
                À valider
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
              >
                <X className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            <p className="font-body text-[13px] leading-snug text-ink-soft">
              Décoche ce que tu ne veux pas. Les tâches structurées passeront par
              leur écran de validation.
            </p>
            <ul className="flex flex-col gap-2">
              {items.map((item, i) => (
                <li key={i}>
                  <label
                    className="flex cursor-pointer items-start gap-2.5 rounded-[8px] border-2 border-ink bg-paper px-3 py-2"
                    style={{ opacity: item.enabled ? 1 : 0.5 }}
                  >
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((it, j) =>
                            j === i ? { ...it, enabled: e.target.checked } : it,
                          ),
                        )
                      }
                      className="mt-0.5 size-4 shrink-0 accent-sauge"
                    />
                    <span className="min-w-0 text-[13px] leading-snug text-ink">
                      {decrireAction(item.action)}
                      {niveauAction(item.action) === 2 && (
                        <span className="ml-1.5 rounded-[3px] border border-ink-soft px-1 font-mono text-[9px] uppercase tracking-wide text-ink-soft">
                          à valider
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 pt-1">
              <RisoButton variant="ghost" size="sm" onClick={close}>
                Annuler
              </RisoButton>
              <RisoButton
                size="sm"
                onClick={validerRecap}
                disabled={items.every((i) => !i.enabled)}
              >
                Valider
              </RisoButton>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- Étape : Succès */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-2">
            {/* Tampon qui claque (§4.4, ~450 ms). L'info est portée par le texte. */}
            <div
              role="status"
              className="brain-stamp inline-flex -rotate-3 items-center rounded-[10px] border-[3px] border-brique bg-paper px-4 py-2 shadow-riso-brique"
            >
              <span className="font-display text-lg uppercase leading-none text-brique">
                C’est noté !
              </span>
            </div>

            {/* Toast récap — transparence des fusions (§6). */}
            <div className="w-full rounded-[10px] border-2 border-ink bg-paper-light p-3">
              <ul className="flex flex-col gap-1.5">
                {recap.map((ligne, i) => (
                  <li
                    key={`${ligne.nom}-${i}`}
                    className="flex items-baseline justify-between gap-3 text-[14px] text-ink"
                  >
                    <span className="min-w-0 font-medium">{ligne.nom}</span>
                    <span className="shrink-0 font-mono text-[12px] text-ink-soft">
                      {ligne.detail}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {/* Voir le ticket (§7) : accès au journal depuis le toast. */}
                <button
                  type="button"
                  onClick={voirTicket}
                  className="inline-flex min-h-9 items-center rounded-[8px] px-1 font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  Voir le ticket
                </button>
                <div className="flex justify-end gap-2">
                  {(undo?.ops.length ?? 0) > 0 && (
                    <RisoButton
                      variant="secondary"
                      size="sm"
                      onClick={annuler}
                      disabled={undoing}
                    >
                      {undoing ? (
                        <Loader2
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : (
                        "Annuler"
                      )}
                    </RisoButton>
                  )}
                  <RisoButton size="sm" onClick={close}>
                    OK
                  </RisoButton>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------ Étapes : message / erreur */}
        {(step === "message" || step === "error") && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base uppercase leading-none text-ink">
                {step === "error" ? "Aïe" : "Le cerveau répond"}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Fermer"
                className="inline-flex size-9 items-center justify-center rounded-[8px] text-ink-soft outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px"
              >
                <X className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
            <p
              role={step === "error" ? "alert" : "status"}
              className="rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-[13px] font-medium leading-snug text-ink"
            >
              {message}
            </p>
            <div className="flex justify-end gap-2">
              <RisoButton variant="ghost" size="sm" onClick={close}>
                Fermer
              </RisoButton>
              <RisoButton
                size="sm"
                onClick={() => {
                  setMessage("")
                  setStep("dictate")
                }}
              >
                Reformuler
              </RisoButton>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Résume une action pour le récap multi-intentions (§6, lisible sans jargon). */
function decrireAction(a: BrainAction): string {
  switch (a.intent) {
    case "courses.ajouter_article":
      return `Ajouter aux courses : ${a.articles.map((x) => x.nom).join(", ")}`
    case "courses.cocher_article":
      return `Cocher : ${a.article.nom}`
    case "courses.decocher_article":
      return `Décocher : ${a.article.nom}`
    case "bibliotheque.ajouter_article":
      return `Bibliothèque : ${a.articles.map((x) => x.nom).join(", ")}`
    case "taches.cocher":
      return `Cocher la tâche : ${a.titre}`
    case "taches.ajouter":
      return `Nouvelle tâche : ${a.titre}`
    case "planning.placer_repas":
      return `Planning : ${
        a.repas.kind === "recette" ? a.repas.titre : a.repas.texte
      }`
    case "planning.generer_liste":
      return "Générer la liste de la semaine"
    case "consultation.lire":
      return a.cible.type === "liste_courses"
        ? `Voir ce qu'il reste dans « ${a.cible.nom} »`
        : a.cible.type === "repas_jour"
          ? "Voir le menu du jour"
          : "Voir les tâches du jour"
    case "recettes.proposer":
      return `Proposer une recette${a.contraintes ? ` : ${a.contraintes}` : ""}`
    case "recettes.ajouter_ingredients":
      return `Ingrédients de « ${a.titre} » → liste`
    case "planning.proposer_semaine":
      return `Proposer une semaine${a.contraintes ? ` : ${a.contraintes}` : ""}`
    case "navigation.ouvrir":
      return "Ouvrir un écran"
    default:
      return "Action"
  }
}

/** Petit panneau message autonome (cas sans to-do list pour une tâche). */
function renderMessagePanel(titre: string, message: string, onClose: () => void) {
  if (typeof document === "undefined") return null
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Commande vocale"
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
    >
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative w-full max-w-sm rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-base uppercase leading-none text-ink">
            {titre}
          </h2>
          <p
            role="alert"
            className="rounded-[8px] border-2 border-ink bg-paper px-3 py-2 text-[13px] font-medium leading-snug text-ink"
          >
            {message}
          </p>
          <div className="flex justify-end">
            <RisoButton variant="ghost" size="sm" onClick={onClose}>
              Fermer
            </RisoButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
