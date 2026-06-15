# DESIGN SYSTEM V2 — Additions pour le module To-do

> Additif au `DESIGN_SYSTEM.md` V1. On ne réécrit pas la palette, les typos, les boutons de base, etc. — on ajoute uniquement ce qui est nouveau.

| | |
|---|---|
| **Version** | 2.0 |
| **Date** | Juin 2026 |
| **Référence V1** | `DESIGN_SYSTEM.md` |

---

## 1. Nouvelles icônes

### 1.1 Tampons de section (`section-marker`)

Sur le hub, chaque type de liste est introduit par une **icône simple alignée à gauche**, juste avant la première tuile du groupe.

- **Icône seule**, sans cadre, sans fond, sans ombre.
- **Taille** : `30px`, couleur `ink`, stroke `2`.
- **Alignement** : à gauche (`justify-content: flex-start`), `padding-left: 4px` pour s'aligner avec le bord des tuiles.
- **Espacement** : 4-10px au-dessus de la première tuile du groupe, 28px au-dessus du tampon (sauf pour le premier groupe).

Deux variantes :
- **To-do** : icône `list-checks` (lucide-react).
- **Courses** : icône `shopping-cart` (lucide-react).

L'icône est **masquée** si son groupe est vide (pas d'icône orpheline).

### 1.2 Icône "Partagé" — 3 propositions à arbitrer

L'icône signale qu'une liste est partagée avec ta conjointe. Placée **en haut à droite de la tuile**, taille `18-20px`, couleur `sauge`, sur petit fond `paper-light` arrondi avec bordure ink fine. Optionnelle (absente si liste perso).

**Option A — Deux personnes** (`users` de lucide-react)
Lisibilité immédiate, sémantique évidente "deux personnes voient ça". Sobre.

**Option B — Lien** (`link-2` ou `link` de lucide-react)
Plus abstrait : suggère la connexion entre deux espaces. Élégant.

**Option C — Cœur ouvert** (`heart` outline de lucide-react)
Sémantique "couple" plus chaleureuse. Risque : associé aux favoris dans d'autres apps.

> **Recommandation** : **A · Deux personnes**. C'est l'icône la plus universelle pour "partagé", sans ambiguïté sémantique. Les 3 sont rendues dans `maquettes_v2.html` pour comparaison.

---

## 2. Composants nouveaux

### 2.1 Tuile de liste — version V2

La tuile V1 est conservée, on y ajoute un seul marqueur :

- **En haut à droite** : icône "Partagé" si applicable.
- Pour les **to-do lists** : le compteur affiche `X à faire · Y au total` (au lieu de `X à acheter · Y au total`).

L'icône de **type** (courses ou to-do) **n'est plus sur la tuile** — elle vit dans le tampon de section au-dessus du groupe (cf. 1.1).

Tout le reste — bordures, ombres, typos, "Vider la liste · N", crayon — est identique à la V1.

### 2.2 Modal "Nouvelle liste" (Sheet)

Sheet montant du bas (composant Sheet existant). Contenu :

```
┌─────────────────────────────────┐
│   ━━━━━ (poignée)              │
│                                 │
│   NOUVELLE LISTE                │  ← Silkscreen 22px
│                                 │
│   ┌─────────────┐ ┌──────────┐  │
│   │  🛒 COURSES │ │ ✓ TO-DO  │  │  ← deux boutons type
│   │   (actif)   │ │          │  │     style "tile select"
│   └─────────────┘ └──────────┘  │
│                                 │
│   Nom de la liste               │  ← Caption
│   ┌─────────────────────────┐   │
│   │ Auchan                  │   │  ← input texte
│   └─────────────────────────┘   │
│                                 │
│   [✓] Partager avec [Prénom]    │  ← checkbox + texte
│                                 │
│   ┌─────────────────────────┐   │
│   │       CRÉER             │   │  ← btn primary
│   └─────────────────────────┘   │
└─────────────────────────────────┘
```

**Bouton type (Courses / To-do)** :
- Largeur ~48% chacun, padding `16px`, bordure `2px ink`, radius `12px`.
- État actif : fond `paper-light`, ombre `riso-brique`. Icône large (caddie ou checklist) + label Silkscreen 13px MAJ.
- État inactif : fond `paper`, sans ombre. Opacité 0.6.

**Checkbox "Partager"** : `26px × 26px`, comme une case à cocher tâche/article. Texte à côté en Hanken 13px 500.

### 2.3 TaskItem (élément de tâche)

Une ligne dans la liste, padding `12px 14px`, séparée par bordure fine `paper-deep`. Structure :

```
[✓]  Renvoyer formulaire CAF       [VENDREDI]  •
```

- **Case à cocher** : identique aux articles (`26px`, radius `6px`, fond `paper`, check brique).
- **Titre** : Hanken 15px 500, `ink`.
- **DueBadge** (échéance, optionnel) : voir 2.4.
- **Marqueur "ajouté par"** (point coloré 12px), comme pour les articles V1.

### 2.4 DueBadge (étiquette d'échéance)

Petite étiquette à droite du titre, juste avant le marqueur "ajouté par". Silkscreen 11px MAJ, padding `2px 6px`, bordure `1.5px ink`, radius `4px`.

| État | Texte | Fond | Texte couleur |
|---|---|---|---|
| Aujourd'hui | `AUJOURD'HUI` | `sauge` | `ink` |
| Demain | `DEMAIN` | `sauge` | `ink` |
| Bientôt (cette semaine) | `MAR. 24 JUIN` (jour + date) | `paper-light` | `ink-soft` |
| Date plus lointaine | `12 JUIL` (date courte) | `paper-light` | `ink-soft` |
| **En retard** | `EN RETARD` | `brique` | `paper-light` |

### 2.5 Style "Tâche en retard" (état complet)

Quand `due_date < aujourd'hui` et tâche non cochée :
- **Bordure gauche** épaisse de `4px solid brique` (overlay sur la ligne)
- **Titre** en couleur `brique` (au lieu de `ink`)
- **DueBadge** "EN RETARD" en `brique` plein (cf. 2.4)
- Le reste de la ligne (case à cocher, marqueur ajouté par) inchangé

### 2.6 Style "Tâche faite"

Quand `is_done = true` :
- **Case à cocher** : fond `brique`, check `paper-light` (état coché normal)
- **Titre** : `line-through`, opacité `0.55`
- **DueBadge** : disparaît (peu pertinent une fois fait)
- La tâche **glisse dans la section "Fait"** en bas de l'écran (visuel apaisé)

### 2.7 AddTaskBar (champ d'ajout de tâche)

Identique au `add-bar` V1 (fond `sauge`, bordure `2px ink`, radius `10px`, ombre `riso-ink`), avec :
- Placeholder : `"Ajouter une tâche…"`
- Icône `+` à gauche
- À l'ouverture (focus), un mini-bouton calendrier apparaît à droite pour saisir une échéance optionnelle.

### 2.8 DonePanel (section "Fait")

Section collapsible en bas de l'écran d'une to-do list, similaire à la section "Déjà pris" des courses.

- **En-tête** : style `category-title` V1 (bandeau `ink`, texte `paper`), label "Fait" en Silkscreen 15px, compteur `×N ✓` en sauge à droite.
- **Contenu** : liste des 10 tâches faites les plus récentes, opacité globale 0.7.
- **État** : repliable. Par défaut **replié** (collapsed) si tâches ≥ 3, ouvert sinon.
- En bas, un petit lien Hanken 12px souligné `ink-soft` : "Voir l'historique →" pointant vers Profil > Historique.

### 2.9 Page Historique (dans Profil)

Liste plate, scrollable, des tâches faites au-delà des 10 récentes par liste. Regroupement par mois :

```
┌─ JUIN 2026 ────────────────────┐
│  ✓ Renvoyer CAF · Démarches    │
│    Fait il y a 5j              │
│  ✓ Acheter peinture · Leroy M. │
│    Fait il y a 8j              │
├─ MAI 2026 ─────────────────────┤
│  ✓ ...                         │
└────────────────────────────────┘
```

En-têtes de mois en Silkscreen 14px MAJ, séparés par bordure ink fine. Items en Hanken 13px, méta en Caption.

---

## 3. États visuels — récap

| Élément | État | Couleur principale |
|---|---|---|
| Tuile courses | normal | ombre alternée brique/sauge |
| Tuile to-do | normal | ombre alternée brique/sauge |
| Icône type | dans tuile | `ink` opacité 0.7 |
| Icône partagé | dans tuile | `sauge` sur fond paper-light |
| Tâche normale | non cochée | `ink` |
| Tâche bientôt due | aujourd'hui/demain | étiquette `sauge` |
| Tâche en retard | dépassée | bordure gauche + titre `brique` + étiquette pleine |
| Tâche faite | cochée | `ink-soft` opacité 0.55, line-through |
| Section "Fait" | bas de liste | bandeau ink, contenu atténué |

---

## 4. Hiérarchie visuelle d'une to-do list

Lorsque tu ouvres une to-do list, l'ordre visuel d'attention (du haut vers le bas) :

1. En-tête (titre, retour, partage, crayon)
2. AddTaskBar (champ d'ajout)
3. **Tâches en retard** (les plus criardes, par ancienneté de l'échéance dépassée)
4. **Tâches bientôt dues** (aujourd'hui, demain)
5. Tâches avec échéance future
6. Tâches sans échéance
7. Section "Fait" (collapsée si nombreuses)

---

## 5. Ce qu'on ne change PAS

- La palette (Sauge & Brique inchangée)
- Les typos (Silkscreen + Hanken Grotesk inchangées)
- La nav du bas (3 onglets, identique)
- Les composants V1 (boutons, badges, avatars, champs, cases à cocher des articles, etc.)
- La structure des écrans courses (intérieur de liste de courses inchangé)

---

*Fin du Design System V2.*
