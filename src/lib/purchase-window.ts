/**
 * Fenêtre « Déjà pris » des courses.
 *
 * Un article coché (= acheté) reste visible sur la liste pendant 24h, puis
 * bascule dans l'historique des achats (/profile/purchases). Le seuil est
 * centralisé ici pour que TOUS les appelants partagent exactement la même
 * frontière :
 *   - le hub (`/lists`) exclut les articles archivés de ses compteurs ;
 *   - l'écran liste (`/lists/[id]`) ne charge que la liste vivante ;
 *   - l'historique affiche le reste.
 *
 * Les helpers prennent `now` en paramètre (défaut `Date.now()`). Cet emballage
 * n'est pas cosmétique : appeler `Date.now()` directement dans le rendu d'un
 * Server Component déclenche la règle `react-hooks/purity` (fonction impure
 * pendant le rendu). En l'isolant dans ce module hors-composant, le seuil reste
 * calculé à l'exécution sans enfreindre la règle.
 */

/** Durée de visibilité d'un article coché avant archivage (24h, en ms). */
export const PURCHASE_ARCHIVE_MS = 24 * 60 * 60 * 1000

/**
 * Horodatage (ms epoch) en deçà duquel un article coché est archivé : tout
 * `checked_at` antérieur a quitté la liste vivante pour l'historique.
 */
export function purchaseArchiveCutoffMs(now: number = Date.now()): number {
  return now - PURCHASE_ARCHIVE_MS
}

/** Même seuil au format ISO, pour les filtres Supabase `.gte(...)`. */
export function purchaseArchiveCutoffIso(now: number = Date.now()): string {
  return new Date(now - PURCHASE_ARCHIVE_MS).toISOString()
}
