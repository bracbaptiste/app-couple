# Product

## Register

product

## Users

Un couple (deux personnes vivant ensemble). Usage mobile, plusieurs fois par jour,
souvent en mobilité (en course, dans la cuisine, au travail). PWA installée sur
téléphone, parfois utilisée hors-ligne (réseau intermittent en magasin). Les deux
partenaires partagent les mêmes listes et tâches en temps réel ; chacun ajoute,
coche, complète depuis son propre appareil.

## Product Purpose

« Le cerveau partagé du couple. » L'app centralise les listes de courses et les
to-do du foyer pour qu'aucun des deux n'ait à tout retenir ni à se le redire.
Succès = ouvrir l'app, voir d'un coup d'œil ce qui reste à faire / acheter, agir
en deux taps, et que l'autre voie le changement instantanément. La rapidité de
saisie et la synchronisation temps réel priment sur la richesse fonctionnelle.

## Brand Personality

Chaleureux, artisanal, tangible — l'inverse du SaaS froid. Voix directe et
familière (français, tutoiement implicite, pas de jargon). Esthétique « imprimé »
revendiquée : risographe / fanzine, encre et papier crème, pas d'écran clinique.
Trois mots : **imprimé, lisible, complice**.

## Anti-references

- **SaaS générique froid** : fonds blancs/gris cliniques, ombres floues diffuses,
  dégradés, glassmorphism. L'app doit sentir le papier, pas le dashboard.
- **Surcharge décorative** : pas de 3e couleur d'accent, pas d'animations
  gratuites. La discipline « 2 couleurs + papier + encre » fait la cohérence.
- **Silkscreen partout** : la police display ne sert qu'aux éléments courts qui
  « crient » (titres, compteurs, badges), jamais aux phrases.

## Design Principles

1. **Imprimé, pas digital-froid.** Bordures encrées, ombres décalées nettes,
   trame de demi-tons. On évoque le papier, jamais l'écran clinique.
2. **Discipline de palette.** 2 couleurs (brique + sauge) + papier + encre. Les
   accents ponctuent, ne saturent pas ; le crème domine en permanence.
3. **Lisibilité avant tout.** Usage pluriquotidien, souvent en mouvement :
   contrastes nets, zones tap ≥ 44px, corps jamais sous 13px.
4. **Deux taps, pas trois.** La saisie et le cochage sont les actions reines ;
   tout ce qui s'interpose (modals, étapes, choix) doit se justifier.
5. **Le partage est tangible.** Identité de chaque personne visible (couleur,
   marqueur « ajouté par »), changements de l'autre reflétés en temps réel.

## Accessibility & Inclusion

Cible **WCAG 2.1 AA**. Points de vigilance connus : ne pas désactiver le zoom
utilisateur (`maximum-scale`), contraste du texte secondaire (`ink-soft`) et du
texte sur fonds `brique`/`sauge`, focus clavier visible, libellés de formulaires
et de boutons-icônes. Pas de dark mode (le papier crème domine par choix de
design). Respect de `prefers-reduced-motion` pour toute animation ajoutée.
