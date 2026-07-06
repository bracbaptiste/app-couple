"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

/**
 * Synchronisation temps réel Supabase — App Couple.
 *
 * STRATÉGIE : « écouter puis rafraîchir le serveur », PAS de cache client à
 * maintenir. À chaque event postgres_changes pertinent, on appelle
 * `router.refresh()`, qui re-exécute le Server Component de la page et renvoie
 * de nouvelles props. On réutilise donc la couche de lecture serveur existante
 * (mêmes requêtes, même agrégation, MÊME RLS). Conséquences :
 *   - aucune duplication de logique de fetch côté client ;
 *   - aucun risque de fuite inter-couple : la barrière reste la RLS serveur ;
 *   - aucun problème de doublon : le serveur est la source de vérité (on ne
 *     fusionne pas d'événements à la main) ;
 *   - cohabite avec `useOptimistic` : `refresh()` ne remplace que la donnée
 *     serveur de base, sans toucher l'état React local (cf. doc useRouter).
 *
 * Le `refresh()` est DÉBOUNCÉ : une rafale d'events (ex. ajout en série par le
 * partenaire) ne déclenche qu'un seul re-fetch.
 *
 * SÉCURITÉ : postgres_changes respecte la RLS — un client ne reçoit que les
 * events des lignes qu'il pourrait lire. Les filtres `couple_id`/`list_id`
 * ci-dessous réduisent le trafic ; ils ne sont pas la barrière de sécurité.
 */

/** Délai de coalescence des rafraîchissements (ms). */
const REFRESH_DEBOUNCE_MS = 250

/** Une table à écouter, avec un filtre optionnel `colonne=eq.valeur`. */
type Subscription = {
  table:
    | "lists"
    | "list_items"
    | "library_items"
    | "categories"
    | "tasks"
    | "brain_commands"
    | "meal_slots"
    | "recipes"
  /** Ex. `couple_id=eq.<uuid>` ou `list_id=eq.<uuid>`. Omis = toute la table (sous RLS). */
  filter?: string
}

/**
 * Primitive partagée : ouvre UN canal pour `channelName`, s'abonne à chaque
 * `subscriptions`, et déclenche un `router.refresh()` débouncé sur tout event.
 *
 * `channelName` doit être unique et stable par écran (sert d'identité au canal
 * realtime). Les abonnements sont relus à chaque changement de leur contenu :
 * on passe donc une dépendance sérialisée pour éviter de rouvrir le canal à
 * chaque rendu.
 */
function useRealtimeRefresh(channelName: string, subscriptions: Subscription[]) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clé stable des abonnements : un canal n'est recréé que si table/filtre changent.
  const subsKey = subscriptions
    .map((s) => `${s.table}:${s.filter ?? "*"}`)
    .join("|")

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(channelName)

    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        router.refresh()
      }, REFRESH_DEBOUNCE_MS)
    }

    for (const sub of subscriptions) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: sub.table,
          ...(sub.filter ? { filter: sub.filter } : {}),
        },
        scheduleRefresh,
      )
    }

    channel.subscribe()

    return () => {
      if (timer.current) clearTimeout(timer.current)
      supabase.removeChannel(channel)
    }
    // `subsKey` capture table+filtre ; `channelName` et `router` sont stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, subsKey])
}

/**
 * Hub des listes (/lists). Écoute :
 *   - `lists` du couple (création / renommage / suppression / réordonnancement) ;
 *   - `list_items` (les décomptes coché/total et la « dernière activité »).
 *
 * `list_items` n'a PAS de colonne `couple_id` : un filtre couple est impossible
 * au niveau colonne, on s'appuie donc sur la RLS (le client ne reçoit que les
 * items de ses propres listes). C'est la seule écoute non filtrée, et elle
 * reste bornée par la RLS.
 */
export function useRealtimeLists(coupleId: string) {
  useRealtimeRefresh(`lists-hub:${coupleId}`, [
    { table: "lists", filter: `couple_id=eq.${coupleId}` },
    { table: "list_items" },
  ])
}

/**
 * Détail d'une liste (/lists/[listId]). Écoute :
 *   - `list_items` de CETTE liste (ajout / cochage / quantité-note / suppression) ;
 *   - `library_items` du couple (le nom et le rayon affichés viennent du produit
 *     lié ; la recatégorisation modifie `library_items.category_id`) ;
 *   - `categories` du couple (noms et ordre des sections).
 */
export function useRealtimeListItems(listId: string, coupleId: string) {
  useRealtimeRefresh(`list-detail:${listId}`, [
    { table: "list_items", filter: `list_id=eq.${listId}` },
    { table: "library_items", filter: `couple_id=eq.${coupleId}` },
    { table: "categories", filter: `couple_id=eq.${coupleId}` },
  ])
}

/**
 * Détail d'une to-do list (/lists/[listId], kind = 'todo'). Écoute :
 *   - `tasks` de CETTE liste (ajout / cochage / renommage / échéance / suppression).
 *
 * Le partenaire ajoute une tâche ou en coche une → l'écran se rafraîchit sans
 * refresh manuel (cf. ARCHITECTURE_V2). On filtre par `list_id` pour ne traiter
 * que les events de la liste ouverte ; la RLS de `tasks` reste la barrière de
 * sécurité (un autre couple ne reçoit jamais d'event).
 */
export function useRealtimeTasks(listId: string) {
  useRealtimeRefresh(`todo-detail:${listId}`, [
    { table: "tasks", filter: `list_id=eq.${listId}` },
  ])
}

/**
 * Bibliothèque (/library). Écoute :
 *   - `library_items` du couple (ajout d'un produit, fréquence, rayon, suppression) ;
 *   - `categories` du couple (groupes) ;
 *   - `lists` du couple (cibles de l'action « Envoyer vers… »).
 */
export function useRealtimeLibrary(coupleId: string) {
  useRealtimeRefresh(`library:${coupleId}`, [
    { table: "library_items", filter: `couple_id=eq.${coupleId}` },
    { table: "categories", filter: `couple_id=eq.${coupleId}` },
    { table: "lists", filter: `couple_id=eq.${coupleId}` },
  ])
}

/**
 * Carnet de recettes (/recipes). Écoute `recipes` du couple (ajout, édition,
 * suppression/restauration) — la table a rejoint la publication Realtime en
 * V4.1 (§10), au même titre que les 4 autres entités du soft-delete.
 */
export function useRealtimeRecipes(coupleId: string) {
  useRealtimeRefresh(`recipes:${coupleId}`, [
    { table: "recipes", filter: `couple_id=eq.${coupleId}` },
  ])
}

/**
 * Journal du Cerveau (/profile/journal). Écoute `brain_commands` du couple :
 *   - une nouvelle commande vocale de l'un « s'imprime » chez l'autre ;
 *   - une annulation (statut `fait` → `annule`) raye la ligne chez l'autre.
 *
 * Filtré par `couple_id` (colonne ≠ PK → la table est en REPLICA IDENTITY FULL,
 * cf. migration V4, pour que les UPDATE d'annulation portent bien la ligne). La
 * RLS reste la barrière : un autre couple ne reçoit jamais d'event.
 */
export function useRealtimeBrainJournal(coupleId: string) {
  useRealtimeRefresh(`brain-journal:${coupleId}`, [
    { table: "brain_commands", filter: `couple_id=eq.${coupleId}` },
  ])
}

/**
 * Planning (/planning). Écoute :
 *   - `meal_slots` du couple : un repas placé, déplacé ou retiré par l'un
 *     apparaît instantanément chez l'autre (§8.1) ;
 *   - `tasks` : une tâche à échéance cochée / décochée (ou l'occurrence suivante
 *     d'une récurrente, engendrée au cochage) se reflète dans la grille (§8.3).
 *
 * Le `router.refresh()` re-rend le Server Component pour l'URL COURANTE (le
 * `?debut` de la semaine affichée est donc préservé, on ne saute pas de semaine).
 *
 * `meal_slots` est filtré par `couple_id` (colonne ≠ PK → REPLICA IDENTITY FULL,
 * cf. migration V4, pour que les UPDATE/DELETE portent bien la ligne). `tasks`
 * n'a pas de `couple_id` (rattachement via la liste parente) : on écoute sans
 * filtre colonne, borné par la RLS — exactement comme `list_items` dans le hub.
 * La RLS reste la barrière : un autre couple ne reçoit jamais d'event.
 */
export function useRealtimePlanning(coupleId: string) {
  useRealtimeRefresh(`planning:${coupleId}`, [
    { table: "meal_slots", filter: `couple_id=eq.${coupleId}` },
    { table: "tasks" },
  ])
}
