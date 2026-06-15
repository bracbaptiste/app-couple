/**
 * Couche IndexedDB — App Couple, mode hors ligne V1.
 *
 * Petit wrapper « maison » (aucune dépendance type `idb`) autour d'IndexedDB,
 * volontairement minimal. Deux usages, deux object stores :
 *
 *   1. `cache`     — cache de LECTURE : la dernière copie connue des données
 *                    affichables (listes, articles, rayons, bibliothèque), pour
 *                    consulter l'app sans réseau. Clé = un identifiant logique
 *                    (`CacheKey`), valeur = `{ data, cachedAt }`.
 *
 *   2. `mutations` — FILE D'ATTENTE des mutations faites hors ligne, rejouées à
 *                    la reconnexion. Une ligne par mutation (clé = son `id`).
 *
 * SÉCURITÉ / VIE PRIVÉE : ce cache vit en clair dans le navigateur. On n'y range
 * QUE des données déjà visibles par l'utilisateur (sous RLS au moment du fetch).
 * Ce n'est pas une barrière d'autorisation — c'est une copie locale jetable.
 *
 * LIMITES (V1, assumées) :
 *   - pas de chiffrement ni de purge multi-comptes : sur un appareil partagé, le
 *     cache du dernier compte reste lisible jusqu'à `clearOfflineData()` ;
 *   - pas de versionnage de schéma au-delà de `DB_VERSION` (on jette et recrée).
 */

const DB_NAME = "appcouple-offline"
const DB_VERSION = 1

/** Store clé→valeur du cache de lecture. */
const CACHE_STORE = "cache"
/** Store des mutations en attente de rejeu. */
const QUEUE_STORE = "mutations"

/**
 * Clés logiques du cache de lecture. On garde une clé par « écran » plutôt
 * qu'une ligne par entité : la lecture serveur agrège déjà tout (cf. les
 * `page.tsx`), on stocke donc le bloc tel qu'affiché. Les listes par id sont
 * suffixées (`list-items:<listId>`).
 */
export type CacheKey =
  | "lists"
  | "library"
  | `list-items:${string}`
  | `tasks:${string}`

/** Une entrée de cache horodatée (pour afficher « vu il y a… » plus tard). */
export type CacheEntry<T = unknown> = {
  key: string
  data: T
  cachedAt: number
}

/** Indique si IndexedDB est disponible (faux en SSR ou navigateur ancien). */
function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined"
}

/** Connexion ouverte, mémoïsée pour ne pas rouvrir la base à chaque appel. */
let dbPromise: Promise<IDBDatabase> | null = null

/** Ouvre (ou crée) la base et ses object stores. */
function openDb(): Promise<IDBDatabase> {
  if (!hasIndexedDb()) {
    return Promise.reject(new Error("IndexedDB indisponible"))
  }
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        // Clé = `id` de la mutation ; un index sur `createdAt` garantit un
        // rejeu dans l'ordre chronologique (déterminant pour le last-write-wins).
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: "id" })
        store.createIndex("createdAt", "createdAt", { unique: false })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("Ouverture IndexedDB échouée"))
  })

  return dbPromise
}

/** Promisifie une `IDBRequest`. */
function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/* -------------------------------------------------------------------------- */
/*  Cache de lecture                                                           */
/* -------------------------------------------------------------------------- */

/** Écrit (ou remplace) une entrée de cache. No-op si IndexedDB indisponible. */
export async function cachePut<T>(key: CacheKey, data: T): Promise<void> {
  if (!hasIndexedDb()) return
  try {
    const db = await openDb()
    const tx = db.transaction(CACHE_STORE, "readwrite")
    const entry: CacheEntry<T> = { key, data, cachedAt: Date.now() }
    tx.objectStore(CACHE_STORE).put(entry)
    await txDone(tx)
  } catch {
    // Le cache est best-effort : un échec ne doit jamais casser l'UI.
  }
}

/** Lit une entrée de cache, ou `null` si absente / indisponible. */
export async function cacheGet<T>(key: CacheKey): Promise<CacheEntry<T> | null> {
  if (!hasIndexedDb()) return null
  try {
    const db = await openDb()
    const tx = db.transaction(CACHE_STORE, "readonly")
    const result = await promisifyRequest<CacheEntry<T> | undefined>(
      tx.objectStore(CACHE_STORE).get(key),
    )
    return result ?? null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/*  File d'attente des mutations                                               */
/* -------------------------------------------------------------------------- */

/** Une mutation sérialisée en attente de rejeu (forme générique côté DB). */
export type StoredMutation = {
  id: string
  type: string
  payload: unknown
  createdAt: number
}

/** Ajoute une mutation à la file. */
export async function queueAdd(mutation: StoredMutation): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, "readwrite")
  tx.objectStore(QUEUE_STORE).put(mutation)
  await txDone(tx)
}

/** Renvoie toutes les mutations en attente, triées par date de création. */
export async function queueAll(): Promise<StoredMutation[]> {
  if (!hasIndexedDb()) return []
  try {
    const db = await openDb()
    const tx = db.transaction(QUEUE_STORE, "readonly")
    const all = await promisifyRequest<StoredMutation[]>(
      tx.objectStore(QUEUE_STORE).getAll(),
    )
    return all.sort((a, b) => a.createdAt - b.createdAt)
  } catch {
    return []
  }
}

/** Retire une mutation de la file (après rejeu réussi). */
export async function queueRemove(id: string): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, "readwrite")
  tx.objectStore(QUEUE_STORE).delete(id)
  await txDone(tx)
}

/** Vide entièrement la file (utilitaire de debug / reset). */
export async function queueClear(): Promise<void> {
  if (!hasIndexedDb()) return
  const db = await openDb()
  const tx = db.transaction(QUEUE_STORE, "readwrite")
  tx.objectStore(QUEUE_STORE).clear()
  await txDone(tx)
}

/* -------------------------------------------------------------------------- */
/*  Outils                                                                     */
/* -------------------------------------------------------------------------- */

/** Attend la fin (commit) d'une transaction en écriture. */
function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
