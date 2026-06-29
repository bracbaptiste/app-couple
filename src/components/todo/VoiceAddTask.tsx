"use client"

import { Loader2, Mic, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoDatePicker } from "@/components/ui/riso-date-picker"
import { cn } from "@/lib/utils"
import { getDueLabel } from "@/lib/hooks/useTaskState"
import {
  type Recurrence,
  NO_RECURRENCE,
  normalizeRecurrence,
} from "@/lib/tasks/recurrence"
import { type ParsedTask } from "@/lib/tasks/voice-parsing"

import { type AddTaskOptions } from "./AddTaskBar"
import { TaskOptionsFields } from "./TaskOptionsFields"

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
 *   - `parsing` : appel /api/parse-task en cours ;
 *   - `error`   : échec du parsing → réessayer / saisie manuelle ;
 *   - `review`  : écran de validation pré-rempli, tout corrigeable avant l'ajout.
 */
type Step = "dictate" | "parsing" | "error" | "review"

const TITLE_MAX = 120
const TEXT_MAX = 1000

/** Convertit la récurrence renvoyée par l'IA (snake_case) en {@link Recurrence}. */
function recurrenceFromParsed(p: ParsedTask["recurrence"]): Recurrence {
  if (!p) return { ...NO_RECURRENCE }
  // `normalizeRecurrence` borne les valeurs et neutralise les champs hors type.
  return normalizeRecurrence({
    type: p.type,
    interval: p.interval,
    weekday: p.weekday,
    dayOfMonth: p.day_of_month,
  })
}

/**
 * VoiceAddTask — ajout d'une tâche par la voix (PRD-taches-v2.1 §3.2).
 *
 * Stratégie voix (NON NÉGOCIABLE) : on n'utilise PAS l'API Web Speech
 * (`webkitSpeechRecognition`), inopérante dans une PWA installée sur iPhone. On
 * s'appuie sur la DICTÉE NATIVE du clavier : un tap sur le micro ouvre un champ
 * texte focalisé ; l'utilisateur dicte via le micro de son clavier (ou tape). La
 * phrase part vers `/api/parse-task` (clé serveur, Haiku), qui renvoie une tâche
 * structurée. On affiche alors un ÉCRAN DE VALIDATION pré-rempli — titre,
 * échéance, récurrence, assigné, liste cible — entièrement corrigeable. Rien
 * n'est écrit avant que l'utilisateur ne confirme (garde-fou §3.2).
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

  // Champs de l'écran de validation (corrigeables).
  const [title, setTitle] = useState("")
  const [due, setDue] = useState("") // « yyyy-mm-dd » | ""
  const [recurrence, setRecurrence] = useState<Recurrence>(NO_RECURRENCE)
  const [assignedTo, setAssignedTo] = useState<string | null>(defaultAssignee)
  const [listId, setListId] = useState<string>(currentListId)

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

  /** Pré-remplit l'écran de validation à partir de la tâche structurée par l'IA. */
  function applyParsed(task: ParsedTask) {
    setTitle(task.title.slice(0, TITLE_MAX))
    setDue(task.due_date ?? "")
    setRecurrence(recurrenceFromParsed(task.recurrence))
    // L'id est déjà validé côté serveur, mais on ne garde que ce qui existe
    // vraiment dans le contexte du client (défense en profondeur).
    const assignee =
      task.assigned_to && members.some((m) => m.id === task.assigned_to)
        ? task.assigned_to
        : defaultAssignee
    setAssignedTo(assignee)
    const target =
      task.list_id && lists.some((l) => l.id === task.list_id)
        ? task.list_id
        : currentListId
    setListId(target)
  }

  /** Envoie la phrase dictée au parsing serveur, puis bascule sur la validation. */
  async function parse() {
    const phrase = text.trim().slice(0, TEXT_MAX)
    if (!phrase) return
    setErrorMsg("")
    setStep("parsing")
    try {
      const res = await fetch("/api/parse-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        setErrorMsg(data?.error ?? "Le traitement a échoué. Réessaie.")
        setStep("error")
        return
      }
      const task = (await res.json()) as ParsedTask
      applyParsed(task)
      setStep("review")
    } catch {
      setErrorMsg("Connexion impossible. Vérifie ta connexion et réessaie.")
      setStep("error")
    }
  }

  /** Repli « saisie manuelle » : la phrase dictée devient le titre, sans IA. */
  function manualEntry() {
    setTitle(text.trim().slice(0, TITLE_MAX))
    setDue("")
    setRecurrence({ ...NO_RECURRENCE })
    setAssignedTo(defaultAssignee)
    setListId(currentListId)
    setStep("review")
  }

  function confirm() {
    const name = title.trim()
    if (!name || !listId) return
    onConfirm(listId, name, {
      // Comme AddTaskBar : « yyyy-mm-dd » → Date (minuit UTC, stable au format ISO).
      dueDate: due ? new Date(due) : undefined,
      assignedTo,
      recurrence,
    })
    close()
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

      {open &&
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
                  {step === "review" ? "Vérifie la tâche" : "Dicter une tâche"}
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
                    className="w-full resize-none rounded-[8px] border-2 border-ink bg-paper-light px-3 py-2 text-base text-ink outline-none placeholder:text-ink-soft/60 focus-visible:shadow-riso-sauge"
                  />
                  <div className="flex justify-end gap-2">
                    <RisoButton variant="ghost" size="sm" onClick={close}>
                      Annuler
                    </RisoButton>
                    <RisoButton
                      type="submit"
                      size="sm"
                      disabled={!text.trim()}
                    >
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
                      onClick={manualEntry}
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

              {/* ----- Étape : validation ----- */}
              {step === "review" && (
                <div className="flex flex-col gap-4">
                  {/* Titre */}
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="voice-task-title"
                      className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft"
                    >
                      Tâche
                    </label>
                    <input
                      id="voice-task-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={TITLE_MAX}
                      placeholder="Intitulé de la tâche"
                      className="h-12 w-full rounded-[8px] border-2 border-ink bg-paper-light px-3 text-base font-medium text-ink outline-none placeholder:text-ink-soft/60 focus-visible:shadow-riso-sauge"
                    />
                  </div>

                  {/* Échéance */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                      Échéance
                    </span>
                    <div className="flex items-center gap-2">
                      {due ? (
                        <span className="inline-flex items-center gap-1 rounded-[4px] border-[1.5px] border-ink bg-paper px-1.5 py-[3px] font-display text-[10px] uppercase leading-none text-ink-soft">
                          {getDueLabel(due)}
                          <button
                            type="button"
                            onClick={() => setDue("")}
                            aria-label="Retirer l’échéance"
                            className="relative -mr-0.5 inline-flex items-center justify-center rounded-[3px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
                          >
                            <X className="size-3" strokeWidth={3} aria-hidden />
                          </button>
                        </span>
                      ) : (
                        <span className="font-body text-[13px] text-ink-soft">
                          Aucune
                        </span>
                      )}
                      <RisoDatePicker
                        value={due}
                        onChange={setDue}
                        size="sm"
                        triggerLabel="Choisir une échéance"
                      />
                    </div>
                  </div>

                  {/* Assigné + récurrence : sélecteurs partagés (étape 5). */}
                  <TaskOptionsFields
                    members={members}
                    assignedTo={assignedTo}
                    onAssignedToChange={setAssignedTo}
                    recurrence={recurrence}
                    onRecurrenceChange={setRecurrence}
                    dueDate={due || null}
                  />

                  {/* Liste cible */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                      Liste
                    </span>
                    {lists.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {lists.map((l) => {
                          const selected = listId === l.id
                          return (
                            <button
                              key={l.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setListId(l.id)}
                              className={cn(
                                "inline-flex min-h-9 items-center rounded-[6px] border-2 border-ink px-2.5 py-1 font-mono text-[11px] font-bold uppercase leading-none tracking-wide outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ink active:translate-x-px active:translate-y-px",
                                selected
                                  ? "bg-ink text-paper"
                                  : "bg-paper-light text-ink-soft",
                              )}
                            >
                              {l.name}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="font-body text-[13px] text-ink-soft">
                        Aucune to-do list disponible.
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-1">
                    <RisoButton variant="ghost" size="sm" onClick={close}>
                      Annuler
                    </RisoButton>
                    <RisoButton
                      size="sm"
                      onClick={confirm}
                      disabled={!title.trim() || !listId}
                    >
                      Ajouter
                    </RisoButton>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
