/**
 * BiblioCartIcon — caddie en trait, icône de l'onglet Biblio.
 * Se comporte exactement comme les icônes Lucide de la nav : le tracé utilise
 * `currentColor`, donc il devient crème sur l'onglet actif (fond brique) et
 * encre sur l'onglet inactif (fond papier). Aucune pastille de fond.
 * Source : /public/icons/files/caddie-ligne.svg.
 */
function BiblioCartIcon({ className }: { className?: string; strokeWidth?: number }) {
  // viewBox recadré au plus près du tracé (le SVG source 120×112 laissait une
  // large marge vide qui rendait l'icône plus petite que ses voisines Lucide).
  // On garde nos propres épaisseurs de trait et on ignore `strokeWidth`.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="18.5 11 89 89"
      fill="none"
      stroke="currentColor"
      strokeWidth={7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M22 22 L31 22 L41 35 L104 35 L92 66 L52 66 L41 35" />
      <path d="M54 66 L58 74" />
      <path d="M86 66 L88 74" />
      <circle cx="58" cy="82" r="8" strokeWidth={5} />
      <circle cx="88" cy="82" r="8" strokeWidth={5} />
    </svg>
  )
}

export { BiblioCartIcon }
