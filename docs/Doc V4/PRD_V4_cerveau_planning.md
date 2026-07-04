# PRD — « Le Cerveau » : pilotage vocal intégral + Planning de la semaine (V4)

**Application :** PWA mobile-first (Next.js / React + Supabase) de gestion de charge mentale du foyer
**Périmètre :** 2 utilisateurs (Baptiste + Sonia), usage privé
**Auteur fonctionnel :** Baptiste BRAC (session de cadrage du 2 juillet 2026)
**Statut :** brouillon de travail — en cours de relecture par Baptiste

---

## 0. Comment utiliser ce document

**Pour Claude Code :**

1. **Avant de coder quoi que ce soit**, inspecte le code existant : la route `/api/parse-task` et `src/lib/tasks/voice-parsing.ts` (le pattern vocal V2.1 que la V4 généralise), les routes IA Recettes (`/api/recipes/*`), la fonction `normaliserNom()` (V3), la navigation actuelle (`src/components/shared/bottom-nav.tsx`), le schéma Supabase et les conventions RLS. La V4 **réutilise et généralise les patterns existants**, elle n'en invente pas de nouveaux.
2. **RÈGLE ABSOLUE : la V4 ne réorganise PAS les outils existants.** Les Listes restent UN SEUL outil (listes de courses + to-do lists ensemble, hub `/lists` actuel). La Bibliothèque (`/library`, le garde-manger d'articles) reste un outil à part entière avec son icône caddie. Les Recettes et le Profil restent tels quels. Mêmes routes, mêmes libellés, mêmes icônes qu'aujourd'hui. La V4 **ajoute une couche** (navigation cerveau, voix, planning) — elle ne déplace, ne renomme et ne fusionne rien.
3. **Explique tes changements en français avant de les appliquer**, étape par étape. Pas de grosse refonte d'un coup.
4. **Construis dans l'ordre des phases** (§12). Ne commence pas une phase tant que la précédente n'est pas fonctionnelle. Les phases 4–5 (Planning) sont indépendantes des phases 2–3 (vocal) et peuvent être menées en parallèle si besoin.
5. **Ne casse jamais l'existant** : l'ajout vocal de tâches V2.1 doit continuer de fonctionner jusqu'à ce que le routeur d'intentions (§5) l'absorbe en Phase 2.
6. Le **routeur d'intentions (§5)** est la brique fondatrice du pilier vocal : tout le pilotage s'appuie dessus.

**Note pour Baptiste :** donne ce document à Claude Code phase par phase. Commence par §1 à §6 + Phase 1, valide, puis continue.

---

## 1. Contexte & objectif

L'app s'appelle déjà « le cerveau partagé du couple ». La V4 transforme cette métaphore en interface :

- **Pilier A — Le Cerveau** : le logo (deux hémisphères, sauge + brique) devient l'unique bouton de navigation, flottant en bas d'écran. Tap court = éventail des outils **existants** (+ le nouveau Planning). Appui long = écoute vocale. **Toutes les fonctionnalités de l'app deviennent pilotables à la voix**, de manière simple, fluide et intuitive.
- **Pilier B — Le Planning** : la semaine du foyer sur une grille 7 jours × 2 créneaux (déjeuner / dîner) : repas planifiés (recettes, texte libre ou proposition IA), tâches à échéance affichées automatiquement, et génération de la liste de courses de la semaine.

**Anti-objectif explicite :** aucune réorganisation des outils existants. L'utilisateur qui connaît l'app d'aujourd'hui retrouve exactement les mêmes espaces, aux mêmes endroits logiques — seul le moyen d'y accéder change (le cerveau remplace la barre d'onglets).

**Succès =** dire « Ajoute le lait à la liste Auchan » et voir le tampon « C'EST NOTÉ ! » claquer en moins de 3 secondes ; planifier sa semaine en 2 minutes et obtenir la liste de courses fusionnée sans doublon ; que l'autre voie tout en temps réel.

---

## 2. Décisions actées (session du 2 juillet 2026)

Ces décisions sont actées. Ne pas les remettre en cause pendant l'implémentation.

1. **La barre d'onglets disparaît, remplacée par le cerveau flottant** (en bas au centre). Tap court → éclatement de **5 jetons ronds reprenant la navigation actuelle à l'identique + le Planning** (cf. §4.3) :

   | Jeton | Route | Icône (inchangée) | Contenu |
   |---|---|---|---|
   | LISTES | `/lists` | `ListChecks` | le hub actuel : listes de courses **et** to-do lists, ensemble |
   | BIBLIO | `/library` | `ShoppingCart` (caddie) | le garde-manger d'articles, inchangé |
   | RECETTES | `/recipes` | `ChefHat` | inchangé |
   | PLANNING | `/planning` | `Calendar` | **nouveau** (pilier B) |
   | PROFIL | `/profile` | `User` | inchangé |

   Les jetons de l'éventail sont **icône seule** — aucun libellé texte sur l'éventail (les mots « Listes », « Biblio », « Profil », « Planning »… n'y apparaissent jamais), comme la barre actuelle qui masque déjà ses labels (`hideLabel`). Chaque jeton porte un `aria-label` pour l'accessibilité. **Les écrans des outils, eux, ne changent pas d'un pixel** (le hub garde son titre « Listes » actuel, etc.). Appui long → écoute vocale. **Rien d'autre ne change dans l'organisation des outils.**
2. **Pictogramme animé, pas de mascotte.** Le logo existant (`public/icons/logo-source.png`) est reproduit **fidèlement** (vectorisation ou PNG découpé, cf. §4.1) pour animer chaque hémisphère séparément. Pas d'yeux, pas d'expressions figuratives, aucune réinterprétation du logo.
3. **Confirmation graduée** (§6) : action simple = exécution immédiate + tampon + annulation ; action composée = écran de validation ; action destructive = confirmation explicite. **Aucune suppression ne s'exécute vocalement sans confirmation.**
4. **Consultation vocale : réponse à l'écran uniquement.** Pas de synthèse vocale (TTS) en V4.
5. **Journal persistant « ticket de caisse »** (§7) : chaque commande vocale est journalisée, visible par les deux, annulable ligne par ligne.
6. **Planning : grille 7 jours × 2 créneaux** (déjeuner / dîner), cases vides autorisées.
7. **Un repas a trois sources possibles** : recette de l'app, texte libre, proposition IA.
8. **Les tâches à échéance de la semaine apparaissent automatiquement dans le planning**, cochables sur place ; leur édition se fait dans les to-do lists (outil Listes).
9. **Génération de la liste de courses de la semaine** vers une liste cible choisie, pour un nombre de personnes choisi, via la fusion `normaliserNom()` V3. Récapitulatif transparent, jamais de fusion silencieuse.
10. **À la suppression / au remplacement d'un repas planifié, l'app demande** si les articles générés par ce repas doivent être retirés de la liste — uniquement ceux **non cochés**. Jamais de retrait automatique, jamais les articles cochés.
11. **Tous les appels IA côté serveur** (rappel V3, non négociable) : `ANTHROPIC_API_KEY` jamais côté client, jamais `NEXT_PUBLIC_`.
12. **L'IA ne fait que structurer, le serveur exécute.** Aucun identifiant halluciné accepté : tout id renvoyé par l'IA est validé contre le contexte relu côté serveur sous RLS (pattern `parse-task` existant).
13. **Hors-ligne : le vocal se dégrade proprement** (bouton grisé + message clair). L'éventail et la navigation restent fonctionnels hors-ligne.
14. **Le « + » quitte le bas-droite pour la tuile fantôme** : les FAB « + » actuels (hub des listes, recettes) sont supprimés et remplacés par une **tuile fantôme** — une tuile en pointillés avec un « + » centré, **ajoutée en dessous des tuiles existantes** (cf. §4.6). **Aucun bouton à côté du cerveau** (pas de satellite). **Les tuiles et widgets existants ne sont pas modifiés d'un pixel** : la tuile fantôme s'ajoute sous la collection, rien d'autre ne bouge.

---

## 3. Choix des modèles IA & sécurité

| Usage | Modèle | API ID | Pourquoi |
|---|---|---|---|
| Routeur d'intentions vocales (§5) | **Claude Haiku 4.5** | `claude-haiku-4-5` | Rapide (latence < 3 s visée), coût en centimes, suffisant pour du JSON structuré — déjà validé sur `parse-task` V2.1 |
| Proposition de recette / de semaine (§8.4) | **Claude Opus 4.8** | `claude-opus-4-8` | Qualité des suggestions culinaires — déjà en place pour le mode créatif Recettes V3 |

- **Sécurité (NON NÉGOCIABLE, identique V3)** : flux navigateur → route API serveur → IA → navigateur. La clé n'apparaît jamais côté client.
- **Entrée voix** : dictée native du navigateur (Web Speech API), comme V2.1. C'est le navigateur qui fait la reconnaissance vocale ; l'app ne reçoit que du texte. Documenter les différences iOS / Android constatées.
- **Garde-fous existants à conserver** : auth + rattachement couple sur chaque route, `TEXTE_MAX` (1000 caractères), parsing défensif, erreurs API typées sans fuite de secret.
- **Coût attendu** : quelques centimes par commande. Négligeable pour 2 utilisateurs.

---

## 4. Le Cerveau — navigation & langage animé

### 4.1 Le logo devient LE bouton

- **Fidélité absolue au logo existant** (`public/icons/logo-source.png`) : c'est LE logo de l'app, aucune réinterprétation ni redessin à main levée n'est accepté. Deux voies d'implémentation, au choix selon le rendu obtenu :
  - (a) **vectorisation SVG fidèle** (tracé automatique depuis le PNG, ex. potrace), avec un groupe SVG par hémisphère pour les animer séparément ;
  - (b) **fallback garanti fidèle** : le PNG affiché tel quel, découpé en deux moitiés gauche/droite (clip CSS), chaque moitié animée séparément.
  Le test d'acceptation est la **superposition quasi parfaite avec le PNG d'origine**.
- Storytelling assumé : sauge = Baptiste, brique = Sonia (cohérent avec les couleurs d'avatar V1). Le cerveau partagé, c'est visuellement le couple.
- Bouton circulaire ~72 px, fond `paper-light`, bordure `2.5px ink`, ombre `riso-ink` décalée nette, flottant en bas au centre, au-dessus du contenu. Zone tap ≥ 44 px largement respectée.

### 4.2 Les états du cerveau

| État | Déclencheur | Animation (hémisphères) | Habillage |
|---|---|---|---|
| **Repos** | par défaut | respiration douce, légère alternance | — |
| **Éventail** | tap court | léger « pop » à l'ouverture | fond assombri (voile encre ~30 %), 5 jetons déployés en étoile |
| **Écoute** | appui long (~400 ms) | pulsation alternée sauge/brique | anneaux pointillés brique qui pulsent, panneau « JE T'ÉCOUTE… » + barres d'encre + transcription en direct |
| **Réflexion** | texte envoyé au routeur, réponse en attente | oscillations alternées rapides (« ils se parlent ») | — |
| **Succès** | action(s) niveau 1 exécutée(s) | les deux moitiés se rapprochent brièvement | tampon « C'EST NOTÉ ! » qui claque + toast ANNULER |
| **Incompréhension** | routeur → intent inconnu / clarification | petit tremblé latéral | message + question à choix ou invitation à reformuler |

### 4.3 L'éventail — éclatement de jetons

> **Décision design (02/07/2026)** : forme **jeton rond** + déploiement **éclatement en étoile**. Remplace la piste initiale « cartes à jouer en éventail serré ». Le terme « éventail » reste le nom générique du menu dans tout le document.

- **5 jetons ronds icône seule**, qui **fusent en étoile depuis le cerveau** et se répartissent régulièrement sur un **demi-cercle au-dessus de lui** (positions ≈ toutes les 30° sur un arc de 180°, rayon ≈ 2 × le diamètre du cerveau) : Listes (extrémité gauche), Biblio, Recettes (au sommet), Planning, Profil (extrémité droite) — la navigation actuelle à l'identique (mêmes routes, mêmes icônes lucide `ListChecks` / `ShoppingCart` / `ChefHat` / `User`, cf. §2.1) plus le Planning (`Calendar`). **Aucun libellé texte** ; `aria-label` sur chaque jeton.
- Style : **jetons circulaires ~64 px de diamètre** (zone tap ≥ 44 px OK), fond `paper-light`, **bordure `2px ink` en cercle parfait**, ombres riso décalées nettes **alternées brique/sauge**, icône centrale 26 px stroke 2.5. Les jetons restent **droits** (pas de rotation en éventail) ; tolérance d'un léger désaxage ±4° pour l'esprit « imprimé à la main ». Aucun recouvrement entre jetons.
- Déploiement : **ressort < 300 ms avec stagger** — chaque jeton part du centre du cerveau (scale ~0.5, opacité 0) et fuse vers sa position sur l'arc (easing avec léger dépassement, type `cubic-bezier(.34,1.5,.5,1)`). Repli : trajectoire inverse, stagger inversé.
- **L'outil courant est marqué** sur son jeton (ombre réduite « enfoncée » + coche).
- Fermeture : re-tap sur le cerveau, tap sur le voile, ou sélection d'un jeton.
- À l'ouverture de l'app : **dernier outil utilisé** (persisté localement), Listes par défaut au premier lancement.
- Premier lancement post-V4 : un **coach mark** unique explique « tap = outils, appui long = parler ». Ne jamais le réafficher ensuite.

### 4.4 Le langage d'animation « atelier d'imprimerie »

Règle de marque : **toute animation V4 vient de l'imprimerie** — tampons, tickets, encre, papier. Rien d'autre (pas de particules, pas de glassmorphism, pas de 3D).

| Moment | Animation |
|---|---|
| Confirmation niveau 1 | tampon « C'EST NOTÉ ! » qui claque (scale + rotation, ~450 ms) |
| Ligne de journal | s'imprime comme une ligne de ticket (apparition par translation verticale) |
| Article ajouté par la voix | la ligne « s'imprime » dans la liste (fond sauge qui s'estompe) |
| Écoute | barres d'encre qui dansent + anneaux pointillés |
| Annulation | trait d'encre qui raye la ligne du ticket |

**`prefers-reduced-motion` : respecté partout** (exigence d'accessibilité existante). Toutes les animations sont décoratives : chaque état reste parfaitement compréhensible sans elles (texte + couleurs suffisent).

### 4.5 Règle d'or d'accessibilité

**Toute action vocale a un équivalent tactile.** La voix est un accélérateur, jamais le seul chemin. Cible WCAG 2.1 AA maintenue (contrastes, focus visible, libellés).

### 4.6 Le geste d'ajout — la tuile fantôme

Le cerveau est **le seul élément flottant** de l'écran : les FAB « + » actuels (bas-droite du hub des listes et des recettes) sont supprimés, et **aucun bouton n'est docké à côté du cerveau**. Le geste d'ajout vit dans la collection, sous la forme d'une **tuile fantôme ajoutée en dessous des tuiles existantes** : mêmes dimensions qu'une tuile normale, **bordure 2 px pointillée `ink-soft`, fond transparent, un « + » centré** (icône seule, `aria-label`).

| Écran | Tuile fantôme | Action au tap (inchangée) |
|---|---|---|
| Hub des listes (`/lists`) | sous la dernière tuile | ouvre le Sheet « Nouvelle liste » existant (type courses / to-do) |
| Recettes (`/recipes`) | en fin de grille | ouvre le flux d'ajout de recette existant (celui du FAB actuel) |
| Biblio, Profil | absente (pas de FAB aujourd'hui) | — |
| Planning (`/planning`) | chaque case repas vide est nativement en pointillés | choix recette / texte libre |

**RÈGLE STRICTE : les tuiles et widgets existants ne sont pas modifiés d'un pixel.** La tuile fantôme est un **ajout** sous la collection ; les champs d'ajout en bas de liste (add-bar « Ajouter un article… ») et tous les autres éléments d'écran restent tels quels. Langage commun : « ce qui n'existe pas encore est imprimé en pointillés ».

### 4.7 Migration de la navigation existante

> ⚠️ **Claude Code : inspecte `bottom-nav.tsx` et le layout `(app)` avant de les toucher.** La suppression de la barre ne doit rien changer d'autre : mêmes destinations (`/lists`, `/library`, `/recipes`, `/profile` + `/planning` nouveau), mêmes libellés, mêmes icônes, sous-pages atteignables, retours navigateur et redirections auth intacts.

---

## 5. LA FONDATION — le routeur d'intentions vocales

### 5.1 Principe

Une **seule route serveur** (ex. `/api/brain-command`) qui généralise `/api/parse-task` :

```
dictée native (navigateur) → texte
  → route serveur (auth + couple + contexte relu sous RLS)
  → Claude Haiku 4.5 (prompt système = catalogue d'intentions + contexte + date du jour Europe/Paris)
  → JSON strict : liste d'actions structurées (ou demande de clarification)
  → validation défensive côté serveur (ids vérifiés contre le contexte)
  → renvoi au navigateur → confirmation graduée (§6) → exécution par le serveur
```

**Le contexte est toujours relu côté serveur** (jamais fourni par le client) : listes du couple (courses + to-do), les deux profils, articles de la bibliothèque (pour la résolution des noms), recettes (id + titre), planning de la semaine courante. Même pattern que `parse-task` : fuseau `Europe/Paris` résolu serveur, RLS filtrante.

**L'écran courant est la seule information transmise par le client** (ex. `contexte_ecran: { route: "/lists/[id]", liste_id: "…" }`) : elle sert uniquement aux défauts d'ambiguïté (§5.4), jamais à contourner la RLS.

### 5.2 Catalogue d'intentions V4

Les intents opèrent sur les **données** (listes de courses, to-do lists, bibliothèque, recettes, planning) — ils ne présument rien de l'organisation des écrans.

| Intent | Exemple de phrase | Paramètres | Niveau (§6) | Phase |
|---|---|---|---|---|
| `courses.ajouter_article` | « Ajoute le lait et le beurre à la liste Auchan » | liste (de courses), articles [{nom, quantité?, unité?}] | 1 | 2 |
| `courses.cocher_article` | « Coche les tomates » | liste, article | 1 | 2 |
| `courses.decocher_article` | « Décoche le beurre » | liste, article | 1 | 2 |
| `bibliotheque.ajouter_article` | « Ajoute cet article à la bibliothèque » / « au garde-manger » | articles [{nom}] | 1 | 2 |
| `taches.ajouter` | « Ajoute plein d'essence pour après-demain, chaque semaine » | titre, échéance?, récurrence?, assigné?, to-do list? | 2 (écran V2.1 existant) | 2 |
| `taches.cocher` | « Coche sortir les poubelles » | tâche | 1 | 2 |
| `navigation.ouvrir` | « Ouvre la liste Carrefour », « Va au garde-manger », « Ouvre les recettes » | outil ou liste ou recette | 1 (navigation) | 2 |
| `consultation.lire` | « Qu'est-ce qu'il reste à acheter chez Auchan ? » | cible (liste, tâches du jour…) | lecture seule | 6 |
| `recettes.proposer` | « Propose-moi une recette avec courgettes et feta » | contraintes (texte) | 2 (écran de relecture V3) | 6 |
| `recettes.ajouter_ingredients` | « Ajoute les ingrédients de la ratatouille à la liste Auchan » | recette, liste, personnes? | 2 | 6 |
| `planning.placer_repas` | « Mets la ratatouille jeudi soir » | jour, créneau, repas (recette ou texte) | 1 | 6 |
| `planning.proposer_semaine` | « Propose-moi une semaine avec 3 dîners végétariens » | contraintes (texte) | 2 | 6 |
| `planning.generer_liste` | « Génère la liste de courses de la semaine dans Auchan » | liste, personnes? | 2 | 6 |
| `inconnu` | tout le reste | — | message d'incompréhension | 2 |

**Il n'existe AUCUN intent vocal de suppression** (supprimer une liste, vider une liste, supprimer une recette…). Ces actions restent tactiles avec confirmation explicite. Si l'utilisateur le demande vocalement, le cerveau répond : « Pour supprimer, passe par l'écran — je ne supprime rien à la voix. »

### 5.3 Schéma de sortie de l'IA

```json
{
  "actions": [
    {
      "intent": "courses.ajouter_article",
      "liste_id": "uuid-ou-null",
      "articles": [
        { "nom": "lait", "quantite": null, "unite": null },
        { "nom": "beurre", "quantite": null, "unite": null }
      ]
    },
    {
      "intent": "taches.ajouter",
      "titre": "sortir les poubelles",
      "due_date": "2026-07-03",
      "recurrence": null,
      "assigne_profile_id": null,
      "liste_id": null
    }
  ],
  "clarification": null
}
```

Cas ambigu :

```json
{
  "actions": [],
  "clarification": {
    "question": "Dans quelle liste ?",
    "options": [
      { "label": "Auchan", "liste_id": "uuid-1" },
      { "label": "Carrefour", "liste_id": "uuid-2" }
    ]
  }
}
```

### 5.4 Règles du routeur

1. **Multi-intentions** : une phrase peut porter plusieurs actions (max ~5). Le tableau `actions` est ordonné ; chaque action est validée et exécutée indépendamment, avec statut individuel.
2. **Validation défensive** (pattern `parseTaskCommand` existant) : JSON strict, ids vérifiés contre le contexte serveur, valeurs hors catalogue rejetées → 422 propre « Reformule ta phrase ».
3. **Noms d'articles** : systématiquement repassés par `normaliserNom()` côté serveur avant fusion (règle d'or V3 — on ne fait jamais confiance à la clé venue de l'IA).
4. **Résolution d'ambiguïté de liste**, dans l'ordre :
   1. la liste nommée dans la phrase (correspondance sur nom, tolérante à la casse/accents) ;
   2. sinon la liste **ouverte à l'écran** (contexte écran) si elle est du bon type ;
   3. sinon la **seule** liste du bon type si le couple n'en a qu'une ;
   4. sinon → `clarification` à choix (tap sur une option, ou redire le nom).
5. **Jamais de défaut pour une action à conséquence** : si le moindre doute porte sur *quoi* cocher (deux articles proches), demander.
6. **Dates relatives** (« demain », « après-demain », « mardi ») : résolues côté serveur sur le fuseau Europe/Paris (réutiliser `jourCourantDansFuseau`).

### 5.5 UI d'écoute

- Appui long sur le cerveau → panneau « JE T'ÉCOUTE… » (encart papier bordé, barres d'encre animées, transcription en direct).
- Relâchement (ou tap « Terminé ») → envoi au routeur → état Réflexion → résultat.
- Hors-ligne ou dictée indisponible : bouton d'écoute grisé + message « Le cerveau a besoin de réseau pour t'écouter » ; le reste de l'app fonctionne.

---

## 6. Confirmation graduée (règles de gestion)

| Niveau | Actions | Comportement |
|---|---|---|
| **1 — Directe** | ajouter/cocher/décocher un article, ajouter à la bibliothèque, cocher une tâche, placer un repas, naviguer | Exécution immédiate → tampon « C'EST NOTÉ ! » + toast récapitulatif avec **ANNULER** (~6 s). L'annulation reste possible ensuite via le journal (§7). |
| **2 — Validation** | tâche structurée (écran V2.1 existant), ingrédients d'une recette → liste, proposition de recette, proposition de semaine, génération de la liste de la semaine | Écran de validation pré-rempli, modifiable, **rien n'est écrit avant validation**. |
| **3 — Confirmation explicite** | toute suppression, vider une liste, retrait des articles d'un repas supprimé | Question explicite avec le détail de ce qui va être touché. **Jamais accessible par la voix seule** (cf. §5.2). |

**Règles transverses :**
- **Lot multi-intentions** : une seule action de niveau 1 → tampon direct. Plusieurs actions, ou au moins une de niveau ≥ 2 → **écran récapitulatif unique** listant tout, exécution après validation globale (chaque ligne désactivable individuellement).
- **Annulation** : chaque action de niveau 1 sait se défaire (ajout → retrait ; coche → décoche ; repas placé → case vidée). L'annulation est elle-même journalisée.
- **Transparence des fusions** (règle V3) : quand une commande vocale fusionne des quantités, l'afficher (« tomate : 200 + 300 = 500 g »). Jamais de fusion silencieuse.

---

## 7. Le journal du Cerveau (ticket de caisse)

- **Contenu d'une ligne** : horodatage, auteur (point de couleur sauge/brique), phrase dictée, action(s) exécutée(s) avec leur détail, statut (`fait` / `annulé`), bouton **ANNULER** si encore réversible.
- **Périmètre** : uniquement les commandes du Cerveau (vocal + propositions IA acceptées). Les actions tactiles ordinaires n'y figurent pas (l'historique d'achats existant couvre déjà ce besoin).
- **Partagé** : visible par les deux, temps réel (Realtime). Sonia voit que « 6 articles ajoutés d'un coup » viennent d'une commande vocale de Baptiste.
- **Accès** : depuis le toast (« voir le ticket »), et depuis Profil → une entrée « Journal du Cerveau » à côté de l'historique existant.
- **Design** : ticket de caisse imprimé — bord perforé, lignes monospaces/Silkscreen pour les en-têtes, chaque nouvelle ligne « s'imprime ». Annulation = trait d'encre qui raye la ligne.
- **Rétention** : affichage des 100 dernières commandes ; pas de purge automatique en V4 (volumétrie négligeable à 2 utilisateurs).

---

## 8. Le Planning — la semaine du foyer

### 8.1 La grille

- **7 jours (lundi → dimanche) × 2 créneaux** (déjeuner / dîner). Cases vides autorisées et normales : on ne planifie que ce qu'on veut.
- Ouverture sur la **semaine courante**, navigation semaine précédente / suivante. Le jour courant est mis en évidence.
- Temps réel : un repas placé par l'un apparaît instantanément chez l'autre.

### 8.2 Contenu d'une case repas

Trois sources (décision actée) :

| Source | Contenu | Lien liste de courses |
|---|---|---|
| **Recette de l'app** | référence à une recette V3 (titre, photo, tags) — tap → fiche recette | ingrédients générables (§8.5) |
| **Texte libre** | « restes », « pizza surgelée », « chez mes parents » | aucun article généré |
| **Proposition IA** | recette proposée puis **validée** via l'écran de relecture V3 (`source = 'ia'`), ensuite référencée comme une recette normale | comme une recette |

### 8.3 Les tâches dans le planning

- **Automatique** : toute tâche dont l'échéance tombe dans la semaine affichée apparaît sur son jour, sous les créneaux repas. Les tâches récurrentes apparaissent via leur prochaine occurrence.
- **Cochable sur place** (un tap, ADN de l'app). Tâche cochée → style « fait » apaisé.
- **Pas d'édition sur place** : tap sur le libellé → ouvre la tâche dans sa to-do list (outil Listes).
- Aucun placement manuel de tâche dans le planning : c'est **l'échéance qui place la tâche**, pas l'utilisateur.

### 8.4 Proposition IA de semaine

- Entrée en langage naturel (vocal ou tactile) : « 3 dîners végétariens, un poisson, rapide en semaine ».
- **Priorité aux recettes existantes du couple** ; l'IA (Opus 4.8) peut proposer des recettes nouvelles, clairement marquées « nouvelle recette » et créées via l'écran de relecture V3 si acceptées.
- Sortie = proposition de placement sur la grille (écran de validation niveau 2 : chaque case acceptable/refusable individuellement). **Rien n'est placé avant validation.**

### 8.5 Génération de la liste de courses de la semaine

1. L'utilisateur déclenche « Générer la liste de la semaine » (tactile ou vocal).
2. Choix de la **liste cible** (Auchan, Carrefour…) et du **nombre de personnes** (défaut : 2).
3. Pour chaque repas-recette de la semaine : quantités ajustées (logique V3 §8.2 : base × N / nombre_personnes de base), puis **fusion via `normaliserNom()`** (logique V3 §6 : addition des unités compatibles, cohabitation des incompatibles, « au goût » sans quantité).
4. Les repas texte libre ne génèrent rien.
5. **Écran de validation (niveau 2)** : récapitulatif complet avant écriture — articles créés, fusions détaillées (« oignon : 1 pièce + 200 g »), repas ignorés.
6. **Provenance enregistrée** : chaque ligne de liste créée par la génération garde le lien vers son/ses repas d'origine (nécessaire pour §8.6).

### 8.6 Modification en cours de semaine (règle actée)

Quand un repas planifié est **supprimé ou remplacé** après génération :

- L'app **demande** : « X articles venaient de ce repas — les retirer de la liste ? », avec la liste détaillée.
- **Seules les lignes créées par la génération et non cochées** sont proposées au retrait. Les articles cochés ne sont **jamais** touchés ni proposés.
- Cas de la fusion (l'article existait déjà avant génération, ou sert aussi à un autre repas) : la ligne n'est pas proposée au retrait entier ; le récapitulatif signale « quantité à ajuster manuellement » avec le détail.
- Le remplacement ajoute ensuite ce qui manque pour le nouveau repas (même mécanique que §8.5, récapitulatif inclus).
- **Jamais de retrait automatique.** (Cohérent avec le garde-fou global : aucune suppression sans confirmation.)

### 8.7 Commandes vocales du planning

- « Mets la ratatouille jeudi soir » → `planning.placer_repas` (niveau 1, tampon + annulation).
- « Qu'est-ce qu'on mange demain ? » → `consultation.lire`.
- « Propose-moi une semaine avec 3 repas végétariens » → `planning.proposer_semaine` (niveau 2).
- « Génère la liste de la semaine dans Auchan » → `planning.generer_liste` (niveau 2).

---

## 9. Modèle de données (Supabase)

> ⚠️ **Claude Code : inspecte d'abord le schéma existant** et respecte les conventions en place (nommage, `couple_id`, RLS, Realtime). Ce qui suit décrit les **besoins**, pas un schéma à recopier. Rappel garde-fou : **jamais de DELETE/UPDATE sans filtre `couple_id`/`id`** (tables multi-couples + cascade).

### Nouvelles tables (besoins)

**Repas planifiés** (`meal_slots` ou équivalent)
| Besoin | Notes |
|---|---|
| `couple_id`, `date`, `creneau` (`dejeuner` \| `diner`) | unicité (couple, date, créneau) |
| `type` (`recette` \| `texte`) | la proposition IA acceptée devient une recette → `type = 'recette'` |
| `recipe_id` nullable (FK recipes), `texte` nullable | l'un des deux selon `type` |
| `created_by`, `created_at` | marqueur « ajouté par » (identité tangible, principe V1) |

**Provenance des articles générés** (liaison repas ↔ lignes de liste)
| Besoin | Notes |
|---|---|
| `meal_slot_id` ↔ `list_item_id` | permet le retrait ciblé §8.6 ; marquer si la ligne a été **créée** par la génération ou **fusionnée** à une ligne préexistante |

**Journal du Cerveau** (`brain_commands` ou équivalent)
| Besoin | Notes |
|---|---|
| `couple_id`, `user_id`, `created_at` | RLS couple |
| `texte_dicte` | la phrase d'origine |
| `actions` (jsonb) | actions exécutées, avec leur détail affichable |
| `statut` (`fait` \| `annule`), `undo_data` (jsonb) | ce qu'il faut pour défaire (ids créés, états précédents) |

### Realtime & RLS
- Realtime activé sur les repas planifiés et le journal (comme listes/tâches existantes).
- RLS `couple_id` sur toutes les nouvelles tables, mêmes patterns que l'existant.

---

## 10. Parcours utilisateurs de référence

1. **Ajout simple** — Baptiste, en cuisine : appui long → « Ajoute le lait à la liste Auchan » → réflexion (< 3 s) → tampon « C'EST NOTÉ ! » + toast ANNULER. Sonia voit l'article apparaître en temps réel avec le point sauge.
2. **Multi-intentions** — « Ajoute lait et beurre à Auchan et mets sortir les poubelles dans mes tâches pour demain » → écran récapitulatif (2 actions courses niveau 1 + 1 tâche niveau 2) → validation globale → tout s'exécute, une ligne de ticket.
3. **Ambiguïté** — « Ajoute le pain » sans liste nommée, depuis l'écran Recettes, deux listes de courses existantes → « Dans quelle liste ? [Auchan] [Carrefour] » → tap → tampon.
4. **Semaine planifiée** — dimanche soir : « Propose-moi une semaine avec 3 dîners végétariens » → proposition sur grille → Baptiste refuse le mercredi, valide le reste → « Génère la liste dans Auchan » → récapitulatif de fusion → validation → 15 articles ajoutés.
5. **Changement d'avis** — mercredi : remplacement des lasagnes de vendredi par « pizza surgelée » (texte libre) → « 5 articles venaient des lasagnes — les retirer ? » (la crème, déjà cochée, n'est pas proposée) → confirmation → retrait + ligne de ticket.
6. **Consultation** — en magasin : « Qu'est-ce qu'il reste à acheter chez Auchan ? » → panneau ticket à l'écran listant les articles non cochés (pas de lecture vocale).
7. **Hors-ligne** — en magasin sans réseau : appui long → bouton grisé « Le cerveau a besoin de réseau pour t'écouter » ; les listes restent utilisables normalement.

---

## 11. Hors-périmètre V4 (plus tard, ou jamais)

- **Toute réorganisation des outils existants** (fusion, scission, renommage, changement d'icône).
- Synthèse vocale (TTS) des réponses.
- Mot d'éveil (« Hey Cerveau ») — impossible proprement en PWA.
- Mascotte à yeux / expressions figuratives.
- Suppressions par la voix.
- Inventaire de stock du garde-manger (écarté : trop lourd à maintenir).
- Statistiques de répartition de la charge entre les deux (écarté : hors promesse produit).
- Exécution vocale hors-ligne.
- Placement manuel de tâches dans le planning (c'est l'échéance qui place).
- Widgets OS / raccourcis système.

---

## 12. Phases de construction

### Phase 1 — La navigation Cerveau (sans vocal)
Logo reproduit fidèlement (2 hémisphères animables, §4.1), bouton flottant, éclatement des 5 jetons icône seule (§4.3 — navigation actuelle inchangée + Planning en placeholder), suppression de la barre d'onglets, remplacement des FAB « + » par la tuile fantôme sous les collections (§4.6), ouverture sur le dernier outil utilisé, coach mark, `prefers-reduced-motion`.

**Critères d'acceptation :**
- [ ] Le logo SVG est fidèle à `logo-source.png` et chaque hémisphère est animable séparément.
- [ ] Tap court → éclatement des jetons < 300 ms ; re-tap / voile / sélection ferment l'éventail ; l'outil courant est marqué.
- [ ] Les jetons sont ronds, déployés en étoile au-dessus du cerveau (§4.3), sans recouvrement.
- [ ] L'éventail reprend la navigation actuelle À L'IDENTIQUE (Listes, Biblio, Recettes, Profil — mêmes routes, mêmes icônes) + le jeton Planning ; aucun outil déplacé, renommé ou fusionné.
- [ ] Aucun libellé texte sur l'éventail ; chaque jeton a un `aria-label`.
- [ ] Plus aucun FAB en bas à droite, et aucun bouton à côté du cerveau : une tuile fantôme (pointillés + « + ») est ajoutée sous les tuiles du hub listes et en fin de grille recettes, avec exactement le même comportement d'ouverture qu'aujourd'hui ; les tuiles et widgets existants sont inchangés au pixel près.
- [ ] Toutes les destinations existantes restent atteignables (y compris les sous-pages) ; retours navigateur OK.
- [ ] L'app s'ouvre sur le dernier outil utilisé.
- [ ] Avec `prefers-reduced-motion`, aucune animation ne joue et tout reste utilisable.
- [ ] Zones tap ≥ 44 px, contrastes AA conservés.

### Phase 2 — Le routeur d'intentions + actions Courses / Bibliothèque / Tâches
Route `/api/brain-command`, catalogue §5.2 (intents courses, bibliothèque, tâches, navigation, inconnu), migration de l'ajout vocal de tâches V2.1 dans le routeur (l'écran de validation V2.1 est conservé), UI d'écoute (appui long), confirmation graduée niveaux 1–2, tampon + toast ANNULER, résolution d'ambiguïté, multi-intentions, dégradation hors-ligne.

**Critères d'acceptation :**
- [ ] « Ajoute le lait et le beurre à la liste Auchan » ajoute 2 articles fusionnés via `normaliserNom()`, tampon + ANNULER fonctionnel.
- [ ] « Ajoute plein d'essence pour après-demain, chaque semaine » ouvre l'écran de validation V2.1 pré-rempli (comportement existant préservé).
- [ ] Une phrase multi-intentions produit un récapitulatif unique ; chaque action est désactivable avant validation.
- [ ] Ambiguïté de liste → question à choix, jamais de choix silencieux arbitraire.
- [ ] Aucun id halluciné n'est accepté ; JSON invalide → 422 « Reformule ta phrase ».
- [ ] Aucune commande de suppression n'est exécutable vocalement.
- [ ] Hors-ligne : bouton grisé + message, aucune erreur brute.

### Phase 3 — Le journal du Cerveau
Table journal, écriture à chaque commande exécutée, écran ticket (Profil + toast), annulation par ligne avec `undo_data`, Realtime.

**Critères d'acceptation :**
- [ ] Chaque commande vocale exécutée crée une ligne de ticket (auteur, phrase, actions, statut).
- [ ] ANNULER défait l'action (ajout → retrait, coche → décoche) et raye la ligne ; l'annulation est visible par l'autre en temps réel.
- [ ] Une action déjà annulée ou non réversible n'affiche pas ANNULER.

### Phase 4 — Le Planning (grille + repas + tâches)
Grille 7 j × 2 créneaux, repas recette / texte libre, tâches à échéance affichées et cochables, Realtime, navigation entre semaines.

**Critères d'acceptation :**
- [ ] Placer une recette et un texte libre sur n'importe quelle case ; cases vides possibles.
- [ ] Les tâches à échéance de la semaine apparaissent automatiquement sur leur jour (récurrentes incluses) et sont cochables sur place.
- [ ] Tap sur une tâche → sa to-do list ; tap sur un repas-recette → fiche recette.
- [ ] Changement visible en temps réel sur l'autre appareil.

### Phase 5 — Génération de la liste de la semaine + retrait ciblé
Génération avec liste cible + nombre de personnes, fusion V3, récapitulatif transparent, provenance repas ↔ lignes, règle de retrait §8.6.

**Critères d'acceptation :**
- [ ] La génération produit un récapitulatif complet (créations, fusions détaillées) avant toute écriture.
- [ ] Les quantités sont ajustées au nombre de personnes choisi.
- [ ] Supprimer un repas propose le retrait des seules lignes générées non cochées ; les cochées ne sont jamais proposées ; les fusions sont signalées « à ajuster manuellement ».
- [ ] Aucun retrait n'a lieu sans confirmation explicite.

### Phase 6 — L'IA partout (vocal avancé)
Intents `recettes.proposer`, `recettes.ajouter_ingredients`, `planning.placer_repas`, `planning.proposer_semaine`, `planning.generer_liste`, `consultation.lire`. Proposition de semaine (Opus, priorité aux recettes existantes, validation case par case).

**Critères d'acceptation :**
- [ ] « Mets la ratatouille jeudi soir » place le repas (tampon + ANNULER).
- [ ] « Propose-moi une recette avec X et Y » aboutit à l'écran de relecture V3 (rien d'enregistré avant validation).
- [ ] « Propose-moi une semaine… » produit une proposition refusable case par case ; rien n'est placé avant validation.
- [ ] « Qu'est-ce qu'il reste à acheter chez Auchan ? » affiche la réponse à l'écran, sans écriture en base.
- [ ] Les 4 phrases d'exemple du cadrage initial fonctionnent de bout en bout.

---

## 13. Critères d'acceptation globaux (toutes phases)

- [ ] L'organisation des outils existants est strictement inchangée (routes, libellés, icônes, contenu).
- [ ] Toute action vocale a un équivalent tactile.
- [ ] `ANTHROPIC_API_KEY` uniquement côté serveur ; toutes les routes IA exigent auth + couple.
- [ ] L'IA ne fait que structurer : toute écriture passe par le serveur sous RLS, ids validés.
- [ ] Aucune suppression sans confirmation explicite ; aucune suppression vocale.
- [ ] Aucune fusion silencieuse de quantités.
- [ ] Latence commande vocale → tampon < 3 s en conditions normales.
- [ ] WCAG 2.1 AA + `prefers-reduced-motion` respectés sur tout ce qui est nouveau.
- [ ] Temps réel : toute écriture V4 est visible par l'autre sans rechargement.

