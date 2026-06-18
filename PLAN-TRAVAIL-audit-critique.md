# Plan de travail — Audit technique & Critique UX

> **App Couple** · Design System « Sauge & Brique » (Riso) · branche `audit-ui`
> Généré le 2026-06-15 · Registre : **produit** · Cible a11y : **WCAG AA**
> Source : `/impeccable audit` + `/impeccable critique` (cible `src/app/(app)/lists`)

**Comment utiliser ce document** : coche les cases au fur et à mesure, remplis la colonne *Statut*
(`à faire` / `en cours` / `fait` / `abandonné`) et la colonne *Notes*. Chaque item porte la
**commande `/impeccable`** qui sait quoi corriger.

---

## 0. Tableau de bord

| | Score | Verdict |
|---|---|---|
| **Audit technique** | **17 / 20** | Bon — 1 dimension faible (accessibilité) |
| **Critique UX** (heuristiques Nielsen) | **33 / 40** | Bon — haut de fourchette |
| **Anti-patterns IA** | **PASS** | Identité riso assumée ; détecteur déterministe = 0 finding |

**Décompte des problèmes** : P0 = 0 · P1 = 2 · P2 = ~6 · P3 = ~6

**Le geste à plus fort levier** : assombrir le token `brique` `#C5594A → #A2493D`.
Il répare à lui seul presque toute la dette de contraste (boutons, nav active, badges,
EN RETARD, titres en retard, liens).

---

## 1. Suivi des actions (vue consolidée)

Ordre = impact décroissant. Décision prise : **on traite P1 + tous les P2** ; le crayon mort → **on le retire**.

| # | Action | Commande | Sévérité | Statut | Notes |
|---|---|---|---|---|---|
| 1 | Assombrir `brique` → `#A2493D` + placeholders opaques + icône calendrier active | `/impeccable colorize` | P1 | ☐ | |
| 2 | Retirer `maximumScale:1` + cibles tap 44px (calendrier/croix) + « + » accessible au pouce | `/impeccable adapt` | P1 | ☐ | |
| 3 | Titres de tâches : `truncate` → 2 lignes / expansion | `/impeccable layout` | P2 | ☐ | |
| 4 | Soft-delete + toast d'annulation ; `SendSheet` sur base-ui ; label onglet Biblio | `/impeccable harden` | P2 | ☐ | |
| 5 | Retirer le crayon désactivé de l'écran to-do | `/impeccable distill` | P2 | ☐ | |
| 6 | Passe finale (reduced-motion, max-width, `title` sur boutons désactivés) | `/impeccable polish` | P3 | ☐ | |

---

## 2. AUDIT TECHNIQUE (a11y · perf · responsive · theming · anti-patterns)

### 2.1 Score par dimension

| # | Dimension | Score | Constat clé |
|---|---|---|---|
| 1 | Accessibilité | 2/4 | Sémantique ARIA/clavier excellente, mais contraste `brique` + placeholders sous AA, zoom désactivé |
| 2 | Performance | 4/4 | `Promise.all` (pas de N+1), `next/font`, optimistic UI, cache IndexedDB |
| 3 | Responsive | 3/4 | Mobile-first soigné, safe-area ; 2 cibles tap < 44px, pas de max-width sur certains écrans |
| 4 | Theming | 4/4 | Système de tokens complet, **zéro couleur en dur** dans les composants |
| 5 | Anti-patterns | 4/4 | Identité riso documentée — pas de slop IA. Un seul tell (bordure latérale) |

### 2.2 Constats détaillés

#### P1 — Majeur (avant release)

- [ ] **Contraste insuffisant de `brique`** · *Accessibilité · WCAG 1.4.3 (AA)*
  - Token `--brique #C5594A` — `src/app/globals.css:38`
  - Usages : `riso-button.tsx:18` (primary), `bottom-nav.tsx:59` (onglet actif), `riso-badge.tsx:18`, `DueBadge.tsx:23` (EN RETARD), `TaskItem.tsx:89` (titre en retard), `avatar-identity.tsx:20`, lien « Créer un compte » `login/page.tsx:59`
  - Mesures : clair sur brique = **3.90:1** · brique sur papier = **3.43:1** (requis 4.5:1 pour ces tailles 9–15px)
  - **Fix** : `--brique` → `#A2493D` (vérifié : clair/brique → 5.5 · brique/paper-light → 5.38 · brique/paper → 4.73)
  - Commande : `/impeccable colorize` · **Statut :** ____

- [ ] **Zoom utilisateur bloqué** · *Accessibilité · WCAG 1.4.4 (AA)*
  - `src/app/layout.tsx:58` — `maximumScale: 1`
  - Inutile ici : les champs sont déjà en `text-base` (16px) → l'anti-zoom iOS est déjà couvert
  - **Fix** : retirer `maximumScale`
  - Commande : `/impeccable adapt` · **Statut :** ____

#### P2 — Mineur (prochain passage)

- [ ] **Placeholders sous le seuil de contraste** · WCAG 1.4.3
  - `riso-input.tsx:20` (`/60`), `AddTaskBar.tsx:73` (`/55`), `library-client.tsx:303`, `list-detail-client.tsx:489`
  - Mesures : 2.78 → 3.94 (requis 4.5). **Fix** : `text-ink-soft` plein ou `/80`. Commande : `/impeccable colorize` · **Statut :** ____

- [ ] **Icône calendrier active quasi invisible** · WCAG 1.4.11
  - `AddTaskBar.tsx:101` — `text-brique` sur fond `sauge` = **1.45:1** (requis 3:1)
  - **Fix** : garder l'icône `ink`, signaler l'état via le badge de date. Commande : `/impeccable colorize` · **Statut :** ____

- [ ] **`SendSheet` : modale sans piège de focus** · Accessibilité + cohérence
  - `library-client.tsx:689` — modale faite main (pas de focus-trap/restauration) ≠ `NewListSheet` (base-ui)
  - **Fix** : reconstruire sur `Dialog` base-ui. Commande : `/impeccable harden` · **Statut :** ____

- [ ] **Cible tap < 44px** · WCAG 2.5.5 / DESIGN_SYSTEM §8
  - `AddTaskBar.tsx:99` bouton calendrier `size-9` (36px) ; croix « retirer l'échéance » `AddTaskBar.tsx:84`
  - **Fix** : 44px. Commande : `/impeccable adapt` · **Statut :** ____

#### P3 — Polish

- [ ] **Bordure latérale « overdue »** — `TaskItem.tsx:72` (`border-l-[6px] border-l-brique`), pattern banni + redondant. → `/impeccable quieter`
- [ ] **`/design-test` livrée en prod** — `src/app/design-test/page.tsx`, route publique auto-étiquetée « temporaire ». *(tâche de fond déjà proposée)*
- [ ] **`button.tsx` mort** — `src/components/ui/button.tsx`, importé nulle part, variantes `dark:` + `h-8` (<44px). *(tâche de fond déjà proposée)*
- [ ] **Niveaux de titres sautés** — chaque écran a bien 1 `h1`, mais `CategoryHeader`/`DonePanel` en `h4`, tuiles en `h3` (saut h1→h3/h4). `CategoryHeader` (`category-header.tsx:30`) devrait être `h2`. → `/impeccable harden`
- [ ] **Aucun `prefers-reduced-motion`** — spinner sync (`offline-indicator.tsx`), slide du sheet. → `/impeccable animate`
- [ ] **Sondage IndexedDB permanent** — `offline-indicator.tsx:53` `setInterval(2000ms)` tourne même en ligne/sans file. Le conditionner à `(offline || pending>0)`. → `/impeccable optimize`

### 2.3 Problèmes systémiques

1. **Contraste `brique` = seul vrai défaut a11y, mais partout** → un seul token (`#A2493D`) répare boutons, nav, badges, EN RETARD, titres, liens.
2. **Placeholders : même réflexe d'opacité (`/55`–`/60`) sur 5 champs** → normaliser en une passe.
3. **Deux patterns de bottom-sheet** (base-ui vs maison) → converger sur base-ui.

### 2.4 Points positifs (à préserver)

- Identité forte et documentée ; tokens sémantiques shadcn recâblés sur la palette riso ; **zéro hex en dur** dans les composants.
- A11y de structure excellente : `aria-label` sur tous les boutons-icônes, `aria-expanded`, `aria-current`, `aria-pressed`, `role="alert"/"status"` + `aria-live`, `role="checkbox"`, anneaux `focus-visible` partout, cibles 44px quasi systématiques.
- Pas de modale par réflexe : divulgation inline.
- Ingénierie front sérieuse : optimistic UI + file offline + temps réel + cache, `Promise.all` sans N+1, `text-base` anti-zoom iOS, contrôles natifs (`select`/`date`/`search`).
- Contraste du texte secondaire solide (`ink-soft` = 6.3–7.2:1).
- États vides qui enseignent.

---

## 3. CRITIQUE UX (heuristiques Nielsen · personas)

### 3.1 Design Health Score — 33/40

| # | Heuristique | Score | Constat clé |
|---|---|---|---|
| 1 | Visibilité de l'état système | 4 | Optimistic UI + offline/sync/pending + temps réel |
| 2 | Correspondance monde réel | 4 | Français fluide, tutoiement, « rayon », EN RETARD/AUJOURD'HUI |
| 3 | Contrôle & liberté | 3 | Annuler partout, mais **aucune annulation après suppression** |
| 4 | Cohérence & standards | 3 | Deux implémentations de bottom-sheet ; inputs inline dupliqués |
| 5 | Prévention des erreurs | 4 | Confirmations, `maxLength`, anti-doublon, défauts intelligents |
| 6 | Reconnaissance vs rappel | 3 | Onglet « Biblio » icône seule (label masqué) |
| 7 | Flexibilité & efficacité | 3 | Envoi groupé, saisie en rafale, Enter/Échap |
| 8 | Esthétique & minimalisme | 4 | Discipline riso, divulgation progressive ; un crayon mort en trop |
| 9 | Récupération d'erreur | 3 | Erreurs inline `role=alert` ; « réessaie plus tard » sans bouton retry |
| 10 | Aide & documentation | 2 | États vides pédagogues, mais zéro apprentissage du modèle biblio/fréquence |

### 3.2 Priority Issues (UX)

- [ ] **[P1] Contraste `brique` + zoom** — pire en magasin/plein soleil (contexte réel). → `colorize` + `adapt` · **Statut :** ____
- [ ] **[P2] Titres de tâches tronqués** — `truncate` sur `TaskItem.tsx:85`, ItemRow, LibraryRow. Le titre EST le contenu d'une to-do. **Fix** : `line-clamp-2` ou expansion au tap. → `layout` · **Statut :** ____
- [ ] **[P2] Crayon « renommer » désactivé dans la to-do** — `TodoListView.tsx:251`, alors que ça marche depuis le hub. **Décision : retirer.** → `distill` · **Statut :** ____
- [ ] **[P2] Aucune annulation après suppression** — données partagées : l'un peut effacer le travail de l'autre. **Fix** : soft-delete + toast undo 5s. → `harden` · **Statut :** ____
- [ ] **[P2] Cohérence sheets + onglet icône seule** — `SendSheet` sans focus-trap ; onglet Biblio sans label (`bottom-nav.tsx:27`). → `harden` · **Statut :** ____

### 3.3 Persona Red Flags

- **Casey (mobile, une main, interrompu)** : ✅ persistance + offline excellents, sheets en bas. ❌ « + Nouvelle liste » en haut à droite (hors pouce) ; calendrier 36px.
- **Sam (lecteur d'écran / clavier / malvoyant)** : ✅ sémantique excellente, sens jamais porté par la couleur seule. ❌ contraste brique < AA, zoom bloqué, `SendSheet` sans focus-trap.
- **Riley (cas limites)** : ❌ titres longs illisibles ; conflit silencieux si les deux éditent le même item hors-ligne (last-write-wins) ; suppression d'un article biblio présent en listes (effet non visible côté UI).
- **Marie, la conjointe qui rejoint** : ✅ join clair (code + prénom, couleur auto). ❌ ne voit pas les listes « perso » du partenaire (peut chercher « où sont ses affaires ») ; couleur non modifiable.

### 3.4 Questions à trancher

- [ ] Faut-il une vraie **corbeille / annulation** pour des suppressions sur données partagées ?
- [ ] Le modèle **bibliothèque + fréquence + rayons** est-il compris des deux sans explication, ou faut-il un mini-onboarding au 1ᵉʳ usage ?
- [ ] Le **titre** d'une tâche est son contenu : pourquoi le tronquer ?

---

## 4. Référence rapide — palette & contrastes vérifiés

| Paire | Ratio | AA texte normal (4.5) |
|---|---|---|
| ink `#1A1410` sur paper `#F0E5D0` | 14.61 | ✅ |
| ink-soft `#5C4F40` sur paper-light `#FBF4E2` | 7.23 | ✅ |
| paper-light sur **brique `#C5594A`** | **3.90** | ❌ |
| **brique** sur paper-light | **3.90** | ❌ |
| ink sur sauge `#7B9E89` | 6.16 | ✅ |
| placeholder ink-soft/60 sur paper-light | 2.82 | ❌ |
| **brique `#A2493D` (proposé)** sur paper-light | **5.38** | ✅ |
| paper-light sur **brique `#A2493D` (proposé)** | **~5.5** | ✅ |

---

*Relancer `/impeccable audit` et `/impeccable critique` après les correctifs pour mesurer la progression.*
*Snapshot critique archivé : `.impeccable/critique/2026-06-15T18-57-15Z__src-app-app-lists.md`*
