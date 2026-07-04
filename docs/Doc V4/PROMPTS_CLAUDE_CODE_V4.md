# Prompts Claude Code — Build V4 (« Le Cerveau » + Planning)

> **Source de vérité :** [`PRD_V4_cerveau_planning.md`](./PRD_V4_cerveau_planning.md). Chaque prompt renvoie aux sections (§) du PRD — Claude Code doit **les relire** avant de coder, pas se contenter du résumé ici.

## Mode d'emploi

- **Un prompt = un message.** Colle-les **un par un**, dans l'ordre. Ne lance pas le suivant tant que le précédent n'est pas fonctionnel et validé (règle §0.4 du PRD).
- **Avant CHAQUE prompt**, Claude Code doit : (1) inspecter le code existant cité, (2) **expliquer en français ce qu'il va faire, étape par étape, AVANT d'appliquer** (règle §0.3), (3) ne rien réorganiser des outils existants (règle §0.2).
- Les prompts 1→3 = Phase 1 (nav). 4→6 = Phase 2 (routeur vocal). 7 = Phase 3 (journal). 8→9 = Phase 4 (planning). 10→11 = Phase 5 (liste semaine). 12→13 = Phase 6 (IA partout).
- Les prompts 8→9 (Planning) sont **indépendants** des prompts 4→7 (vocal) : ils peuvent être menés en parallèle si besoin (§0.4).
- **Garde-fous transverses à rappeler dans chaque commande à conséquence** : jamais de DELETE/UPDATE sans filtre `couple_id`/`id` ; `ANTHROPIC_API_KEY` uniquement serveur ; l'IA structure, le serveur exécute et valide les ids ; aucune fusion silencieuse ; `prefers-reduced-motion` respecté.

---

## PHASE 1 — La navigation Cerveau (sans vocal)

### Prompt 1 — Le logo cerveau animé (bouton flottant, état Repos)

```
Contexte : PRD V4 §4.1 et §4.2 (relis-les). On démarre la Phase 1. On NE touche à aucun outil existant (§0.2).

Avant de coder : inspecte public/icons/logo-source.png, src/app/globals.css (tokens riso : paper-light, ink, brique, sauge, ombres riso), et le layout src/app/(app)/layout.tsx. Explique-moi ta stratégie en français avant d'appliquer.

À livrer :
- Un composant BrainButton : bouton circulaire ~72px, fond paper-light, bordure 2.5px ink, ombre riso-ink décalée nette, flottant en bas au centre, au-dessus du contenu (mais SANS encore retirer la BottomNav — on la garde le temps de la Phase 1, prompt 3).
- Le logo reproduit FIDÈLEMENT (test d'acceptation : superposition quasi parfaite avec le PNG), avec deux hémisphères animables séparément. Choisis (a) vectorisation SVG fidèle (potrace) OU (b) PNG découpé gauche/droite en clip CSS — celui qui rend le mieux. Sauge = moitié gauche (Baptiste), brique = moitié droite (Sonia).
- État « Repos » : respiration douce, légère alternance des hémisphères. Rien d'autre pour l'instant (les autres états viennent plus tard).
- prefers-reduced-motion : aucune animation, le logo reste net et lisible.

Critères : logo fidèle au PNG, chaque hémisphère animable séparément, zone tap ≥ 44px, contraste AA. Ne branche encore aucune navigation.
```

### Prompt 2 — L'éventail : éclatement de jetons

```
Contexte : PRD V4 §4.3 (éclatement de jetons) + §2 décision 1 (les 5 destinations et leurs icônes) + §4.2 (état Éventail). Relis-les. Suite du prompt 1.

Avant de coder : inspecte src/components/shared/bottom-nav.tsx pour reprendre EXACTEMENT les mêmes routes et icônes lucide (ListChecks /lists, ShoppingCart /library, ChefHat /recipes, Calendar /planning [nouveau, cible placeholder pour l'instant], User /profile). Explique-moi ta stratégie avant d'appliquer.

À livrer :
- Tap court sur le cerveau → ouverture d'un éventail de 5 jetons ronds icône seule qui FUSENT EN ÉTOILE depuis le centre du cerveau et se répartissent sur un demi-cercle au-dessus (≈ toutes les 30° sur 180°, rayon ≈ 2× le diamètre du cerveau). Ordre : Listes (gauche), Biblio, Recettes (sommet), Planning, Profil (droite).
- Jetons : cercles ~64px, fond paper-light, bordure 2px ink, ombres riso alternées brique/sauge, icône centrale 26px stroke 2.5, jetons DROITS (désaxage ±4° toléré), aucun recouvrement. Aucun libellé texte ; aria-label sur chaque jeton.
- Déploiement ressort < 300ms avec stagger (easing à léger dépassement, ex. cubic-bezier(.34,1.5,.5,1)). Repli = trajectoire inverse, stagger inversé.
- Voile encre ~30% derrière les jetons pendant l'ouverture.
- Fermeture : re-tap sur le cerveau, tap sur le voile, ou sélection d'un jeton (qui navigue vers la route).
- L'outil courant est marqué sur son jeton (ombre réduite « enfoncée » + coche).
- prefers-reduced-motion : pas d'animation de vol, les jetons apparaissent/disparaissent simplement.

Critères (§12 Phase 1) : éclatement < 300ms, jetons ronds en étoile sans recouvrement, mêmes routes/icônes qu'aujourd'hui + jeton Planning, aucun libellé, aria-label présents.
```

### Prompt 3 — Suppression de la barre d'onglets + tuile fantôme + coach mark

```
Contexte : PRD V4 §4.6 (tuile fantôme), §4.7 (migration nav), §4.3 (dernier outil utilisé, coach mark). Relis-les. Termine la Phase 1.

Avant de coder : inspecte bottom-nav.tsx, le layout (app), et les FAB « + » actuels du hub listes et de la grille recettes, ainsi que le Sheet « Nouvelle liste » et le flux d'ajout de recette. ⚠️ Ne modifie AUCUNE tuile ni widget existant d'un pixel (§4.6 règle stricte). Explique ta stratégie avant d'appliquer.

À livrer :
- Retire la BottomNav : le cerveau devient l'unique moyen de navigation. Vérifie que TOUTES les destinations restent atteignables (y compris sous-pages), retours navigateur et redirections auth intacts.
- Supprime les FAB « + » (bas-droite listes et recettes). Aucun bouton docké à côté du cerveau.
- Ajoute une tuile fantôme SOUS les tuiles existantes : bordure 2px pointillée ink-soft, fond transparent, « + » centré (icône seule + aria-label). Hub listes → ouvre le Sheet « Nouvelle liste » existant. Recettes → ouvre le flux d'ajout existant. Comportement d'ouverture identique à aujourd'hui. Biblio/Profil : pas de tuile (pas de FAB aujourd'hui).
- Ouverture de l'app sur le DERNIER outil utilisé (persisté localement) ; Listes par défaut au 1er lancement.
- Coach mark unique au 1er lancement post-V4 : « tap = outils, appui long = parler ». Jamais réaffiché ensuite.

Critères (§12 Phase 1) : plus aucun FAB ni barre d'onglets, tuile fantôme fonctionnelle, tuiles/widgets existants inchangés au pixel, app ouvre sur le dernier outil, prefers-reduced-motion OK, tap ≥ 44px, AA.
```

---

## PHASE 2 — Le routeur d'intentions + actions Courses / Biblio / Tâches

### Prompt 4 — Le routeur serveur `/api/brain-command` (fondation, sans UI)

```
Contexte : PRD V4 §5 (LA FONDATION), §3 (modèle Haiku 4.5, sécurité), §6 (niveaux de confirmation). C'est la brique fondatrice de tout le vocal (§0.6). Relis §5 en entier.

Avant de coder : inspecte à fond /api/parse-task et src/lib/tasks/voice-parsing.ts (parseTaskCommand, jourCourantDansFuseau), la fonction normaliserNom() (V3), et les conventions RLS/couple des routes existantes. La V4 GÉNÉRALISE ce pattern, elle n'en invente pas. Explique ta stratégie avant d'appliquer.

À livrer (route seule, testable sans front) :
- Route serveur /api/brain-command : auth + rattachement couple, relit TOUJOURS le contexte côté serveur sous RLS (listes courses+to-do, 2 profils, articles bibliothèque, recettes id+titre, planning semaine courante). Le client ne transmet que contexte_ecran (route + éventuel id) pour les défauts d'ambiguïté — jamais pour contourner la RLS.
- Prompt système Haiku 4.5 = catalogue d'intentions §5.2 (pour ce prompt : uniquement les intents de Phase 2 → courses.*, bibliotheque.ajouter_article, taches.ajouter/cocher, navigation.ouvrir, inconnu) + contexte relu + date du jour Europe/Paris.
- Sortie JSON stricte conforme §5.3 (actions[] ordonné + clarification), validée défensivement (§5.4) : ids vérifiés contre le contexte serveur, valeurs hors catalogue → 422 « Reformule ta phrase ». Aucun id halluciné accepté.
- Règles §5.4 : multi-intentions (max ~5), noms d'articles repassés par normaliserNom() côté serveur, résolution d'ambiguïté de liste dans l'ordre (nommée → écran → seule du bon type → clarification), jamais de défaut pour une action à conséquence, dates relatives résolues Europe/Paris.
- AUCUN intent de suppression (§5.2) : si demandé, réponse « Pour supprimer, passe par l'écran ».
- Garde-fous : TEXTE_MAX 1000, parsing défensif, erreurs typées sans fuite de clé, ANTHROPIC_API_KEY jamais NEXT_PUBLIC_.

Ce prompt ne fait PAS l'UI ni l'exécution en base : il renvoie le JSON validé + les ids résolus. Écris quelques tests (façon voice-parsing.test.ts) sur le parsing/validation.
```

### Prompt 5 — UI d'écoute + confirmation niveau 1 (courses / biblio)

```
Contexte : PRD V4 §5.5 (UI d'écoute), §4.2 (états Écoute/Réflexion/Succès), §6 niveau 1, §4.4 (langage d'imprimerie). Relis-les. S'appuie sur la route du prompt 4.

Avant de coder : inspecte la dictée native V2.1 (Web Speech API) telle qu'utilisée aujourd'hui, et les tokens d'animation riso. Explique ta stratégie avant d'appliquer.

À livrer (chemin le plus simple d'abord — une seule action de niveau 1) :
- Appui long (~400ms) sur le cerveau → état Écoute : panneau « JE T'ÉCOUTE… » (encart papier bordé, barres d'encre animées, transcription en direct via dictée native).
- Relâchement / « Terminé » → état Réflexion (oscillations) → appel /api/brain-command → exécution serveur de l'action.
- Confirmation niveau 1 (§6) pour courses.ajouter/cocher/décocher et bibliotheque.ajouter : exécution immédiate → tampon « C'EST NOTÉ ! » qui claque (~450ms) + toast récapitulatif avec ANNULER (~6s).
- Article ajouté par la voix : la ligne « s'imprime » dans la liste (fond sauge qui s'estompe).
- Transparence des fusions (§6, règle V3) : si fusion de quantités, l'afficher (« tomate : 200 + 300 = 500 g »). Jamais silencieux.
- Toute action vocale a un équivalent tactile (§4.5) — ne casse aucun chemin tactile existant.
- prefers-reduced-motion : états compréhensibles sans animation (texte + couleurs suffisent).

Critères : « Ajoute le lait et le beurre à la liste Auchan » ajoute 2 articles fusionnés via normaliserNom(), tampon + ANNULER fonctionnel. Latence commande → tampon < 3s.
```

### Prompt 6 — Multi-intentions, ambiguïté, tâches V2.1 migrées, hors-ligne

```
Contexte : PRD V4 §6 (lot multi-intentions + niveau 2), §5.4 (ambiguïté), §5.2 (taches.ajouter = niveau 2, écran V2.1 conservé), §5.5 (hors-ligne). Relis-les. Complète la Phase 2.

Avant de coder : inspecte l'écran de validation de tâche V2.1 (celui qui s'ouvre pour l'ajout vocal de tâche structurée) — il doit être RÉUTILISÉ tel quel, pas réécrit. Vérifie que l'ajout vocal V2.1 existant fonctionne toujours jusqu'à cette absorption (§0.5). Explique ta stratégie avant d'appliquer.

À livrer :
- Résolution d'ambiguïté de liste → panneau clarification à choix (§5.3) : tap sur une option [Auchan] [Carrefour] ou redire le nom. Jamais de choix silencieux arbitraire.
- Multi-intentions : une phrase → plusieurs actions. Si une seule action niveau 1 → tampon direct (prompt 5). Si plusieurs actions OU au moins une de niveau ≥ 2 → écran récapitulatif UNIQUE listant tout, chaque ligne désactivable, exécution après validation globale.
- taches.ajouter (niveau 2) : router vers l'écran de validation V2.1 EXISTANT, pré-rempli. taches.cocher (niveau 1) : tampon direct.
- Migration : l'ancien point d'entrée d'ajout vocal de tâche passe désormais par /api/brain-command, sans régression de comportement.
- Dégradation hors-ligne (§5.5) : appui long → bouton grisé + « Le cerveau a besoin de réseau pour t'écouter ». Aucune erreur brute. Le reste de l'app reste utilisable.

Critères (§12 Phase 2) : phrase multi-intentions → récap unique, chaque action désactivable ; ambiguïté → question à choix ; « Ajoute plein d'essence pour après-demain, chaque semaine » → écran V2.1 pré-rempli ; aucune suppression vocale ; hors-ligne propre.
```

---

## PHASE 3 — Le journal du Cerveau

### Prompt 7 — Journal « ticket de caisse » + annulation par ligne

```
Contexte : PRD V4 §7 (journal) + §9 (table brain_commands, besoins) + §6 (annulation journalisée). Relis-les.

Avant de coder : inspecte le schéma Supabase existant (conventions couple_id, RLS, Realtime), l'historique d'achats existant (le journal est À CÔTÉ, pas à sa place), et l'écran Profil. ⚠️ Garde-fou : jamais de DELETE/UPDATE sans filtre couple_id/id. Migration via le workflow habituel (migration new → db push). Explique ta stratégie avant d'appliquer.

À livrer :
- Table journal (brain_commands ou équivalent) selon §9 : couple_id, user_id, created_at, texte_dicte, actions (jsonb affichable), statut (fait|annule), undo_data (jsonb : ids créés, états précédents). RLS couple + Realtime.
- Écriture d'une ligne à CHAQUE commande du Cerveau exécutée (vocal + propositions IA acceptées uniquement — pas les actions tactiles ordinaires).
- Écran ticket de caisse (§7 design : bord perforé, en-têtes Silkscreen/monospace, chaque ligne « s'imprime » par translation verticale) : horodatage, auteur (point sauge/brique), phrase dictée, actions détaillées, statut, bouton ANNULER si encore réversible. Accès depuis le toast (« voir le ticket ») ET depuis Profil (entrée « Journal du Cerveau » à côté de l'historique).
- ANNULER : défait l'action via undo_data (ajout→retrait, coche→décoche, repas placé→case vidée), raye la ligne (trait d'encre), et l'annulation est elle-même journalisée. Une action déjà annulée ou non réversible n'affiche pas ANNULER.
- Realtime : l'annulation et les nouvelles lignes sont visibles par l'autre sans rechargement. Rétention : 100 dernières commandes affichées, pas de purge auto.

Critères (§12 Phase 3) : chaque commande crée une ligne ; ANNULER défait + raye + temps réel ; action annulée/non réversible n'affiche pas ANNULER.
```

---

## PHASE 4 — Le Planning (grille + repas + tâches)

### Prompt 8 — Modèle de données + grille 7 j × 2 créneaux

```
Contexte : PRD V4 §8.1 (grille), §9 (tables meal_slots + provenance, besoins). Relis-les. C'est la route /planning (placeholder posé au prompt 2). Indépendant du vocal (§0.4).

Avant de coder : inspecte le schéma existant (couple_id, RLS, Realtime, patterns de tables listes/tâches) et le design system (tuiles, cases pointillées = « ce qui n'existe pas encore »). ⚠️ Jamais de DELETE/UPDATE sans filtre couple_id/id. Migration via migration new → db push. Explique ta stratégie avant d'appliquer.

À livrer :
- Table repas planifiés (meal_slots ou équivalent) selon §9 : couple_id, date, creneau (dejeuner|diner), type (recette|texte), recipe_id nullable (FK recipes), texte nullable, created_by, created_at ; unicité (couple, date, créneau). RLS couple + Realtime.
- Table de provenance (liaison meal_slot_id ↔ list_item_id, avec marqueur créée-par-génération vs fusionnée) — créée ici, exploitée au prompt 10/11.
- Écran /planning : grille 7 jours (lundi→dimanche) × 2 créneaux (déjeuner/dîner), cases vides autorisées et normales. Ouverture sur la semaine courante, navigation semaine précédente/suivante, jour courant mis en évidence. Chaque case vide est nativement en pointillés (§4.6).
- Realtime : un repas placé par l'un apparaît instantanément chez l'autre.

Critères : grille affichée, navigation entre semaines, cases vides possibles, Realtime opérationnel. (Le contenu des cases arrive au prompt 9.)
```

### Prompt 9 — Contenu des cases : repas (recette / texte libre) + tâches à échéance

```
Contexte : PRD V4 §8.2 (sources d'un repas), §8.3 (tâches dans le planning). Relis-les. Suite du prompt 8.

Avant de coder : inspecte la fiche recette V3 (titre, photo, tags) et le modèle de tâches (échéance, récurrence, prochaine occurrence). Rappel §8.3 : c'est l'ÉCHÉANCE qui place la tâche, jamais un placement manuel. Explique ta stratégie avant d'appliquer.

À livrer :
- Placer un repas sur une case : source « recette de l'app » (référence recipe_id ; tap sur la case → fiche recette) OU « texte libre » (« restes », « pizza surgelée » ; aucun article généré). (La proposition IA de repas viendra en Phase 6.)
- Tâches automatiques : toute tâche dont l'échéance tombe dans la semaine affichée apparaît sur son jour, sous les créneaux repas (récurrentes via leur prochaine occurrence). Cochable sur place (un tap) → style « fait » apaisé. Pas d'édition sur place : tap sur le libellé → ouvre la tâche dans sa to-do list (outil Listes).
- Realtime sur repas et tâches cochées.
- prefers-reduced-motion respecté.

Critères (§12 Phase 4) : placer recette + texte libre sur n'importe quelle case ; tâches à échéance affichées (récurrentes incluses) et cochables sur place ; tap tâche → to-do list, tap repas-recette → fiche recette ; temps réel OK.
```

---

## PHASE 5 — Génération de la liste de la semaine + retrait ciblé

### Prompt 10 — Génération de la liste de courses de la semaine

```
Contexte : PRD V4 §8.5 (génération) + §6 niveau 2 (validation) + règle V3 de fusion. Relis-les. S'appuie sur la table de provenance du prompt 8.

Avant de coder : inspecte la logique V3 d'ajustement des quantités (§8.2 : base × N / nombre_personnes de base) et la fusion normaliserNom() (§6 V3 : addition des unités compatibles, cohabitation des incompatibles, « au goût » sans quantité). Réutilise-les, ne les réécris pas. Explique ta stratégie avant d'appliquer.

À livrer :
- Déclenchement « Générer la liste de la semaine » (tactile ici ; le vocal viendra au prompt 12). Choix de la liste cible (Auchan, Carrefour…) et du nombre de personnes (défaut 2).
- Pour chaque repas-recette de la semaine : quantités ajustées puis fusion via normaliserNom(). Les repas texte libre ne génèrent rien.
- Écran de validation NIVEAU 2 : récapitulatif complet AVANT toute écriture — articles créés, fusions détaillées (« oignon : 1 pièce + 200 g »), repas ignorés. Rien n'est écrit avant validation. Jamais de fusion silencieuse.
- Provenance enregistrée : chaque ligne créée garde le lien vers son/ses repas d'origine (via la table du prompt 8), en marquant créée vs fusionnée — indispensable au prompt 11.

Critères (§12 Phase 5) : récapitulatif complet (créations + fusions) avant écriture ; quantités ajustées au nombre de personnes.
```

### Prompt 11 — Retrait ciblé à la suppression / au remplacement d'un repas

```
Contexte : PRD V4 §8.6 (règle actée du retrait) + §6 niveau 3 (confirmation explicite). Relis-les. S'appuie sur la provenance du prompt 10.

Avant de coder : inspecte la suppression/remplacement d'un repas planifié (prompt 9) et le marquage créée-vs-fusionnée. ⚠️ Garde-fou absolu : jamais de retrait automatique, jamais toucher un article coché. Explique ta stratégie avant d'appliquer.

À livrer :
- À la suppression OU au remplacement d'un repas planifié généré : l'app DEMANDE « X articles venaient de ce repas — les retirer ? » avec la liste détaillée.
- Seules les lignes créées par la génération ET non cochées sont proposées au retrait. Les articles cochés ne sont jamais touchés ni proposés.
- Cas fusion (l'article existait déjà avant, ou sert à un autre repas) : pas proposé au retrait entier ; le récap signale « quantité à ajuster manuellement » avec le détail.
- Remplacement : après retrait éventuel, ajoute ce qui manque pour le nouveau repas (même mécanique que le prompt 10, récapitulatif inclus).
- Confirmation explicite obligatoire (niveau 3). Jamais accessible par la voix seule.

Critères (§12 Phase 5) : supprimer un repas propose le retrait des seules lignes générées non cochées ; cochées jamais proposées ; fusions signalées « à ajuster manuellement » ; aucun retrait sans confirmation explicite.
```

---

## PHASE 6 — L'IA partout (vocal avancé)

### Prompt 12 — Intents vocaux du Planning (placer un repas, générer la liste)

```
Contexte : PRD V4 §5.2 (intents planning.*), §8.7 (commandes vocales planning), §6. Relis-les. Étend le routeur du prompt 4.

Avant de coder : inspecte /api/brain-command (prompt 4) et le contexte relu (il doit déjà inclure le planning de la semaine courante). Explique ta stratégie avant d'appliquer.

À livrer :
- Ajoute au catalogue du routeur : planning.placer_repas (niveau 1), planning.generer_liste (niveau 2). Contexte planning relu côté serveur, ids validés (aucun id halluciné).
- « Mets la ratatouille jeudi soir » → planning.placer_repas : place le repas, tampon « C'EST NOTÉ ! » + ANNULER (case vidée à l'annulation). Résolution recette par titre côté serveur, ambiguïté → clarification.
- « Génère la liste de la semaine dans Auchan » → planning.generer_liste : ouvre l'écran de validation niveau 2 du prompt 10 (liste cible pré-résolue, personnes par défaut 2). Rien d'écrit avant validation.
- Journalisation (prompt 7) de ces commandes.

Critères : « Mets la ratatouille jeudi soir » place le repas (tampon + ANNULER) ; « Génère la liste… » aboutit au récap de fusion sans écriture avant validation.
```

### Prompt 13 — Intents IA : recettes, consultation, proposition de semaine (Opus)

```
Contexte : PRD V4 §5.2 (recettes.*, consultation.lire, planning.proposer_semaine), §8.4 (proposition IA de semaine, Opus 4.8), §3 (modèles). Relis-les. Complète la Phase 6 et la V4.

Avant de coder : inspecte l'écran de relecture V3 des recettes (source='ia') et le mode créatif Recettes V3 (Opus). Ces intents RÉUTILISENT ces écrans. Explique ta stratégie avant d'appliquer.

À livrer :
- consultation.lire (lecture seule) : « Qu'est-ce qu'il reste à acheter chez Auchan ? » → panneau ticket à l'écran (articles non cochés), AUCUNE écriture en base, pas de TTS (§2.4).
- recettes.proposer (niveau 2) : « Propose-moi une recette avec courgettes et feta » → écran de relecture V3, rien d'enregistré avant validation. recettes.ajouter_ingredients (niveau 2) : « Ajoute les ingrédients de la ratatouille à la liste Auchan » → écran de validation avec ajustement personnes + fusion.
- planning.proposer_semaine (niveau 2, Opus 4.8) : « Propose-moi une semaine avec 3 dîners végétariens » → PRIORITÉ aux recettes existantes du couple ; les nouvelles recettes proposées sont marquées « nouvelle recette » et créées via l'écran de relecture V3 si acceptées. Sortie = placement proposé sur la grille, refusable CASE PAR CASE, rien placé avant validation.
- Journalisation (prompt 7) des propositions IA acceptées. Sécurité : tous appels IA serveur, ids validés.

Critères (§12 Phase 6) : les 4 phrases d'exemple du cadrage fonctionnent de bout en bout ; proposition de semaine refusable case par case, rien placé avant validation ; consultation affichée sans écriture.
```

---

## Après la V4 — vérification globale

Une fois les 13 prompts passés, fais relire les **critères d'acceptation globaux (§13)** un par un :
outils existants strictement inchangés · toute action vocale a un équivalent tactile · clé IA serveur uniquement · l'IA ne fait que structurer · aucune suppression sans confirmation · aucune suppression vocale · aucune fusion silencieuse · latence < 3 s · WCAG 2.1 AA + `prefers-reduced-motion` · temps réel partout.
