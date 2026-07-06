# Prompts Claude Code — Build V4.1 (« Consolidation »)

> **Source de vérité :** [`PRD_V4.1_consolidation.md`](./PRD_V4.1_consolidation.md). Chaque prompt renvoie aux sections (§) du PRD — Claude Code doit **les relire** avant de coder, pas se contenter du résumé ici.

## Mode d'emploi

- **Un prompt = un message.** Colle-les **un par un**, dans l'ordre. Ne lance pas le suivant tant que le précédent n'est pas fonctionnel et validé.
- **Avant CHAQUE prompt**, Claude Code doit : (1) inspecter le code existant cité, (2) **expliquer en français ce qu'il va faire, étape par étape, AVANT d'appliquer**, (3) ne rien réorganiser des outils existants (§0.2).
- Prompt 1 = Phase 1 (ménage). 2→3 = Phase 2 (soft-delete). 4 = Phase 3 (toast ANNULER). 5 = Phase 4 (pédagogie biblio). 6 = Phase 5 (finitions).
- **Garde-fous transverses à rappeler dans chaque prompt à conséquence** : jamais de DELETE/UPDATE sans filtre `couple_id`/`id` ; le soft-delete est un UPDATE soumis à la même règle ; migrations via `supabase migration new` → `db push` ; `tsc` + `eslint` + `next build` verts en fin de phase.

⚠️ **Avant le prompt 1 (à faire toi-même, Baptiste)** : tranche la modif non commitée de `src/components/shared/brain-button.tsx` (coche du jeton actif retirée) — commit si tu la veux, `git restore src/components/shared/brain-button.tsx` sinon.

---

## PHASE 1 — Ménage

### Prompt 1 — Suppression du code mort en prod

```
Contexte : PRD V4.1 §7 (ménage) + §9 Phase 1. Relis-les. Vérifie d'abord que `git status` est propre — si ce n'est pas le cas, arrête-toi et dis-le-moi.

Avant de coder : prouve par grep que chaque cible est bien morte (aucun import ailleurs que dans les cibles elles-mêmes). Explique-moi ce que tu vas supprimer avant d'appliquer.

À livrer :
- Suppression de src/app/design-test/ (route publique de test livrée en prod).
- Suppression de src/components/shared/bottom-nav.tsx (plus utilisé que par design-test depuis la V4).
- Suppression de src/components/ui/button.tsx (importé nulle part, hors design system).
- Vérifie qu'aucune référence ne traîne (imports, proxy/redirections, liens).

Critères (§9 Phase 1) : zéro import restant prouvé par grep, tsc + eslint + next build verts, navigation de l'app inchangée. Commit à la fin de la phase.
```

---

## PHASE 2 — Soft-delete (fondation serveur)

### Prompt 2 — Migration `deleted_at` + bascule des suppressions

```
Contexte : PRD V4.1 §3 (décisions 1 à 5), §4.1 (modèle de données), §4.2 (règles par entité). Relis-les. C'est la fondation de la V4.1.

Avant de coder : inspecte les 5 Server Actions de suppression (deleteList (app)/lists/actions.ts:135, deleteItem (app)/lists/[listId]/actions.ts:283, deleteTask (app)/lists/[listId]/task-actions.ts:244, deleteLibraryItem (app)/library/actions.ts:423, deleteRecipe (app)/recipes/actions.ts:345) et la migration Realtime 20260604210000 (les UPDATE sont déjà diffusés, rien à faire côté hooks). ⚠️ Garde-fou : jamais de DELETE/UPDATE sans filtre couple_id/id — le soft-delete est un UPDATE soumis à la même règle. Migration via supabase migration new → db push. Explique ta stratégie avant d'appliquer.

À livrer :
- Migration : colonne deleted_at timestamptz NULL sur lists, list_items, tasks, library_items, recipes. RLS inchangée. Pas d'index partiel sauf besoin démontré. Types Supabase régénérés.
- Bascule des 5 suppressions en UPDATE deleted_at (§4.2) :
  - deleteList ne touche PLUS aux list_items (masqués avec leur liste, restaurés avec elle) ;
  - deleteLibraryItem GARDE sa garde « Encore présent dans N listes » telle quelle, seul le DELETE final change ;
  - deleteRecipe ne touche plus aux recipe_ingredients ;
  - les catégories sont HORS périmètre (flux de remplacement conservé).
- Server Actions de restauration (deleted_at = NULL, filtrées couple_id/id, revalidatePath) pour les 5 entités — l'UI arrive au prompt 4.
- Tests vitest sur la logique nouvelle (restauration d'une liste = items intacts, garde biblio conservée).

Ce prompt ne touche PAS encore aux lectures (prompt 3) : l'app peut transitoirement afficher des lignes soft-deleted, c'est attendu. Ne t'arrête pas en milieu de phase pour ça.
```

### Prompt 3 — Filtres de lecture + résurrection anti-doublon

```
Contexte : PRD V4.1 §4.3 (checklist exhaustive des lectures) + §4.4 (résurrection anti-doublon). Relis-les. Termine la Phase 2.

Avant de coder : fais l'inventaire RÉEL de toutes les lectures des 5 tables (pages serveur, Server Actions, contexte du Cerveau /api/brain-command, consultation, génération de la liste de la semaine, retrait ciblé §8.6 V4). Liste-les-moi avant d'appliquer.

À livrer :
- deleted_at IS NULL sur toutes les lectures de la checklist §4.3 : hub listes, détail liste/to-do, bibliothèque (+ comptages), recettes (liste + fiche), planning (recettes proposables, tâches affichées), génération de semaine (liste cible, lignes de fusion), retrait ciblé (jamais une ligne déjà supprimée), contexte serveur du Cerveau (une entité supprimée n'est plus proposée ni résolue par l'IA), comptages du Profil.
- DEUX jointures ne filtrent PAS (§4.3) : list_items → library_items (le nom d'un article de liste survit au soft-delete du produit) et meal_slots → recipes (la case planning garde son titre ; tap → message « Cette recette a été supprimée », pas de 404 brut).
- Résurrection anti-doublon (§4.4) : le find-or-create de library_items (ilike) et l'anti-doublon non-coché de list_items ressuscitent une ligne soft-deleted au lieu de créer un doublon. Même logique dans la génération de semaine si elle crée par nom.
- Tests vitest : résurrection (jamais deux produits actifs de même nom), retrait ciblé ignore les lignes supprimées.

Critères (§9 Phase 2) : suppression invisible partout (écrans + IA) ; ajouter un article du même nom qu'un supprimé le ressuscite ; supprimer puis restaurer une liste rend ses items intacts ; case planning à recette supprimée = titre + message dédié ; chaque UPDATE filtré couple_id/id. tsc + eslint + next build verts.
```

---

## PHASE 3 — Le toast ANNULER

### Prompt 4 — Toast « Supprimé · ANNULER » partagé

```
Contexte : PRD V4.1 §4.5 (le toast) + §3 décision 3. Relis-les. S'appuie sur les actions de restauration du prompt 2.

Avant de coder : inspecte le toast ANNULER du Cerveau dans src/components/brain/brain-listening.tsx (langage visuel à réutiliser, pas à réinventer) et les 5 points d'UI où l'on supprime (détail liste, to-do, hub listes, bibliothèque, fiche recette). Explique ta stratégie avant d'appliquer.

À livrer :
- Composant partagé (ex. src/components/shared/undo-toast.tsx) extrait du langage visuel existant : encart papier bordé, « Supprimé · ANNULER », ~6 s, role="status" + aria-live, bouton ≥ 44 px, prefers-reduced-motion respecté.
- Branché sur les 5 suppressions. ANNULER → Server Action de restauration + revalidatePath + fermeture du toast. Une nouvelle suppression remplace le toast précédent.
- Le toast est local à celui qui supprime ; l'autre voit disparition/réapparition en temps réel (Realtime UPDATE existant — vérifie, n'ajoute rien).
- Après expiration du toast : plus de restauration possible depuis l'UI (la ligne reste soft-deleted en base, décision §3.3).

Critères (§9 Phase 3) : chaque suppression → toast ~6 s ; ANNULER restaure et l'écran se met à jour ; restauration visible par l'autre en temps réel ; a11y OK. tsc + eslint + next build verts.
```

---

## PHASE 4 — Pédagogie de la bibliothèque

### Prompt 5 — Encart « première visite » de la biblio

```
Contexte : PRD V4.1 §5 (contenu exact des 3 lignes, style, a11y) + §3 décision 7. Relis-les.

Avant de coder : inspecte le pattern coach mark existant dans src/components/shared/brain-button.tsx (clé localStorage brain-coach-seen, setState différé par setTimeout pour la règle lint set-state-in-effect) et l'écran /library (library-client.tsx). ⚠️ Aucun autre changement sur l'écran bibliothèque. Explique ta stratégie avant d'appliquer.

À livrer :
- Encart papier dismissible en tête de /library, clé localStorage library-coach-seen, même mécanique que le coach mark du Cerveau. Jamais de modale, jamais de séquence de bulles.
- Contenu = les 3 lignes du §5 (remplissage automatique, pastilles de fréquence, envoi vers liste + rayons dans Profil), ton de l'app, tutoiement.
- Croix de fermeture ≥ 44 px avec aria-label ; jamais réaffiché après fermeture.
- Style RisoCard cohérent avec les états vides pédagogues existants (pas de nouveau style).

Critères (§9 Phase 4) : affiché à la 1re visite, fermable, jamais réaffiché ; explique le modèle complet ; zéro autre changement sur l'écran. tsc + eslint + next build verts.
```

---

## PHASE 5 — Finitions

### Prompt 6 — Les 5 finitions de l'audit

```
Contexte : PRD V4.1 §6.1 à §6.5. Relis-les. Cinq petits chantiers indépendants — traite-les UN PAR UN, dans l'ordre, avec vérification entre chaque.

Avant de coder : inspecte offline-indicator.tsx:46-58 (l'intervalle), category-header.tsx:30 + DonePanel.tsx:77 (les h4), les 4 placeholders /60 restants (brain-listening.tsx:772, VoiceAddTask.tsx:251, TaskReviewSheet.tsx:199, list-detail-client.tsx:628), et profile/actions.ts:56-92 (le blocage de couleur). Explique ta stratégie avant d'appliquer.

À livrer :
1. OfflineIndicator : le setInterval(2000) ne tourne que si !online || pending > 0 || sync.phase !== "idle" ; sinon un tick ponctuel. En ligne + file vide = zéro intervalle actif.
2. Hiérarchie de titres : category-header.tsx h4 → h2, DonePanel h4 → h2, tuiles du hub h3 → h2 si saut constaté. Rendu visuel strictement inchangé (les classes portent le style).
3. Les 4 placeholders /60 → placeholder:text-ink-soft plein (AA).
4. OfflineIndicator en phase erreur : bouton « Réessayer » (libellé texte, ≥ 44 px) qui relance flush().
5. Profil : action « Échanger nos couleurs » — RPC SQL atomique (migration via migration new → db push) qui swappe profiles.color des DEUX membres en une transaction filtrée couple_id, confirmation explicite avant exécution (« Sonia devient sauge, tu deviens brique — ok ? »). profiles n'est pas dans la publication Realtime : l'autre verra au prochain chargement, c'est accepté (§6.5).

Critères (§9 Phase 5) : plus d'intervalle en ligne/file vide ; plus de saut h1→h3/h4 ; zéro placeholder sous AA ; « Réessayer » fonctionnel ; échange de couleurs atomique + marqueurs « ajouté par » cohérents après échange. tsc + eslint + next build verts.
```

---

## Après la V4.1 — vérification globale

Une fois les 6 prompts passés, fais relire les **critères d'acceptation globaux (§10)** un par un :
aucun outil réorganisé · jamais de DELETE/UPDATE sans filtre `couple_id`/`id` · le vocal et l'IA ne voient jamais une entité supprimée · toast ANNULER partout où l'on supprime · temps réel intact · WCAG AA + `prefers-reduced-motion` · `tsc` + `eslint` + `next build` verts.

Puis relance `/impeccable audit` + `/impeccable critique` (cf. fin de `PLAN-TRAVAIL-audit-critique.md`) pour mesurer la progression des scores.
