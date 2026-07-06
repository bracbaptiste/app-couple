# PRD — V4.1 « Consolidation » : annulation des suppressions, pédagogie & ménage

**Application :** PWA mobile-first (Next.js / React + Supabase) de gestion de charge mentale du foyer
**Périmètre :** 2 utilisateurs (Baptiste + Sonia), usage privé
**Auteur fonctionnel :** Baptiste BRAC (session de cadrage du 6 juillet 2026)
**Statut :** prêt pour implémentation

---

## 0. Comment utiliser ce document

**Pour Claude Code :**

1. **Avant de coder quoi que ce soit**, inspecte le code existant cité dans chaque section (fichiers + lignes indiqués). La V4.1 **réutilise les patterns existants** (toast ANNULER du Cerveau, coach mark, garde `requireMembership()`, workflow migrations) — elle n'en invente pas de nouveaux.
2. **RÈGLE ABSOLUE (héritée V4, toujours en vigueur) : aucune réorganisation des outils.** Mêmes routes, mêmes écrans, mêmes icônes. La V4.1 ne contient AUCUNE nouvelle feature visible, à deux exceptions près : le toast « ANNULER » après une suppression et l'encart pédagogique de la bibliothèque.
3. **Explique tes changements en français avant de les appliquer**, étape par étape. Pas de grosse refonte d'un coup.
4. **Construis dans l'ordre des phases** (§9). Chaque phase se termine par `tsc` + `eslint` + `next build` verts avant de passer à la suivante.
5. **Garde-fou mémoire (NON NÉGOCIABLE)** : jamais de DELETE/UPDATE sans filtre `couple_id`/`id`. Le soft-delete est un UPDATE : il obéit à la même règle.
6. Migrations via le workflow habituel : `supabase migration new` → `db push` (CLI liée au projet).

**Note pour Baptiste :** il reste une modif non commitée dans `src/components/shared/brain-button.tsx` (retrait de la coche sur le jeton actif de l'éventail). **Tranche-la avant de lancer le prompt 1** : commit si tu la veux, `git restore` sinon. La V4.1 démarre sur un arbre propre.

---

## 1. Contexte & objectif

La V4 est livrée (Cerveau, vocal, journal, planning, liste de la semaine). La V4.1 est une version courte de **consolidation** : elle rembourse la dette restante de l'audit UX/a11y du 15 juin (`PLAN-TRAVAIL-audit-critique.md`) et corrige le dernier vrai risque produit : **une suppression est définitive et l'un peut effacer le travail de l'autre sans recours.**

**Succès =** supprimer n'importe quoi (article, tâche, liste, recette, produit biblio) et pouvoir dire « oups » pendant 6 secondes ; un nouvel arrivant comprend la bibliothèque sans qu'on lui explique ; plus une seule route de test ni un composant mort en prod.

**Anti-objectif explicite :** aucune nouvelle feature majeure. L'offline V2, les notifications push, la corbeille partagée, les suggestions d'habitudes → **V5** (§8).

---

## 2. État des lieux de l'audit du 15 juin

À ne PAS refaire — déjà réglé pendant la V4 (vérifié dans le code au 6 juillet) :

| Item de l'audit | Preuve |
|---|---|
| Contraste `brique` → `#A2493D` (P1) | `globals.css:38` |
| `maximumScale: 1` retiré (P1) | `src/app/layout.tsx:58` (commentaire) |
| Titres tronqués → `line-clamp-2` (P2) | `TaskItem.tsx:370`, `list-detail-client.tsx:476`, `library-client.tsx:532` |
| `SendSheet` reconstruite sur base-ui `Dialog` (P2) | `library-client.tsx:771` |
| Crayon « renommer » mort retiré de la to-do (P2) | plus de bouton désactivé dans `TodoListView.tsx` |
| RPC `join_couple_with_code` redondante droppée | migration `20260622120000_audit_fixes.sql` |
| `prefers-reduced-motion` généralisé | ~10 blocs dans `globals.css` + composants |

Reste ouvert — c'est le périmètre V4.1 :

| # | Item | Sévérité audit | Section |
|---|---|---|---|
| 1 | Aucune annulation après suppression (soft-delete + toast) | P2 — le plus important | §4 |
| 2 | Zéro pédagogie du modèle bibliothèque / fréquence / rayons (Nielsen « aide » : 2/10) | P2 | §5 |
| 3 | `/design-test` livrée en prod, `button.tsx` mort, `bottom-nav.tsx` zombie | P3 | §7 |
| 4 | Sondage IndexedDB permanent de l'`OfflineIndicator` | P3 | §6.1 |
| 5 | Hiérarchie de titres sautée (h1 → h3/h4) | P3 | §6.2 |
| 6 | 4 placeholders encore en opacité `/60` | P2 (reliquat) | §6.3 |
| 7 | Erreur de synchro sans bouton « Réessayer » | P2 (Nielsen 9) | §6.4 |
| 8 | Couleurs d'identité non échangeables (red flag « Marie ») | P3 | §6.5 |

---

## 3. Décisions actées (session du 6 juillet 2026)

Ces décisions sont actées. Ne pas les remettre en cause pendant l'implémentation.

1. **Soft-delete généralisé** : les suppressions depuis l'UI ne font plus jamais de `DELETE` SQL — elles posent `deleted_at` (UPDATE filtré `couple_id`/`id`). Le `DELETE` physique disparaît des Server Actions concernées.
2. **Périmètre : 5 tables** — `lists`, `list_items`, `tasks`, `library_items`, `recipes`. Les **catégories sont exclues** : leur suppression a déjà un flux délibéré (rayon de remplacement obligatoire) qui vaut confirmation.
3. **Toast « Supprimé · ANNULER » ~6 s** après chaque suppression, dans le même langage visuel que le toast ANNULER du Cerveau (V4 Phase 2). Après le toast, la donnée reste soft-deleted en base (récupérable à la main en cas de catastrophe) mais n'est plus restaurable depuis l'UI.
4. **Résurrection anti-doublon** : les logiques find-or-create (article de biblio par nom, anti-doublon non-coché dans une liste) regardent AUSSI les lignes soft-deleted et les **ressuscitent** (`deleted_at = NULL`) au lieu de créer un doublon.
5. **Pas de purge automatique en V4.1.** Volume négligeable pour 2 utilisateurs. Une purge (> 30 jours) pourra venir plus tard.
6. **Pas de corbeille partagée ni d'undo côté partenaire** (le toast est local à celui qui supprime) → hors-périmètre, candidate V5.
7. **Pédagogie = encart papier dismissible**, pattern coach mark existant (localStorage, cf. `brain-coach-seen`). Jamais de modale bloquante, jamais réaffiché après fermeture.
8. **Échange de couleurs** : action « Échanger nos couleurs » dans le Profil, swap **atomique** des deux profils (RPC), avec confirmation. Pas de 3e couleur (discipline de palette).
9. **Ménage** : `/design-test`, `bottom-nav.tsx` et `button.tsx` sont supprimés. Aucun écran de prod ne doit régresser.
10. **Aucun changement de navigation, d'écran ou de wording** en dehors de ce qui est listé ici.

---

## 4. Pilier A — Annulation après suppression

### 4.1 Modèle de données

- Migration : colonne `deleted_at timestamptz NULL` (défaut `NULL`) sur `lists`, `list_items`, `tasks`, `library_items`, `recipes`.
- **RLS inchangée** (le filtre couple existant suffit — une ligne soft-deleted reste une ligne du couple).
- **Realtime déjà couvert** : ces tables sont publiées et en `REPLICA IDENTITY FULL` (migration `20260604210000`) ; un soft-delete est un UPDATE → l'autre appareil rafraîchit déjà via `useRealtimeRefresh`. Rien à faire côté hooks.
- Index partiels (`WHERE deleted_at IS NULL`) : optionnels, volume minuscule — ne les ajoute que si une requête le justifie.

### 4.2 Règles par entité

| Entité | Server Action actuelle | Comportement V4.1 |
|---|---|---|
| Liste (courses ou to-do) | `deleteList` — `(app)/lists/actions.ts:135` (supprime les `list_items` puis la liste) | UPDATE `lists.deleted_at` **uniquement** — on ne touche plus aux items : masqués avec leur liste, ils réapparaissent intacts à la restauration |
| Article de liste | `deleteItem` — `(app)/lists/[listId]/actions.ts:283` | UPDATE `list_items.deleted_at` |
| Tâche | `deleteTask` — `(app)/lists/[listId]/task-actions.ts:244` | UPDATE `tasks.deleted_at` ; une récurrente supprimée ne génère plus d'occurrence ; la restauration rétablit tout |
| Produit bibliothèque | `deleteLibraryItem` — `(app)/library/actions.ts:423` | La garde actuelle « Encore présent dans N listes » **est conservée telle quelle** (elle protège du cascade FK) ; seul le `DELETE` final devient un UPDATE `deleted_at` |
| Recette | `deleteRecipe` — `(app)/recipes/actions.ts:345` | UPDATE `recipes.deleted_at` ; les `recipe_ingredients` ne sont plus touchés |

### 4.3 Les lectures à filtrer — checklist exhaustive

Chaque lecture qui alimente un écran ou un contexte IA ajoute `deleted_at IS NULL`. Fais l'inventaire réel avant de coder, mais au minimum :

- Hub des listes (`(app)/lists/page.tsx`) : listes ET agrégats d'items.
- Détail de liste / to-do (`(app)/lists/[listId]/page.tsx`) : items, tâches.
- Bibliothèque (`(app)/library/page.tsx`) : produits + comptages de références.
- Recettes (`(app)/recipes/page.tsx` + fiche) : liste et fiche.
- Planning : recettes proposables, tâches à échéance affichées sur la grille.
- Génération de la liste de la semaine : liste cible, lignes existantes pour la fusion, retrait ciblé §8.6 (une ligne déjà soft-deleted n'est jamais proposée au retrait).
- **Contexte serveur du Cerveau** (`/api/brain-command`, consultation, propositions) : listes, produits, recettes, planning relus sous RLS — une entité supprimée ne doit plus être proposée ni résolue par l'IA.
- Écran Profil : comptages produits/rayon.

**Deux jointures ne filtrent PAS :**
- `list_items → library_items` (le nom affiché d'un article de liste doit survivre au soft-delete du produit biblio) ;
- `meal_slots → recipes` (une case du planning garde son titre si la recette est supprimée ; le tap affiche « Cette recette a été supprimée » — pas de 404 brut. Si la recette est restaurée, tout redevient normal).

### 4.4 Résurrection anti-doublon (règle stricte)

- `addItem` (find-or-create `library_items` par nom, ilike) : si le seul match est soft-deleted → `deleted_at = NULL` + poursuite normale. Jamais deux produits actifs de même nom.
- Anti-doublon non-coché de `list_items` : si la ligne équivalente existe soft-deleted dans la même liste → résurrection plutôt qu'insertion.
- Même logique pour toute autre création par nom que tu rencontres (génération de semaine incluse).

### 4.5 Le toast

- Après chaque suppression réussie : toast « Supprimé · **ANNULER** » ~6 s, même langage visuel que le toast ANNULER du Cerveau (`brain-listening.tsx`) — encart papier bordé, pas de nouveau style. **Extrais un composant partagé** (ex. `shared/undo-toast.tsx`) plutôt que de dupliquer.
- ANNULER → Server Action de restauration (`deleted_at = NULL`, filtrée `couple_id`/`id`) + `revalidatePath` + le toast se ferme. La restauration d'une liste restaure ses items d'un coup (rien d'autre à faire, cf. §4.2).
- Le toast est **local** : celui qui supprime voit ANNULER ; l'autre voit la disparition en temps réel (comportement actuel).
- Une seule suppression « annulable » à la fois suffit (la nouvelle remplace l'ancien toast).
- A11y : `role="status"` + `aria-live`, bouton ≥ 44 px, `prefers-reduced-motion` respecté.

---

## 5. Pilier B — Pédagogie de la bibliothèque

Constat de l'audit : le modèle « bibliothèque + pastilles de fréquence + rayons » n'est expliqué nulle part (Nielsen « aide & documentation » : 2/10).

- **Un encart papier dismissible** en tête de `/library`, affiché tant qu'il n'a pas été fermé (clé localStorage `library-coach-seen`, pattern identique à `brain-coach-seen` dans `brain-button.tsx`, y compris le `setTimeout` différé pour la règle lint).
- Contenu (3 lignes courtes, ton de l'app, tutoiement) :
  1. « Ta bibliothèque se remplit toute seule : chaque article ajouté à une liste finit ici. »
  2. « Les pastilles ▪▪▪ = la fréquence d'achat. Plus il y en a, plus vous le prenez souvent. »
  3. « Un tap sur un produit → tu l'envoies dans une liste. Les rayons se gèrent dans le Profil. »
- Bouton de fermeture explicite (croix ≥ 44 px + `aria-label`). Jamais réaffiché après fermeture. Pas de séquence de bulles, pas de spotlight, pas de modale.
- Style : `RisoCard` sauge claire ou bordure encrée — cohérent avec les états vides pédagogues existants.

---

## 6. Finitions

### 6.1 Sondage IndexedDB conditionné
`offline-indicator.tsx:46-58` : le `setInterval(tick, 2000)` tourne en permanence, même en ligne avec une file vide (le commentaire prétend le contraire). Conditionner : l'intervalle ne tourne que si `!online || pending > 0 || sync.phase !== "idle"` ; sinon un `tick` ponctuel suffit.

### 6.2 Hiérarchie de titres
Plus de saut h1 → h3/h4 : `category-header.tsx:30` (`h4` → `h2`), `DonePanel.tsx:77` (`h4` → `h2`), et vérifie les tuiles du hub (si `h3` sous un `h1`, passe-les `h2`). Aucun changement visuel (les classes portent le style, pas la balise).

### 6.3 Placeholders restants
Reliquat de la normalisation : `brain-listening.tsx:772`, `VoiceAddTask.tsx:251`, `TaskReviewSheet.tsx:199`, `list-detail-client.tsx:628` encore en `placeholder:text-ink-soft/60` → `placeholder:text-ink-soft` plein (contraste AA), comme partout ailleurs.

### 6.4 Bouton « Réessayer » sur l'erreur de synchro
L'`OfflineIndicator` en phase erreur affiche le problème sans action possible. Ajouter un bouton « Réessayer » qui relance le `flush()` manuellement. Cible tap ≥ 44 px, libellé texte (pas d'icône seule).

### 6.5 Échange de couleurs (Profil)
Aujourd'hui, chaque membre ayant une couleur et l'autre étant bloquée (`profile/actions.ts:56-92`), personne ne peut plus jamais changer. Ajouter dans le Profil une action « Échanger nos couleurs » : RPC SQL atomique qui swappe `profiles.color` des deux membres du couple en une transaction (filtrée `couple_id`), avec confirmation avant exécution (« Sonia devient sauge, tu deviens brique — ok ? »). `profiles` n'est pas dans la publication Realtime : l'autre verra le changement à sa prochaine navigation, c'est accepté.

---

## 7. Ménage (code mort en prod)

- Supprimer `src/app/design-test/` (route publique de test livrée en prod).
- Supprimer `src/components/shared/bottom-nav.tsx` (plus utilisé que par design-test depuis la V4).
- Supprimer `src/components/ui/button.tsx` (importé nulle part, variantes `dark:` hors design system, `h-8` < 44 px).
- Avant chaque suppression : `grep` des imports pour prouver qu'ils sont morts. Après : `tsc` + `eslint` + `next build` verts.

---

## 8. Hors-périmètre V4.1 (→ V5 ou plus tard)

- **Offline V2** (service worker de navigation, ajout optimiste hors-ligne, file multi-écrans, retry/backoff).
- **Notifications push** (rappels d'échéance, activité du partenaire, rappel planning).
- **Corbeille partagée / undo visible par l'autre** (le journal du Cerveau reste réservé aux commandes vocales + IA, décision V4 §7).
- Suggestions d'habitudes (« le lait n'est pas sur la liste »), semaine type / duplication de planning, mode cuisine mains libres, raccourcis manifest.
- Tests e2e Playwright (infra dédiée) — la V4.1 se contente de tests unitaires sur la logique nouvelle (§9 Phase 2).
- Purge automatique des lignes soft-deleted.

---

## 9. Phases de construction

### Phase 1 — Ménage
Point de départ propre (WIP `brain-button.tsx` tranché par Baptiste), puis suppression de `/design-test`, `bottom-nav.tsx`, `button.tsx`.

**Critères d'acceptation :**
- [ ] `git status` propre avant de commencer.
- [ ] Les 3 cibles supprimées ; `grep` prouve zéro import restant.
- [ ] `tsc` + `eslint` + `next build` verts ; navigation complète de l'app inchangée.

### Phase 2 — Soft-delete (fondation serveur)
Migration `deleted_at` (5 tables), bascule des 5 Server Actions de suppression en UPDATE, filtres `deleted_at IS NULL` sur TOUTES les lectures (§4.3), résurrection anti-doublon (§4.4), actions de restauration. Tests vitest sur la résurrection et la restauration.

**Critères d'acceptation :**
- [ ] Plus aucun `DELETE` SQL déclenchable depuis l'UI sur les 5 tables (les catégories gardent leur flux actuel).
- [ ] Toute suppression est invisible à l'écran ET dans le contexte du Cerveau (consultation, routeur, propositions).
- [ ] Ajouter un article du même nom qu'un supprimé le ressuscite — jamais de doublon actif.
- [ ] Supprimer puis restaurer une liste rend ses items intacts.
- [ ] Une case planning référençant une recette supprimée affiche son titre + message dédié, pas de 404.
- [ ] Le retrait ciblé §8.6 ne propose jamais une ligne déjà supprimée.
- [ ] Chaque UPDATE de soft-delete/restauration est filtré `couple_id`/`id` (garde-fou §0.5).

### Phase 3 — Toast ANNULER
Composant partagé `UndoToast`, branché sur les 5 suppressions, restauration en un tap.

**Critères d'acceptation :**
- [ ] Chaque suppression affiche « Supprimé · ANNULER » ~6 s ; ANNULER restaure et l'écran se met à jour.
- [ ] La restauration est visible par l'autre en temps réel (Realtime UPDATE existant).
- [ ] Même langage visuel que le toast du Cerveau ; `role="status"`, tap ≥ 44 px, `prefers-reduced-motion` OK.

### Phase 4 — Pédagogie bibliothèque
Encart dismissible §5.

**Critères d'acceptation :**
- [ ] Affiché à la première visite de `/library`, fermable, jamais réaffiché (localStorage).
- [ ] Explique remplissage auto + pastilles de fréquence + envoi vers liste + rayons dans Profil.
- [ ] Aucun autre changement sur l'écran bibliothèque.

### Phase 5 — Finitions
§6.1 à §6.5.

**Critères d'acceptation :**
- [ ] En ligne et file vide : plus aucun `setInterval` actif dans l'`OfflineIndicator`.
- [ ] Plus de saut de niveau de titre sur listes/biblio ; rendu visuel inchangé.
- [ ] Plus aucun placeholder sous AA (zéro `/60` restant).
- [ ] Erreur de synchro → bouton « Réessayer » fonctionnel.
- [ ] « Échanger nos couleurs » swappe atomiquement après confirmation ; marqueurs « ajouté par » cohérents après échange.

---

## 10. Critères d'acceptation globaux (toutes phases)

- Aucun outil existant réorganisé, renommé ou déplacé ; aucun écran modifié hors périmètre listé.
- Jamais de DELETE/UPDATE sans filtre `couple_id`/`id`.
- `tsc` + `eslint` + `next build` verts à la fin de chaque phase.
- WCAG 2.1 AA maintenu (contrastes, tap ≥ 44 px, `prefers-reduced-motion`).
- Temps réel intact sur tous les écrans (le soft-delete passe par les events UPDATE existants).
- Le vocal et les propositions IA ne voient jamais une entité supprimée.
