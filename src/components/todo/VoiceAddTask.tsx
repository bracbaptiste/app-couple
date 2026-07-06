"use client"

import { Loader2, Mic, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { NO_RECURRENCE } from "@/lib/tasks/recurrence"
import { type BrainAction } from "@/lib/brain/command-parsing"

import { type AddTaskOptions } from "./AddTaskBar"
import {
  TaskReviewSheet,
  taskActionToInitial,
  type TaskReviewInitial,
} from "./TaskReviewSheet"

/** Membre du couple proposé comme assigné. */
type VoiceMember = { id: string; name: string; color: "sauge" | "brique" }

/** Une to-do list cible (pour le sélecteur « liste »). */
type TodoListOption = { id: string; name: string }

type VoiceAddTaskProps = {
  /** Toutes les to-do lists du couple (sélecteur de liste cible). */
  lists: TodoListOption[]
  /** Liste affichée — liste cible par défaut quand l'IA n'en désigne aucune. */
  currentListId: string
  /** Membres du couple (sélecteur d'assigné). */
  members: VoiceMember[]
  /** Assigné par défaut (null = non assigné), repli si l'IA n'assigne personne. */
  defaultAssignee: string | null
  /** Désactive le déclencheur pendant une mutation en cours. */
  disabled?: boolean
  /** Crée la tâche via le chemin d'insertion normal (RLS) sur la liste choisie. */
  onConfirm: (listId: string, title: string, opts: AddTaskOptions) => void
}

/**
 * Étapes du flux vocal :
 *   - `dictate` : champ texte focalisé (clavier ouvert → micro natif OU frappe) ;
 *   - `parsing` : appel /api/brain-command en cours ;
 *   - `error`   : échec du parsing → réessayer / saisie manuelle ;
 *   - `review`  : écran de validation V2.1 pré-rempli ({@link TaskReviewSheet}).
 */
type Step = "dictate" | "parsing" | "error" | "review"

const TITLE_MAX = 120
const TEXT_MAX = 1000

/** Forme (partielle) de la réponse du routeur utile ici (§5.3 + taskContext). */
type BrainResponse = { actions?: BrainAction[] }

/**
 * VoiceAddTask — ajout d'une tâche par la voix (PRD-taches-v2.1 §3.2).
 *
 * Stratégie voix (NON NÉGOCIABLE) : on n'utilise PAS l'API Web Speech
 * (`webkitSpeechRecognition`), inopérante dans une PWA installée sur iPhone. On
 * s'appuie sur la DICTÉE NATIVE du clavier : un tap sur le micro ouvre un champ
 * texte focalisé ; l'utilisateur dicte via le micro de son clavier (ou tape).
 *
 * Migration V4 (§0.5) : la phrase part désormais vers `/api/brain-command` (le
 * routeur d'intentions), avec `mode: "task"` pour ancrer l'interprétation sur les
 * tâches — le comportement historique (dictée → tâche à valider) est préservé. On
 * réutilise l'ÉCRAN DE VALIDATION V2.1 tel quel ({@link TaskReviewSheet}) : rien
 * n'est écrit avant confirmation (garde-fou §3.2). En repli (le routeur n'a pas
 * produit de tâche), la phrase brute devient l'intitulé à valider.
 */
export function VoiceAddTask({
  lists,
  currentListId,
  members,
  defaultAssignee,
  disabled = false,
  onConfirm,
}: VoiceAddTaskProps) {
  const [step, setStep] = useState<Step | null>(null)
  const [text, setText] = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [prefill, setPrefill] = useState<TaskReviewInitial | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const open = step !== null

  // À l'étape « dictée » : on focalise le champ pour faire apparaître le clavier
  // (et donc le micro natif). Fait dans la foulée du tap (geste utilisateur).
  useEffect(() => {
    if (step === "dictate") textareaRef.current?.focus()
  }, [step])

  // Échap ferme le flux (cohérent avec le RisoDatePicker).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  function start() {
    setText("")
    setErrorMsg("")
    setStep("dictate")
  }

  function close() {
    setStep(null)
  }

  /** Repli « saisie manuelle » : la phrase dictée devient le titre, sans structure. */
  function fallbackToManual(phrase: string) {
    setPrefill({
      title: phrase.slice(0, TITLE_MAX),
      due: "",
      recurrence: { ...NO_RECURRENCE },
      assignedTo: defaultAssignee,
      listId: currentListId,
    })
    setStep("review")
  }

  /** Envoie la phrase dictée au routeur (mode tâche), puis ouvre la validation. */
  async function parse() {
    const phrase = text.trim().slice(0, TEXT_MAX)
    if (!phrase) return
    setErrorMsg("")
    setStep("parsing")
    try {
      const res = await fetch("/api/brain-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: phrase,
          mode: "task",
          contexte_ecran: { route: `/lists/${currentListId}`, liste_id: currentListId },
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setErrorMsg(data?.error ?? "Le traitement a échoué. Réessaie.")
        setStep("error")
        return
      }
      const result = (await res.json()) as BrainResponse
      const task = (result.actions ?? []).find(
        (a): a is Extract<BrainAction, { intent: "taches.ajouter" }> =>
          a.intent === "taches.ajouter",
      )
      if (task) {
        setPrefill(
          taskActionToInitial(task, {
            lists,
            members,
            defaultListId: currentListId,
            defaultAssignee,
          }),
        )
        setStep("review")
      } else {
        // Le routeur n'a pas structuré de tâche : on garde la phrase comme titre.
        fallbackToManual(phrase)
      }
    } catch {
      setErrorMsg("Connexion impossible. Vérifie ta connexion et réessaie.")
      setStep("error")
    }
  }

  return (
    <>
      {/* Déclencheur micro, dans la zone d'ajout (même gabarit que le calendrier). */}
      <button
        type="button"
        onClick={start}
        disabled={disabled}
        aria-label="Dicter une tâche"
        aria-haspopup="dialog"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-[8px] text-ink outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px disabled:opacity-50"
      >
        <Mic className="size-5" strokeWidth={2.5} aria-hidden />
      </button>

      {/* Étapes dictée / parsing / erreur : modale propre à ce flux. */}
      {open &&
        step !== "review" &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ajouter une tâche par la voix"
            className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
          >
            {/* Voile encre */}
            <button
              type="button"
              aria-label="Fermer"
              tabIndex={-1}
              onClick={close}
              className="absolute inset-0 bg-ink/40"
            />

            <div className="relative max-h-[88vh] w-full max-w-sm overflow-y-auto rounded-[12px] border-2 border-ink bg-paper-light p-4 shadow-riso-ink-lg">
              {/* En-tête commun */}
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-display text-base uppercase leading-none text-ink">
                  Dicter une tâche
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

              {/* ----- Étape : dictée ----- */}
              {step === "dictate" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    parse()
                  }}
                  className="flex flex-col gap-3"
                >
                  <p className="font-body text-[13px] leading-snug text-ink-soft">
                    Tape sur le micro de ton clavier pour dicter, ou écris ta
                    phrase. Ex : « acheter du pain demain pour Soso ».
                  </p>
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      // Entrée (sans Maj) valide la phrase ; Maj+Entrée = saut de ligne.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        parse()
                      }
                    }}
                    rows={3}
                    maxLength={TEXT_MAX}
                    placeholder="Dicte ou écris ta tâche…"
                    aria-label="Phrase à transformer en tâche"
                    className="w-full resize-none rounded-[8px] border-2 border-ink bg-paper-light px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft focus-visible:shadow-riso-sauge"
                  />
                  <div className="flex justify-end gap-2">
                    <RisoButton variant="ghost" size="sm" onClick={close}>
                      Annuler
                    </RisoButton>
                    <RisoButton type="submit" size="sm" disabled={!text.trim()}>
                      Continuer
                    </RisoButton>
                  </div>
                </form>
              )}

              {/* ----- Étape : parsing ----- */}
              {step === "parsing" && (
                <div
                  className="flex flex-col items-center gap-3 py-8 text-ink-soft"
                  aria-live="polite"
                >
                  <Loader2
                    className="size-7 animate-spin motion-reduce:animate-none"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <p className="font-mono text-[12px] uppercase tracking-wide">
                    Analyse de ta phrase…
                  </p>
                </div>
              )}

              {/* ----- Étape : erreur ----- */}
              {step === "error" && (
                <div className="flex flex-col gap-3">
                  <p
                    role="alert"
                    className="rounded-[8px] border-2 border-brique bg-brique/10 px-3 py-2 text-[13px] font-medium leading-snug text-ink"
                  >
                    {errorMsg}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    <RisoButton
                      variant="ghost"
                      size="sm"
                      onClick={() => fallbackToManual(text.trim())}
                    >
                      Saisie manuelle
                    </RisoButton>
                    <RisoButton
                      size="sm"
                      onClick={() => {
                        setErrorMsg("")
                        setStep("dictate")
                      }}
                    >
                      Réessayer
                    </RisoButton>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* ----- Étape : validation V2.1 (écran réutilisé) ----- */}
      {step === "review" && prefill && (
        <TaskReviewSheet
          open
          initial={prefill}
          lists={lists}
          members={members}
          onClose={close}
          onConfirm={(listId, title, opts) => {
            onConfirm(listId, title, opts)
            close()
          }}
        />
      )}
    </>
  )
}
