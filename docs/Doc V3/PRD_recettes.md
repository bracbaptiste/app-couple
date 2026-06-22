# PRD — Outil « Recettes » (V3)

**Application :** PWA mobile-first (Next.js / React + Supabase) de gestion de charge mentale du foyer
**Périmètre :** 2 utilisateurs (Baptiste + son épouse), usage privé
**Auteur fonctionnel :** Baptiste BRAC
**Statut :** prêt pour implémentation

---

## 0. Comment utiliser ce document

**Pour Claude Code :**

1. **Avant de coder quoi que ce soit**, inspecte le code et le schéma Supabase existants (tables `articles`/bibliothèque, table de la liste de courses, conventions de nommage, structure des composants, gestion de l'authentification/foyer). Le nouvel outil doit **réutiliser les patterns existants**, pas en inventer de nouveaux.
2. **Explique tes changements en français avant de les appliquer**, étape par étape. Ne lance pas une grosse refonte d'un coup.
3. **Construis dans l'ordre des phases** (§7 → §8 → §9). Ne commence pas une phase tant que la précédente n'est pas fonctionnelle.
4. La **fonction de normalisation (§5)** est la toute première brique à poser : tout le reste s'appuie dessus.

**Note pour Baptiste :** ce document est conçu pour être donné à Claude Code phase par phase. Tu n'as pas besoin de tout lui coller d'un coup. Commence par §0 à §6 (les fondations + Phase 1), valide que ça marche, puis passe à la suite.

---

## 1. Contexte & objectif

Aujourd'hui, certaines recettes appréciées sont écrites à la main et risquent d'être perdues. L'objectif de cet outil est de :

- **Photographier une recette manuscrite** (ou en saisir/créer une) et la conserver durablement.
- Laisser **l'IA déchiffrer la photo** et en extraire automatiquement : titre, durée, type de plat, étiquettes (healthy / végétarien / riche…), ingrédients structurés, étapes, calories et macros par portion.
- **Relire et corriger** ce que l'IA a extrait avant d'enregistrer.
- Ranger les recettes dans **une liste filtrable**.
- **Ajouter les ingrédients d'une recette à la liste de courses** sans créer de doublon (fusion intelligente des quantités).
- Pouvoir **créer ou améliorer une recette avec l'IA** (mode séparé, créatif).

---

## 2. Décisions d'architecture (validées)

Ces décisions sont actées. Elles ne doivent pas être remises en cause pendant l'implémentation.

1. **Une seule fonction de normalisation des noms de produits**, réutilisée partout (bibliothèque, liste de courses, ingrédients de recette). C'est elle qui garantit l'absence de doublons. → §5
2. **Tous les appels à l'IA se font côté serveur** (route API Next.js / server action). La clé API n'apparaît **jamais** dans le code du navigateur. → §3
3. **Aucune IA dans la comparaison/détection de doublons.** La comparaison se fait uniquement par clés normalisées (comparaison de texte, déterministe). L'IA n'intervient qu'en amont (lecture de la photo) et dans le mode création/amélioration. → §5, §6
4. **Deux modes IA strictement séparés :** « Préserver » (extraction fidèle, aucune critique gastronomique) et « Créer / Améliorer » (suggestions créatives basées sur un cadre). → §7, §9
5. **Stockage des photos dans Supabase Storage** (bucket dédié). → §4
6. **Les ingrédients de recette ne sont PAS automatiquement ajoutés à la bibliothèque d'articles.** Le transfert vers la bibliothèque est une action manuelle et optionnelle. → §4, §6

---

## 3. Choix des modèles IA & sécurité

| Usage | Modèle | API ID | Pourquoi |
|---|---|---|---|
| Lecture photo + extraction structurée | **Claude Sonnet 4.6** | `claude-sonnet-4-6` | Lit bien l'écriture manuscrite, sort du JSON structuré fiable, coût modéré |
| Création / amélioration de recette | **Claude Opus 4.8** | `claude-opus-4-8` | Meilleur raisonnement, qualité des suggestions culinaires |

- **Un seul appel suffit pour la lecture de photo.** Un modèle « vision » lit l'image ET structure le résultat dans la même requête (pas besoin d'un OCR séparé).
- **Sécurité (NON NÉGOCIABLE) :** la clé `ANTHROPIC_API_KEY` est une variable d'environnement **serveur uniquement**. Elle ne doit jamais être préfixée `NEXT_PUBLIC_`, ni utilisée dans un composant client. Le flux est : navigateur → envoie la photo à notre route API → la route API appelle l'IA avec la clé → renvoie le résultat au navigateur.
- **Coût attendu :** quelques centimes par recette. Négligeable pour 2 utilisateurs. Aucune optimisation de coût nécessaire à ce stade.

---

## 4. Modèle de données (Supabase)

> ⚠️ **Claude Code : inspecte d'abord le schéma existant.** Adapte les noms de colonnes aux conventions déjà en place. Ce qui suit décrit les besoins, pas un schéma à recopier aveuglément.

### Tables existantes (à réutiliser, ne pas dupliquer)
- **Bibliothèque d'articles** : possède au minimum un nom affiché et doit posséder (ou se voir ajouter) une colonne **`nom_normalise`** (la clé de comparaison, cf. §5).
- **Liste de courses** : doit posséder `nom_normalise` également, ainsi qu'une représentation de la/des quantité(s) (cf. note sur les unités incompatibles ci-dessous).

### Nouvelles tables

**`recipes`**
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `titre` | text | |
| `photo_url` | text, nullable | URL Supabase Storage |
| `duree_minutes` | int, nullable | estimée par l'IA |
| `type_plat` | text | valeur de l'Axe 1 (§10) |
| `tags` | text[] (ou jsonb) | valeurs de l'Axe 2 (§10) |
| `nombre_personnes` | int | nb de personnes « de base » de la recette |
| `calories_par_portion` | int, nullable | **estimation** |
| `proteines_g` | numeric, nullable | par portion |
| `glucides_g` | numeric, nullable | par portion |
| `lipides_g` | numeric, nullable | par portion |
| `etapes` | jsonb | tableau de chaînes (une par étape) |
| `notes` | text, nullable | |
| `source` | text | `'photo'` \| `'manuelle'` \| `'ia'` |
| `created_at` | timestamptz | |
| *(propriétaire/foyer)* | | selon le modèle d'auth existant |

**`recipe_ingredients`**
| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | |
| `recipe_id` | uuid (FK → recipes) | |
| `nom_affiche` | text | ce que voit l'utilisateur (« tomates bien mûres ») |
| `nom_normalise` | text | la clé (« tomate »), cf. §5 |
| `quantite` | numeric, nullable | `null` pour les ingrédients « au goût » |
| `unite` | text, nullable | `'g'`, `'ml'`, `'piece'`, ou `null` |
| `ordre` | int | ordre d'affichage |

> Cette table est **indépendante** de la bibliothèque (décision §2.6). Un ingrédient existe au sein de sa recette sans être un article de la bibliothèque.

### Unités incompatibles dans la liste de courses
Une ligne de liste de courses doit pouvoir représenter **plusieurs quantités non additionnables** sur le même produit (ex. « oignon : 1 pièce + 200 g »). Approche recommandée : stocker les quantités sous forme d'un petit tableau jsonb `quantites: [{ valeur, unite }]` sur la ligne.
**Claude Code : si la table de liste de courses existante utilise un simple couple `quantite`/`unite`, propose-moi la meilleure façon de réconcilier ça avec ce besoin avant de modifier le schéma.**

### Stockage
- Bucket Supabase Storage dédié aux photos de recettes (ex. `recipe-photos`), accès restreint au foyer.

---

## 5. LA FONDATION — la fonction `normaliserNom()`

C'est la brique la plus importante du projet. **À implémenter en premier.** Une seule fonction, dans un fichier utilitaire partagé, importée par tous les endroits où un nom de produit entre dans le système.

### Ce qu'elle fait
Elle transforme un texte libre en une **clé standard** servant uniquement à la comparaison.

```
normaliserNom("Tomates")        → "tomate"
normaliserNom("de la Crème")    → "creme"
normaliserNom("Poireaux")       → "poireau"
normaliserNom("  OIGNON  ")     → "oignon"
```

### Étapes (dans cet ordre)
1. `trim` + tout en minuscules.
2. **Retirer les accents** (normalisation Unicode NFD puis suppression des diacritiques).
3. Réduire les espaces multiples à un seul.
4. **Retirer les mots de liaison en début** : `de la `, `de l'`, `du `, `des `, `de `, `d'`, `le `, `la `, `les `, `l'`, `un `, `une `.
5. **Mettre au singulier** : si le mot se termine par `s` ou `x` (et fait plus de 3 lettres), retirer la dernière lettre.
6. `trim` final.

### Règles d'or
- **La comparaison ne se fait JAMAIS sur le texte affiché**, toujours sur `normaliserNom(texte)`.
- **La clé est interne et n'a pas besoin d'être « jolie ».** Si « ananas » devient `anana`, ce n'est pas grave : tant que la bibliothèque ET les ingrédients passent par la même fonction, ils produisent la même clé et se reconnaissent. Le seul critère qui compte est la **cohérence**.
- **Pas d'IA ici.** C'est volontaire (déterministe, instantané, gratuit, et surtout pas de fusion à tort comme « lait de coco » → « lait »).
- Même quand l'IA renvoie un nom déjà « propre », on le repasse **systématiquement** par `normaliserNom()` côté serveur. On ne fait jamais confiance à une source externe pour la clé. C'est ce qui rend le système robuste.

---

## 6. Logique de fusion (ingrédient → liste de courses / bibliothèque)

### Principe général
Il n'y a pas d'« écrasement » : on **retrouve la ligne existante et on lui ajoute la quantité**. La ligne reste unique.

```
Pour ajouter un produit (nom, quantite, unite) à une liste cible :
  clé = normaliserNom(nom)
  ligne_existante = chercher dans la liste cible une ligne où nom_normalise == clé
  SI trouvée :
      fusionner les quantités (voir règles d'unités)
  SINON :
      créer une nouvelle ligne (nom_affiche = nom, nom_normalise = clé, quantité, unité)
```

### Règles d'unités lors de la fusion
| Cas | Action |
|---|---|
| Même unité (g + g, ml + ml, pièce + pièce) | On additionne. |
| Unités convertibles (kg + g, l + ml) | On ramène tout à l'unité de base (g, ml) puis on additionne. |
| Unités incompatibles (1 pièce + 200 g) | On **ne convertit pas**. On garde les deux quantités sur la même ligne (« oignon : 1 pièce + 200 g »). |
| Ingrédient « au goût » (sel, poivre, filet d'huile → quantité `null`) | Aucune fusion. Apparaît une seule fois, sans quantité. |

**Unités de base :** poids → `g` (kg × 1000), volume → `ml` (l × 1000), comptage → `piece`. À l'affichage, on peut reformater joliment (ex. ≥ 1000 g → afficher en kg), mais le stockage se fait en unité de base.

### Transfert d'un ingrédient vers la bibliothèque
**Exactement le même mécanisme**, appliqué à la bibliothèque comme liste cible :
```
clé = normaliserNom(nom_ingredient)
SI un article avec ce nom_normalise existe déjà → ne rien créer (l'article existe)
SINON → créer le nouvel article
```
Aucun code spécifique : c'est la même brique réutilisée.

### Les ratés de la normalisation (synonymes, fautes de frappe)
La normalisation ne rattrape pas « yaourt » / « yogourt » ni un « tomatte » mal écrit. Pour ces cas rares :
- **Bouton « Fusionner » manuel** : l'utilisateur sélectionne deux lignes et les réunit. (À prévoir dès la Phase 2.)
- *(Plus tard, optionnel)* proposer une fusion (« on dirait que ‘tomatte' = ‘tomate', fusionner ? ») — **en suggestion uniquement, jamais en automatique**.

### Transparence
Quand l'appli fusionne des quantités, **le montrer** : « tomate : 200 + 300 = 500 g ». Jamais de fusion silencieuse. L'utilisateur doit toujours savoir d'où vient une quantité.

---

## 7. Phase 1 — Le cœur : photo → extraction → relecture → enregistrement → liste

C'est l'essentiel de la valeur. À livrer en premier.

### 7.1 Écran « Ajouter une recette »
- Bouton **prendre une photo** / choisir une image.
- *(Optionnel V3, sinon Phase 3)* bouton **saisir manuellement**.
- À la prise de photo : upload vers Supabase Storage, puis appel de la route API d'extraction.

### 7.2 Route API d'extraction (serveur)
- Reçoit l'image, appelle **Claude Sonnet 4.6** en mode vision.
- Demande une réponse **strictement en JSON** (voir schéma 7.3 et prompt 7.4).
- **Parse le JSON de façon défensive** (try/catch, retirer d'éventuels backticks ```` ```json ````).
- **Repasse chaque `nom` d'ingrédient par `normaliserNom()`** pour remplir `nom_normalise` (cf. §5).
- Renvoie l'objet structuré au navigateur. **N'enregistre rien encore** : l'enregistrement se fait après la relecture.

### 7.3 Schéma de sortie attendu de l'IA
```json
{
  "titre": "string",
  "duree_minutes": 0,
  "type_plat": "plat",
  "tags": ["vegetarien", "leger"],
  "nombre_personnes": 4,
  "calories_par_portion": 0,
  "proteines_g": 0,
  "glucides_g": 0,
  "lipides_g": 0,
  "ingredients": [
    { "nom": "tomate", "quantite": 300, "unite": "g" },
    { "nom": "sel", "quantite": null, "unite": null }
  ],
  "etapes": ["string", "string"]
}
```

### 7.4 Prompt d'extraction (mode « Préserver »)
> Tu es un assistant qui lit une recette de cuisine (souvent manuscrite) à partir d'une image et la transcrit fidèlement. **Ne juge pas la recette, ne la modifie pas, n'ajoute aucun ingrédient.** Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ou après, sans backticks.
>
> Champs :
> - `titre` : titre de la recette (déduis-en un court si absent).
> - `duree_minutes` : durée totale estimée (préparation + cuisson) en minutes.
> - `type_plat` : un seul choix parmi `aperitif`, `entree`, `plat`, `accompagnement`, `dessert`, `petit_dejeuner`, `boisson`, `sauce_base`.
> - `tags` : zéro ou plusieurs choix parmi `vegetarien`, `vegan`, `riche_proteines`, `leger`, `gourmand`, `faible_glucides`, `sans_gluten`, `sans_lactose`, `rapide`, `conservation`. N'invente aucun tag hors de cette liste.
> - `nombre_personnes` : nombre de personnes pour lequel la recette est écrite. Si non indiqué, mets `4`.
> - `calories_par_portion`, `proteines_g`, `glucides_g`, `lipides_g` : **estimation** par portion à partir des ingrédients et quantités. Donne ta meilleure estimation, même approximative.
> - `ingredients` : liste. Pour chaque ingrédient : `nom` au **singulier, sans article** (« tomate », pas « des tomates ») ; `quantite` numérique ou `null` ; `unite` parmi `g`, `ml`, `piece` ou `null`. Convertis les unités courantes vers g/ml/pièce quand c'est possible et sans ambiguïté. Pour les ingrédients « au goût » (sel, poivre, filet d'huile…), mets `quantite` et `unite` à `null`.
> - `etapes` : liste des étapes de préparation, dans l'ordre, une chaîne par étape.
>
> Si une information est illisible, fais ta meilleure interprétation plausible (l'utilisateur la corrigera).

### 7.5 Écran de relecture (ÉTAPE CENTRALE, non optionnelle)
Aucune lecture d'écriture manuscrite n'est parfaite. Après extraction, afficher un écran **éditable** où l'utilisateur valide/corrige avant enregistrement :
- titre, durée, type de plat, étiquettes (cases), nombre de personnes ;
- liste des ingrédients (nom / quantité / unité), chacun modifiable, supprimable, + ajout manuel ;
- étapes éditables ;
- calories + macros affichées avec la mention **« Estimation indicative (± ~15–20 %) — ne pas utiliser à des fins médicales/nutritionnelles précises »**.
- Boutons : **Enregistrer** / Annuler.

### 7.6 Liste des recettes
- Vignettes (photo, titre, durée, type, étiquettes, calories/portion).
- **Filtres** par type de plat (Axe 1) et par étiquettes (Axe 2).
- Recherche par titre.
- Clic → fiche recette détaillée.

---

## 8. Phase 2 — Ajout à la liste de courses (fusion) + ajustement portions

### 8.1 Depuis une fiche recette
- Bouton **« Ajouter les ingrédients à la liste de courses »**.
- Pour chaque ingrédient : appliquer la logique de fusion (§6).
- **Afficher un récapitulatif** de ce qui a été ajouté/fusionné (« tomate : 200 + 300 = 500 g »).
- Les ingrédients « au goût » sont ajoutés une fois, sans quantité.

### 8.2 Ajustement par nombre de personnes
- Sur la fiche, un sélecteur « pour N personnes ».
- Les quantités affichées = quantités de base × (N choisi / nombre_personnes de base).
- **Au moment d'ajouter à la liste de courses, on ajoute les quantités ajustées** (pas les quantités de base).

### 8.3 Bouton « Fusionner » manuel
- Dans la liste de courses : permettre de sélectionner deux lignes du même produit (synonymes, fautes) et de les réunir (cf. §6).

### 8.4 Transfert vers la bibliothèque
- Sur un ingrédient de recette : action **« Ajouter à ma bibliothèque »** (optionnelle), via le même mécanisme de fusion (§6).

### 8.5 Calories & portions — rappel
- Les calories/macros sont **par portion** : elles ne changent PAS quand on passe de 4 à 2 personnes (c'est le total qui change). Afficher par portion.

---

## 9. Phase 3 — Créer / Améliorer avec l'IA (mode créatif séparé)

Mode distinct du mode « Préserver ». Utilise **Claude Opus 4.8**.

### 9.1 Deux entrées
- **Créer** une recette de zéro à partir d'une demande en langage naturel (« une entrée légère à base de courge, riche en protéines »).
- **Améliorer** une recette existante (« rends ce plat plus intéressant », « version plus healthy »).

### 9.2 Cadre donné à l'IA (en coulisse, pas affiché)
Le cadre culinaire ci-dessous est passé à l'IA comme **instructions système**. On n'affiche **aucune interface de notation** (ça ferait pompeux pour de la cuisine maison) : l'IA s'en sert pour raisonner et **ne ressort que des suggestions concrètes**.

> Tu es un chef qui aide à composer ou améliorer une recette de cuisine maison. Raisonne (sans l'afficher) selon 5 rôles : **sujet** (l'ingrédient/préparation principal), **soutien** (ce qui renforce sa saveur/profondeur), **correcteur** (acidité, amertume, fraîcheur, salinité pour éviter la saturation), **contraste** (texture ou température différente), **lien** (sauce, jus, assaisonnement qui réunit l'ensemble). Vérifie aussi mentalement : le sujet est-il identifiable ? les éléments sont-ils cohérents entre eux ? une dominante excessive est-elle compensée ? chaque élément a-t-il une fonction (sinon le retirer) ? le plat reste-t-il agréable jusqu'à la dernière bouchée ?
>
> Restitue une recette claire (titre, ingrédients avec quantités, étapes) et, si pertinent, **2–3 suggestions concrètes** d'amélioration en langage simple (ex. « ajoute un trait de citron pour alléger la crème »). Reste dans le registre de la cuisine maison, sans jargon prétentieux.

### 9.3 Sortie & enregistrement
- La recette générée/améliorée est proposée dans le **même écran de relecture éditable** que la Phase 1 (§7.5), puis enregistrée avec `source = 'ia'`.
- Réutilise tout le pipeline existant (normalisation des ingrédients, etc.).

---

## 10. Catégories (taxonomie)

Système à **deux axes** (plus souple qu'une liste unique).

### Axe 1 — Type de plat (UN seul par recette)
| Clé | Libellé affiché |
|---|---|
| `aperitif` | Apéritif / À grignoter |
| `entree` | Entrée |
| `plat` | Plat principal |
| `accompagnement` | Accompagnement |
| `dessert` | Dessert |
| `petit_dejeuner` | Petit-déjeuner |
| `boisson` | Boisson / Smoothie |
| `sauce_base` | Sauce / Base |

### Axe 2 — Étiquettes (PLUSIEURS possibles, jeu fermé)
| Clé | Libellé affiché |
|---|---|
| `vegetarien` | Végétarien |
| `vegan` | Végan |
| `riche_proteines` | Riche en protéines |
| `leger` | Léger |
| `gourmand` | Gourmand / Riche |
| `faible_glucides` | Faible en glucides |
| `sans_gluten` | Sans gluten |
| `sans_lactose` | Sans lactose |
| `rapide` | Rapide (≤ 30 min) |
| `conservation` | Se conserve bien |

**Règle :** type de plat et étiquettes sont choisis **dans ces listes fixes** (jamais en texte totalement libre), pour que les filtres restent propres. Un ajout manuel d'étiquette reste possible mais doit rester exceptionnel.

---

## 11. Hors-périmètre (plus tard)

- Suggestion automatique de fusion de synonymes par l'IA.
- Partage des recettes hors du foyer / multi-utilisateurs.
- Planification de menus à la semaine.
- Import depuis une URL de site de cuisine.
- Modèle d'extraction moins cher (Haiku) si la volumétrie augmente un jour.

---

## 12. Critères d'acceptation (Phase 1)

- [ ] `normaliserNom()` existe dans **un seul** fichier partagé et est importée par la bibliothèque, la liste de courses et l'extraction.
- [ ] La clé API n'apparaît jamais côté client ; l'extraction passe par une route serveur.
- [ ] Photographier une recette manuscrite produit un objet structuré correct (titre, durée, type, tags, ingrédients normalisés, étapes, calories/macros).
- [ ] L'écran de relecture permet de tout corriger avant enregistrement.
- [ ] La recette enregistrée apparaît dans une liste filtrable (Axe 1 + Axe 2) et consultable.
- [ ] Les calories sont affichées « par portion » avec la mention d'estimation.

**Critères d'acceptation Phase 2 :** fusion sans doublon (« tomate »/« tomates » → une seule ligne), gestion correcte des unités incompatibles, récapitulatif de fusion affiché, ajustement par nombre de personnes appliqué à l'ajout, bouton de fusion manuel fonctionnel, transfert vers la bibliothèque opérationnel.

**Critères d'acceptation Phase 3 :** création et amélioration via Opus 4.8, sortie injectée dans l'écran de relecture, aucune interface de notation visible, suggestions concrètes restituées.
