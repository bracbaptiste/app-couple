/** Longueur maximale d'un nom d'article stocké. */
export const ITEM_NAME_MAX = 60

/**
 * Normalise le nom d'un article pour un stockage cohérent :
 *   - trim + espaces multiples réduits à un seul ;
 *   - longueur bornée à {@link ITEM_NAME_MAX} ;
 *   - casse cohérente (1re lettre majuscule, reste minuscule) → « LESSIVE » et
 *     « lessive » donnent le même libellé, ce qui fiabilise la déduplication.
 *
 * Renvoie une chaîne vide si l'entrée est vide / non significative.
 *
 * @example normalizeItemName("  LESSIVE ")        // "Lessive"
 * @example normalizeItemName("pain   de  mie")    // "Pain de mie"
 */
export function normalizeItemName(raw: unknown): string {
  const collapsed = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, ITEM_NAME_MAX)
  if (!collapsed) return ""
  return collapsed.charAt(0).toUpperCase() + collapsed.slice(1).toLowerCase()
}
