"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Check, ListChecks, ShoppingCart } from "lucide-react"
import { useEffect, useState, useActionState } from "react"
import { useFormStatus } from "react-dom"

import { RisoButton } from "@/components/ui/riso-button"
import { RisoInput } from "@/components/ui/riso-input"
import { FormFeedback } from "@/app/(auth)/form-ui"
import { cn } from "@/lib/utils"

import { createList, type ActionResult } from "@/app/(app)/lists/actions"

type ListKind = "courses" | "todo"

/**
 * Sheet « Nouvelle liste » (PRD_V2 §2.3 / DESIGN_SYSTEM_V2 §2.2).
 *
 * Monte du bas de l'écran. Laisse choisir le type (courses/to-do), le nom et le
 * partage avec la conjointe, puis crée la liste via la Server Action `createList`
 * (qui pose kind/is_shared/owner_id sous RLS). Composant contrôlé : l'ouverture
 * est pilotée par le hub (le bouton `+` du header).
 *
 * @param partnerName Prénom de la conjointe (libellé de la case « Partager »).
 *   `null` si le couple n'a pas encore de second membre.
 */
export function NewListSheet({
  open,
  onOpenChange,
  partnerName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  partnerName: string | null
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-ink/55 transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-sm",
            "rounded-t-[22px] border-t-[2.5px] border-ink bg-paper px-[22px] pb-7 pt-[22px]",
            "transition-transform data-[ending-style]:translate-y-full data-[starting-style]:translate-y-full motion-reduce:transition-none",
          )}
          initialFocus={false}
        >
          {/* Poignée décorative du sheet */}
          <div className="mx-auto mb-[18px] h-[5px] w-12 rounded-full bg-ink" />

          <Dialog.Title className="mb-[18px] text-center font-display text-[22px] uppercase leading-none tracking-tight text-ink">
            Nouvelle liste
          </Dialog.Title>

          {/* `key={open}` : le formulaire se remonte à chaque ouverture, ce qui
              le réinitialise (défauts PRD : courses + partagé) sans effet. */}
          <NewListForm
            key={String(open)}
            partnerName={partnerName}
            onCreated={() => onOpenChange(false)}
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Corps du sheet : champs contrôlés + soumission via la Server Action. */
function NewListForm({
  partnerName,
  onCreated,
}: {
  partnerName: string | null
  onCreated: () => void
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    createList,
    null,
  )

  const [kind, setKind] = useState<ListKind>("courses")
  const [name, setName] = useState("")
  const [shared, setShared] = useState(true)

  // À la réussite, on referme le sheet (le hub se rafraîchit via revalidatePath
  // + le temps réel). Appel d'un callback (pas de setState local) → pas de
  // cascade de rendus.
  useEffect(() => {
    if (state?.ok) onCreated()
  }, [state, onCreated])

  const error = state && !state.ok ? state.error : undefined

  return (
    <form action={formAction} className="flex flex-col">
      {/* Le type sélectionné part avec le formulaire (champ caché). */}
      <input type="hidden" name="kind" value={kind} />

      {/* Choix du type : deux gros boutons côte à côte */}
      <div className="mb-5 flex gap-3">
        <TypeButton
          label="Courses"
          icon={ShoppingCart}
          active={kind === "courses"}
          onClick={() => setKind("courses")}
        />
        <TypeButton
          label="To-do"
          icon={ListChecks}
          active={kind === "todo"}
          onClick={() => setKind("todo")}
        />
      </div>

      <label
        htmlFor="new_list_name"
        className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft"
      >
        Nom de la liste
      </label>
      <RisoInput
        id="new_list_name"
        name="name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex : Démarches admin"
        maxLength={50}
        autoComplete="off"
        autoFocus
        className="mb-[18px]"
      />

      {/* Partage : checkbox 26px + libellé (cochée par défaut). */}
      <label className="mb-[22px] flex cursor-pointer items-center gap-3 py-2.5">
        {/* Champ réel envoyé au serveur (share=on quand coché). */}
        <input
          type="checkbox"
          name="share"
          checked={shared}
          onChange={(e) => setShared(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "flex size-[26px] shrink-0 items-center justify-center rounded-[6px] border-[2.5px] border-ink transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-sauge peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-paper",
            shared ? "bg-brique" : "bg-paper",
          )}
        >
          {shared && (
            <Check className="size-[15px] text-paper-light" strokeWidth={3.5} />
          )}
        </span>
        <span className="font-body text-[14px] font-medium text-ink">
          {partnerName
            ? `Partager avec ${partnerName}`
            : "Partager avec ma conjointe"}
        </span>
      </label>

      <FormFeedback error={error} />

      <CreateSubmit disabled={name.trim().length === 0} />
    </form>
  )
}

/** Bouton de choix de type — style « tile select » (DESIGN_SYSTEM_V2 §2.2). */
function TypeButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: typeof ShoppingCart
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center gap-2 rounded-[12px] border-2 border-ink px-2.5 py-3.5 outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-sauge focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        active
          ? "bg-paper-light opacity-100 shadow-riso-brique"
          : "bg-paper opacity-60",
      )}
    >
      <Icon size={28} strokeWidth={2} className="text-ink" aria-hidden />
      <span className="font-display text-[13px] uppercase tracking-tight text-ink">
        {label}
      </span>
    </button>
  )
}

/** Bouton « Créer » primary pleine largeur, désactivé tant que le nom est vide. */
function CreateSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus()
  return (
    <RisoButton
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      // Désactivé tant que le nom est vide : on dit pourquoi au survol.
      title={disabled ? "Donne un nom à la liste" : undefined}
      className="h-[52px] w-full text-sm"
    >
      {pending ? "…" : "Créer"}
    </RisoButton>
  )
}
