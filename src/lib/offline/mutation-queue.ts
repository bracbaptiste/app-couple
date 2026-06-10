/**
 * File d'attente des mutations hors ligne — App Couple, V1.
 *
 * IDÉE CENTRALE : un SEUL registre (`HANDLERS`) sert à la fois à
 *   - exécuter une mutation EN LIGNE (appel direct de la Server Action), et
 *   - REJOUER une mutation mise en file pendant une coupure réseau.
 * Pas de duplication de logique : la même fonction est appelée dans les deux cas.
 *
 * FLUX :
 *   - L'UI appelle `runMutation(type, payload)` au lieu de la Server Action.
 *   - En ligne  → on exécute le handler tout de suite et on renvoie son résultat.
 *   - Hors ligne → on sérialise `{type, payload}` dans IndexedDB et on renvoie
 *     `{ ok: true }` (l'UI reste optimiste, cf. les écrans).
 *   - Au retour du réseau → `replayQueue()` rejoue les mutations dans l'ordre de
 *     création (chronologique), supprime celles qui réussissent, conserve celles
 *     qui échouent et remonte un résumé.
 *
 * CONFLITS — last-write-wins (simple, assumé) : on ne tente AUCUNE fusion. Les
 * mutations sont rejouées dans leur ordre local ; la dernière écriture (locale
 * ou partenaire) gagne au niveau de la ligne. Aucune détection de version :
 * deux modifications concurrentes du même champ ne sont pas réconciliées —
 * c'est volontaire pour la V1 (cf. limites en fin de PR).
 */

import {
  deleteItem,
  toggleItem,
  updateItemDetails,
  type ActionResult,
} from "@/app/(app)/lists/[listId]/actions"
import {
  queueAdd,
  queueAll,
  queueRemove,
  type StoredMutation,
} from "./db"

/* -------------------------------------------------------------------------- */
/*  Catalogue typé des mutations rejouables                                    */
/* -------------------------------------------------------------------------- */

/**
 * Charges utiles par type de mutation. Tout doit être SÉRIALISABLE (pas de
 * fonctions ni de FormData) pour survivre dans IndexedDB et au rejeu différé.
 *
 * V1 : seules les mutations de l'écran « détail de liste » sont couvertes — ce
 * sont celles du parcours hors ligne visé (cocher / décocher, éditer, supprimer
 * un article). Les actions sur les listes elles-mêmes (créer/renommer/supprimer
 * une liste) et la bibliothèque restent en ligne uniquement pour l'instant.
 */
export type MutationPayloads = {
  toggleItem: { listId: string; itemId: string; checked: boolean }
  updateItemDetails: {
    listId: string
    itemId: string
    quantity: string
    note: string
  }
  deleteItem: { listId: string; itemId: string }
}

export type MutationType = keyof MutationPayloads

/** Registre type → exécution réelle (Server Action). */
const HANDLERS: {
  [K in MutationType]: (payload: MutationPayloads[K]) => Promise<ActionResult>
} = {
  toggleItem: (p) => toggleItem(p.listId, p.itemId, p.checked),
  updateItemDetails: (p) =>
    updateItemDetails(p.listId, p.itemId, p.quantity, p.note),
  deleteItem: (p) => deleteItem(p.listId, p.itemId),
}

/* -------------------------------------------------------------------------- */
/*  Dispatch en ligne / mise en file hors ligne                               */
/* -------------------------------------------------------------------------- */

/** Vrai si le navigateur se déclare hors ligne (toujours en ligne en SSR). */
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

/** Identifiant de mutation (crypto.randomUUID dispo dans tous nos cibles). */
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/**
 * Point d'entrée unique des mutations « offline-aware ». À appeler depuis l'UI
 * à la place de la Server Action.
 *
 *   - EN LIGNE  → exécute et renvoie le vrai `ActionResult`.
 *   - HORS LIGNE → enfile la mutation et renvoie `{ ok: true }` (optimiste).
 *
 * L'appelant garde sa logique optimiste habituelle ; en cas d'échec RÉSEAU
 * pendant un appel qu'on croyait en ligne (ex. `navigator.onLine` ment),
 * l'exception est rattrapée et la mutation est enfilée en repli.
 */
export async function runMutation<K extends MutationType>(
  type: K,
  payload: MutationPayloads[K],
): Promise<ActionResult> {
  if (isOffline()) {
    await enqueue(type, payload)
    return { ok: true }
  }
  try {
    return await HANDLERS[type](payload)
  } catch {
    // Le réseau a lâché en plein appel : on bascule en file plutôt que de perdre
    // l'action. Le rejeu la rejouera à la reconnexion (last-write-wins).
    await enqueue(type, payload)
    return { ok: true }
  }
}

/** Sérialise et range une mutation dans IndexedDB. */
async function enqueue<K extends MutationType>(
  type: K,
  payload: MutationPayloads[K],
): Promise<void> {
  const mutation: StoredMutation = {
    id: newId(),
    type,
    payload,
    createdAt: Date.now(),
  }
  await queueAdd(mutation)
}

/* -------------------------------------------------------------------------- */
/*  Rejeu de la file                                                           */
/* -------------------------------------------------------------------------- */

/** Résumé d'un rejeu, pour piloter l'affichage de l'indicateur. */
export type ReplayResult = {
  /** Mutations rejouées avec succès et retirées de la file. */
  succeeded: number
  /** Mutations conservées car en échec (réseau ou serveur). */
  failed: number
}

/** Nombre de mutations actuellement en attente (pour le badge « N en attente »). */
export async function pendingCount(): Promise<number> {
  const all = await queueAll()
  return all.length
}

/**
 * Rejoue la file dans l'ordre chronologique. Chaque mutation réussie est
 * retirée ; une mutation en échec est CONSERVÉE (on la rejouera au prochain
 * passage en ligne). On ne s'arrête PAS à la première erreur : une mutation
 * cassée (ex. liste supprimée entre-temps) ne doit pas bloquer les suivantes.
 *
 * Garde-fou anti-concurrence : un seul rejeu à la fois (un `online` qui rebondit
 * ne lance pas deux rejeux en parallèle).
 */
let replaying = false

export async function replayQueue(): Promise<ReplayResult> {
  if (replaying) return { succeeded: 0, failed: 0 }
  replaying = true
  try {
    const queue = await queueAll()
    let succeeded = 0
    let failed = 0

    for (const m of queue) {
      const handler = HANDLERS[m.type as MutationType]
      // Type inconnu (schéma changé entre deux versions) : on jette pour ne pas
      // boucler indéfiniment sur une mutation qu'on ne sait plus exécuter.
      if (!handler) {
        await queueRemove(m.id)
        continue
      }
      try {
        const result = await handler(m.payload as never)
        if (result.ok) {
          await queueRemove(m.id)
          succeeded++
        } else {
          // Échec « métier » (ex. liste introuvable) : non rejouable utilement.
          // On retire pour ne pas rester bloqué, mais on le compte en échec.
          await queueRemove(m.id)
          failed++
        }
      } catch {
        // Échec réseau : on GARDE la mutation pour le prochain passage en ligne.
        failed++
      }
    }

    return { succeeded, failed }
  } finally {
    replaying = false
  }
}
