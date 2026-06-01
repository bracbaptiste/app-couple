# DESIGN SYSTEM — Sauge & Brique

> La référence visuelle du projet. Tout écran se construit à partir de ces tokens et composants. Aucune valeur "à l'œil" : on pioche ici.
> Référence visuelle : `design_system_visuel.html` et `maquettes_riso_palettes.html` (palette A).

| | |
|---|---|
| **Style** | Riso Print (impression risographe / fanzine) |
| **Palette** | Sauge & Brique sur papier crème |
| **Typos** | Silkscreen (display) · Hanken Grotesk (UI/corps) |

---

## 1. Principes directeurs

1. **Imprimé, pas digital-froid.** Bordures encrées, ombres décalées, trame de demi-tons. On évoque le papier.
2. **2 couleurs + papier + encre.** Pas plus. La discipline de la palette fait la cohérence.
3. **Lisibilité avant tout.** L'appli s'utilise plusieurs fois par jour : contrastes nets, zones tap généreuses.
4. **Les accents sont des accents.** Le crème domine ; brique et sauge ponctuent, ne saturent pas.

---

## 2. Tokens couleur

| Token | Hex | Usage |
|---|---|---|
| `paper` | `#F0E5D0` | Fond d'écran |
| `paper-light` | `#FBF4E2` | Cartes, tuiles, champs |
| `paper-deep` | `#E5D7BC` | Séparateurs, états vides |
| `ink` | `#1A1410` | Texte principal, bordures |
| `ink-soft` | `#5C4F40` | Texte secondaire, méta |
| `brique` | `#C5594A` | Accent 1 : compteurs, nav active, accents de titre, avatar conjointe |
| `sauge` | `#7B9E89` | Accent 2 : avatar toi, ombres de 50% des tuiles, bouton +, trame de fond |

### Config Tailwind (`tailwind.config.ts`)

```ts
export default {
  theme: {
    extend: {
      colors: {
        paper:        '#F0E5D0',
        'paper-light':'#FBF4E2',
        'paper-deep': '#E5D7BC',
        ink:          '#1A1410',
        'ink-soft':   '#5C4F40',
        brique:       '#C5594A',
        sauge:        '#7B9E89',
      },
      boxShadow: {
        'riso-sauge':  '4px 4px 0 #7B9E89',
        'riso-brique': '4px 4px 0 #C5594A',
        'riso-ink':    '4px 4px 0 #1A1410',
        'riso-ink-sm': '2px 2px 0 #1A1410',
        'riso-ink-lg': '5px 5px 0 #1A1410',
      },
      fontFamily: {
        display: ['Silkscreen', 'monospace'],
        body:    ['"Hanken Grotesk"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
}
```

---

## 3. Typographie

| Rôle | Police | Taille | Graisse | Casse | Usage |
|---|---|---|---|---|---|
| Display L | Silkscreen | 28px | 700 | MAJ | Titre d'écran ("Nos listes") |
| Display M | Silkscreen | 17-18px | 700 | MAJ | Noms de listes, titres de section |
| Display S | Silkscreen | 13px | 400 | — | Compteurs, badges |
| Body L | Hanken Grotesk | 15px | 500 | — | Noms d'articles |
| Body M | Hanken Grotesk | 13px | 500 | — | Texte courant |
| Caption | Hanken Grotesk | 11px | 600 | MAJ + letter-spacing 0.1em | Méta ("8 articles · maj 12 min") |

**Règle :** Silkscreen uniquement pour les éléments courts et "qui crient". Jamais pour des phrases (illisible). Le corps de texte est toujours en Hanken Grotesk.

**Import (dans `layout.tsx` ou via `<link>`) :**
```
Silkscreen:wght@400;700
Hanken+Grotesk:wght@400;500;600;700
JetBrains+Mono:wght@400;600;700
```

---

## 4. Signature riso (à appliquer partout)

- **Bordure** : `2px solid ink` (ou `2.5px` pour les conteneurs importants).
- **Ombre** : décalée bas-droite, `4px 4px 0` en `sauge` ou `brique` (alterner pour rythmer), `ink` pour les éléments neutres.
- **Coins** : `border-radius` entre `8px` et `14px`. Jamais de carré brut (trop dur) ni de cercle parfait (sauf cas particulier).
- **Trame de fond** : points en `sauge` à ~13% d'opacité, taille `8px`, en arrière-plan permanent de l'app.

```css
/* Trame de fond globale (dans globals.css) */
body {
  background-color: #F0E5D0;
  background-image: radial-gradient(circle, rgba(123,158,137,0.13) 1.5px, transparent 1.5px);
  background-size: 8px 8px;
}
```

---

## 5. Spécifications des composants

### 5.1 Boutons

| Variante | Fond | Texte | Bordure | Ombre |
|---|---|---|---|---|
| Primary | `brique` | `paper-light` | `2px ink` | `riso-ink-sm` |
| Secondary | `paper-light` | `ink` | `2px ink` | `riso-sauge` (sm) |
| Ghost | transparent | `ink` | `2px dashed ink` | aucune |

- Police : Silkscreen 12px MAJ. Padding : `11px 18px`. Radius : `8px`.

### 5.2 Compteur (badge)
- Silkscreen 13px, fond `brique` (ou `sauge` pour listes secondaires, `paper` pour état "tout coché").
- `min-width: 34px`, `height: 34px`, bordure `2px ink`, ombre `riso-ink-sm`. Texte `paper-light` (sur brique) ou `ink` (sur sauge/paper).

### 5.3 Case à cocher
- `26px × 26px`, radius `6px`, bordure `2.5px ink`, fond `paper`.
- État coché : fond `brique`, check SVG `paper-light` stroke-width 3.5.

### 5.4 Avatar
- `40px × 40px`, bordure `2.5px ink`, ombre `riso-ink-sm`, Silkscreen 15px.
- Fond = couleur d'identité (`sauge` pour toi, `brique` pour conjointe). Initiale du prénom.

### 5.5 Champ "Ajouter un article"
- Fond `sauge`, bordure `2px ink`, radius `10px`, ombre `riso-ink`.
- Icône `+` à gauche, placeholder Hanken 13px 600. Toujours en haut de la liste.

### 5.6 Champ recherche (Bibliothèque)
- Fond `paper-light`, bordure `2px ink`, radius `10px`, ombre `riso-sauge`.
- Icône loupe à gauche, placeholder Hanken 13px 500 `ink-soft`.

### 5.7 En-tête de catégorie
- Bandeau fond `ink`, texte `paper`, radius `6px`, padding `6px 12px`.
- Nom en Silkscreen 15px. Compteur à droite en JetBrains Mono 11px, couleur `sauge`.

### 5.8 Pastilles de fréquence
- 4 carrés `9px`, bordure `1.5px ink`. Remplis en `brique` selon la fréquence (4 = très acheté, 1 = rare).

### 5.9 Tuile de liste
- Fond `paper-light`, bordure `2px ink`, ombre alternée `riso-brique` / `riso-sauge`, padding `13px 15px`.
- Titre Silkscreen 17px MAJ. Méta en Caption. Badge compteur en haut à droite.

### 5.10 Marqueur "ajouté par"
- Petit carré `12px`, bordure `1.5px ink`, fond = couleur de la personne. Placé à droite de chaque article.

### 5.11 Barre de navigation (bas)
- Fond `paper-light`, bordure haute `2.5px ink`, 3 items.
- Item actif : fond `brique`, texte `paper-light`, bordure `2px ink`, ombre `riso-ink-sm`, radius `8px`.
- Item inactif : texte `ink-soft`, transparent.
- Labels Silkscreen 9px MAJ. Icônes 20-22px stroke 2.5.

### 5.12 Sheet (fenêtre du bas)
- Monte depuis le bas. Fond `paper`, bordure haute `2.5px ink`, radius haut `20px`.
- Poignée : barre `48px × 5px` en `ink`, centrée.
- Titre Silkscreen, accent du nom de l'item highlighté.
- Choix de listes : cartes `paper-light` avec bordure `2px ink` + ombre `riso-ink`.

---

## 6. Icônes

- Style **trait** (outline), stroke-width `2` à `2.5`, jamais de remplissage massif.
- Sources : `lucide-react` (déjà compatible shadcn). Cohérence de l'épaisseur sur toutes les icônes.
- Les icônes nav : Listes = lignes + puces, Bibliothèque = grille 4 cases, Profil = silhouette.

---

## 7. Espacement & rythme

- Échelle de base : multiples de 4px (`4, 8, 12, 16, 20, 24`).
- Padding écran latéral : `20-24px`.
- Gap entre tuiles : `12-14px`.
- Padding interne des cartes : `13-16px`.

---

## 8. Accessibilité

- **Zones tap** : minimum `44px × 44px` sur tout élément cliquable.
- **Contraste** : encre `#1A1410` sur papier `#F0E5D0` = contraste élevé, OK. Vérifier que le texte sur `brique`/`sauge` reste lisible (utiliser `paper-light` sur brique, `ink` sur sauge).
- **Taille de texte** : corps jamais en dessous de 13px. Silkscreen jamais utilisé pour des paragraphes.
- **États** : tout élément interactif a un état visible au tap (léger enfoncement de l'ombre, ou changement de fond).

---

## 9. Ce qu'on NE fait PAS

- Pas de dégradés (incompatible avec l'esthétique riso plate).
- Pas d'ombres floues/diffuses (uniquement les ombres décalées nettes).
- Pas de Silkscreen sur des phrases longues.
- Pas d'une 3e couleur d'accent sans validation (on tient la discipline 2 couleurs).
- Pas de coins parfaitement carrés ni de cercles parfaits (sauf pastilles/points décoratifs).

---

*Fin du Design System.*
