# PRD V1 — App couple (nom à définir)

> **Document fondateur du projet.** Il définit *quoi* on construit, *pour qui*, et *pourquoi*. Ce n'est pas un document figé : il évoluera. Mais à chaque ajout de feature on revient ici pour vérifier l'alignement avec la vision.

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | Mai 2026 |
| **Statut** | ✅ Validé pour développement |
| **Stack technique** | Next.js · TypeScript · Tailwind · Supabase · PWA |

---

## 0. Comment utiliser ce document

- Tu peux le coller (ou pointer vers lui) quand tu donnes des instructions à Claude Code, pour qu'il comprenne le contexte global avant d'exécuter une tâche.
- Quand tu hésites sur une décision produit, relis la **Section 1 (Vision)** : la bonne décision sert la vision.
- Quand tu hésites sur un détail UX, relis les **parcours (Section 4)** : ils décrivent l'expérience idéale.
- Quand quelqu'un propose une feature, vérifie qu'elle n'est pas dans le **"Hors scope V1" (Section 3.4)** — sinon elle attend V1.5 ou V2.

---

## 1. Vision & Problème

### 1.1 Vision

Devenir le **cerveau partagé du couple** (puis de la famille). Une appli mobile-first où chaque info de la vie quotidienne — une course à faire, une tâche à ne pas oublier, plus tard une recette, un rendez-vous — atterrit naturellement au bon endroit, est visible par les bonnes personnes, et ne se perd jamais.

### 1.2 Problème concret

Tu penses *"tiens, faut racheter de la lessive"* en passant devant la salle de bain, et 30 min plus tard au supermarché tu l'as déjà oublié. Les idées d'organisation surgissent à des moments aléatoires (en mangeant, en rangeant, dans la voiture) — si on n'a pas l'outil exactement sous la main pour les capturer en 2 secondes, elles disparaissent. Côté inspiration, on aimerait aussi avoir ses recettes dans le téléphone pour bâtir la liste de courses à partir de *"qu'est-ce qu'on mange cette semaine ?"* plutôt que d'errer dans les rayons sans plan (ce dernier point arrivera en V2).

### 1.3 Pari produit

Un outil qui combine **liste de courses partagée temps réel + bibliothèque maître des produits récurrents** crée une vraie valeur — sans devenir un Notion-bis. Les apps existantes sont soit trop simples (juste une liste), soit trop complexes (Notion = usine à gaz à maintenir). On vise le milieu.

---

## 2. Personas (utilisateurs)

### 2.1 Persona 1 — Toi

- Personne organisée qui cherche à structurer la vie commune
- Utilise son téléphone tout le temps, à l'aise avec le numérique
- Veut gagner du temps et alléger la charge mentale partagée
- Représenté dans l'app par sa couleur d'identité (sauge ou brique au choix)

### 2.2 Persona 2 — Ta conjointe

- Aussi à l'aise techniquement, mais doit pouvoir s'y mettre **sans formation**
- Niveau d'engagement variable selon les moments : parfois consultatif (regarder la liste au supermarché), parfois actif (ajouter un item)
- Principe directeur : **zéro friction à l'usage quotidien**

### 2.3 Personas V2+ (mémoire, hors scope V1)

- **Enfants** (quand applicable) : accès lecture pour ce qui les concerne
- **Femme de ménage** : accès restreint à un module dédié (notes, produits à racheter)
- **Nounou** : accès restreint à un module dédié (planning, infos urgences)

---

## 3. Scope V1

### 3.1 Module Courses

**Listes**
- Plusieurs listes en parallèle (Auchan, Leroy Merlin, Marché, Pharmacie…)
- Création/suppression d'une liste à volonté
- Une liste contient des items groupés par catégorie

**Items**
- Ajout en 2 secondes depuis l'intérieur d'une liste (champ "Ajouter…" en haut)
- Ajout depuis la Bibliothèque (tap sur un item → choix de la liste de destination)
- Cocher / décocher un item
- Les items cochés glissent dans une section "Déjà pris" en bas, atténués mais consultables
- Chaque item affiche un petit marqueur coloré indiquant qui l'a ajouté

**Catégorisation**
- Chaque item appartient à une catégorie (liste fixe, voir Section 5)
- L'appli devine la catégorie à l'ajout, surchargeable manuellement par item
- **Mémoire** : si on change la catégorie de "saumon fumé" de "Poisson" à "Surgelés", l'appli s'en souvient pour les futures occurrences (côté couple, partagé)

**Synchronisation temps réel**
- Quand l'un ajoute/coche/modifie, l'autre voit la modification en quelques secondes maximum
- Pas de "rafraîchir manuellement"

### 3.2 Module Bibliothèque

- Liste maître de tous les items déjà ajoutés au moins une fois par le couple
- Groupés par catégorie
- Dans chaque catégorie, triés du plus utilisé au moins utilisé
- Indicateur visuel de fréquence (4 pastilles : ●●●●, ●●●○, ●●○○, ●○○○)
- Recherche en haut pour trouver vite un item
- Tap sur un item → sheet "Envoyer vers quelle liste ?"
- **Auto-add** : un nouvel item ajouté pour la première fois dans n'importe quelle liste rejoint automatiquement la Bibliothèque (suppression manuelle possible depuis la Bibliothèque pour les items mal saisis)

### 3.3 Module Socle (transversal)

**Authentification**
- Inscription email + mot de passe (ou magic link via Supabase Auth)
- Page de récupération de mot de passe

**Espace couple**
- À la première connexion, choix : *"créer un nouvel espace"* ou *"rejoindre un espace existant"*
- Création → génération d'un code d'invitation 6 chiffres (ou QR code)
- Rejoindre → saisie du code, l'autre personne valide depuis son tel
- Une fois liés, les listes/items/bibliothèque sont partagés entre les deux

**Profil**
- Prénom + couleur d'identité (parmi Sauge ou Brique pour la V1)
- Gestion des catégories (renommer, ajouter, supprimer, réordonner)
- Déconnexion
- Quitter l'espace couple (avec confirmation)

### 3.4 Hors scope V1 (à mémoriser pour plus tard)

| Feature | Cible | Pourquoi reporté |
|---|---|---|
| Module To-do (mes/ses/nos tâches) | V1.5 | Sortir V1 d'abord, vivre avec, puis ajouter |
| Items récurrents (lait chaque semaine) | V1.5 | Pas critique pour V1, on l'ajoutera quand on aura ressenti le besoin |
| Liste "type" auto-générée | V1.5 | Nécessite plusieurs mois de données d'usage |
| Livre de recettes + lien courses | V2 | Module à part entière |
| OCR photo Pinterest → recette | V2 | Dépend du livre de recettes + IA |
| IA vocale "vidage de cerveau" | V2 | Couche IA séparée, à brancher quand le socle est stable |
| Synchro Google/Apple Calendar | V2 | OAuth + APIs externes, gros chantier |
| Détection de conflits agenda | V2 | Dépend de la synchro calendrier |
| Modes spéciaux (vacances, urgence, dimanche soir) | V2+ | Prennent sens une fois la base solide |
| Accès femme de ménage / nounou | V2 | Nouveau type d'utilisateur = complexité d'auth supplémentaire |

### 3.5 Mode hors ligne (V1)

**Indispensable pour le cas d'usage principal** (faire les courses dans un sous-sol sans réseau).

- La consultation d'une liste fonctionne sans réseau
- Les modifications (cocher, ajouter, supprimer) sont mises en file d'attente
- À la reconnexion, synchronisation automatique avec gestion des conflits
- Indicateur visuel discret quand on est en mode hors ligne

---

## 4. Parcours utilisateurs

### 4.1 Parcours 1 — Première installation

Tu télécharges la PWA (installation depuis le navigateur, comme une vraie app). Tu crées un compte (email + mot de passe). À ta première connexion, l'appli te demande : *"Tu veux créer un nouvel espace couple, ou en rejoindre un ?"*. Tu crées l'espace, tu choisis ton prénom et ta couleur d'identité (sauge ou brique). L'appli génère un code d'invitation à 6 chiffres. Tu le partages à ta conjointe. Elle s'inscrit de son côté, entre le code, choisit son prénom et la couleur restante. Vous êtes liés. *Effort total : ~3 minutes à deux.*

### 4.2 Parcours 2 — Capture express ("faut racheter la lessive")

Tu es devant la machine à laver, tu réalises qu'il faut racheter de la lessive. Tu ouvres l'appli (installée en raccourci sur l'écran d'accueil grâce à la PWA). Tu arrives sur le **hub des listes**. Tu tap sur "Auchan". Tu vois le champ *"Ajouter un article…"* en haut. Tu tapes "lessive", tu valides. L'appli devine la catégorie "Entretien", l'ajoute, et tu refermes. *Effort total : ~5 secondes.*

### 4.3 Parcours 3 — Faire les courses (à deux, temps réel)

Tu arrives au Carrefour. Tu ouvres la liste "Auchan". Les items sont **groupés automatiquement par catégorie** (Fruits & Légumes → Viande & Poisson → Crémerie → Épicerie → etc.). Tu coches au fur et à mesure. Pendant ce temps, ta conjointe (qui fait le marché en parallèle) coche ses items à elle dans la liste "Marché". Si elle ajoute un item de dernière minute ("oh, du persil"), il apparaît chez toi en temps réel si c'est sur la même liste. Les items cochés glissent vers la section "Déjà pris" en bas, atténués.

### 4.4 Parcours 4 — Recatégoriser un item (avec mémoire)

Tu ajoutes "saumon fumé". L'appli le range en "Poisson" par défaut, mais toi tu veux le voir en "Surgelés" parce que c'est là que tu l'achètes. Tu maintiens un appui long sur l'item (ou via un menu "…"), tu modifies sa catégorie. L'appli sauvegarde cette préférence côté couple : la prochaine fois que toi ou ta conjointe ajoute "saumon fumé", il atterrit direct en "Surgelés", chez vous deux.

### 4.5 Parcours 5 — Construire sa liste de la semaine via la Bibliothèque

Dimanche soir, tu fais ta planif pour la semaine. Tu vas dans l'onglet **Bibliothèque**. Tu scrolles la catégorie "Épicerie" — les items les plus achetés (pâtes, riz, huile…) remontent en haut. Tu tap sur chacun → un sheet monte du bas demandant *"Envoyer vers quelle liste ?"* → tu choisis "Auchan". Tap, tap, tap. En 2 minutes, 80% de ta liste hebdo est faite.

---

## 5. Architecture fonctionnelle

### 5.1 Navigation

Une barre de navigation en bas, **3 onglets uniquement** :

1. **Listes** — hub d'accueil (toutes les listes du couple)
2. **Bibliothèque** — la liste maître des items déjà utilisés
3. **Profil** — compte, gestion du couple, gestion des catégories

Principe directeur : si on hésite à ajouter un 4e onglet, on le met en sous-page d'un onglet existant.

### 5.2 Catégories (de départ — modifiables par l'utilisateur)

**Alimentation**
- Fruits & Légumes
- Viande & Poisson
- Crémerie & Œufs
- Boulangerie
- Surgelés
- Épicerie
- Boissons

**Maison**
- Hygiène
- Entretien
- Papeterie

**Extérieur**
- Bricolage
- Jardinage

**Autre** — fourre-tout pour les items orphelins.

**12 catégories au total.** Toutes modifiables depuis le Profil (renommer, supprimer, ajouter, réordonner).

### 5.3 Couleurs personnes

Chaque membre du couple choisit l'une des deux couleurs d'identité à l'inscription :

- **Sauge** (#7B9E89) — vert apaisant
- **Brique** (#C5594A) — rouge terracotta

L'autre couleur revient automatiquement au conjoint. Cette couleur identifie qui a ajouté un item, qui a coché quoi, etc.

---

## 6. Direction visuelle

### 6.1 Identité

**Style :** *Riso Print* — esthétique inspirée de l'impression risographe / fanzine indépendant. Bordures encrées épaisses, ombres décalées, trame de demi-tons subtile en fond, palette à 2 couleurs (+ papier + encre).

**Pourquoi ce choix :** chaleureux et tactile sans être enfantin. Pas tech-froid. Ne ressemble pas à un outil de bureau. Vivable au quotidien sur des années sans fatiguer.

### 6.2 Palette — **Sauge & Brique**

| Rôle | Couleur | Hex |
|---|---|---|
| Papier (fond) | Crème | `#F0E5D0` |
| Papier clair (cartes) | Crème clair | `#FBF4E2` |
| Encre (texte, bordures) | Noir chaud | `#1A1410` |
| Encre soft (méta) | Marron-noir | `#5C4F40` |
| Spot 1 — accent | Brique | `#C5594A` |
| Spot 2 — secondaire | Sauge | `#7B9E89` |

**Usage des spots :**
- **Brique** : compteurs d'articles, item actif de la nav, accent dans les titres, avatar conjointe
- **Sauge** : avatar utilisateur principal, ombres décalées sur 50% des tuiles, bouton "+", trame de demi-tons en fond

### 6.3 Typographies

- **Display (titres, noms de listes, compteurs)** : **Silkscreen** — police bitmap tamponnée, free Google Fonts
- **UI & corps** : **Hanken Grotesk** — sans serif moderne, free Google Fonts, très lisible sur mobile
- **Code / mono** (pour usages techniques ponctuels) : **JetBrains Mono**

### 6.4 Composants — règles générales

- **Bordures** : 2px solide encre, partout
- **Ombres** : décalées 3-4px en bas-droite, en spot 1 ou spot 2 (alterner)
- **Coins** : légèrement arrondis (radius 8-14px max) — pas de carrés bruts ni de cercles parfaits
- **Trame de fond** : points en spot 2 à 15% d'opacité, espacés de 7px, en arrière-plan permanent
- **Zones tap** : minimum 44pt × 44pt sur mobile

### 6.5 Référence visuelle

Voir le fichier `maquettes_riso_palettes.html` (palette A), qui sert de référence visuelle officielle. Le rendu final s'inspire de cet écran d'accueil.

---

## 7. Mesure du succès (KPIs V1)

Pas d'analytics complexes — on est sur du perso. À ressentir/tracker mensuellement :

1. **Usage quotidien** — on ouvre l'appli au moins **5 jours sur 7 chacun**, sans relance externe.
2. **Désertion des outils concurrents** — on n'utilise plus du tout Notes / Keep / WhatsApp / post-its pour les courses.
3. **Réduction des oublis** — on revient du magasin sans *"j'ai oublié X"* au moins **8 fois sur 10**.

Si ces 3 indicateurs sont au vert après 2 mois d'utilisation, V1 est un succès et on peut attaquer V1.5 (To-do).

Si l'un est au rouge, on diagnostique avant d'enrichir : peut-être un défaut UX à corriger plutôt qu'une feature à ajouter.

---

## 8. Roadmap (vue d'ensemble)

### V1.0 — Courses (objectif : ~3-4 semaines de dev)
Tout ce qui est listé en Section 3.1 + 3.2 + 3.3 + 3.5.

### V1.5 — To-do + items récurrents (~2 semaines après V1)
- Module To-do : Mes / Ses / Nos
- Sections personnalisables dans le To-do
- Pièce jointe photo
- Tâches récurrentes
- Délégation simple (transférer à l'autre)
- **Bonus** : items récurrents dans Courses

### V2.0 — Recettes + IA (chantier majeur)
- Livre de recettes (markdown sauvegardable)
- Ajout d'un ingrédient à une liste depuis une recette en 1 tap
- OCR Pinterest → recette via IA
- Mode vocal "vidage de cerveau"

### V2.5 — Synchros externes
- Google Calendar / Apple Calendar
- Détection de conflits agenda
- Rappels intelligents

### V3.0 — Famille étendue
- Accès enfants
- Module femme de ménage
- Module nounou
- Modes spéciaux (vacances, urgence, dimanche soir)

---

## 9. Décisions architecturales clés

À préciser dans le document **Architecture** (étape suivante), mais à mémoriser ici comme principes directeurs :

- **Schéma de base "malléable"** : on prévoit des tables génériques (genre `attachments`, `recurrence_rules`) qui pourront servir aux futurs modules sans avoir à refaire le schéma.
- **Back-end modulaire** : chaque module (Courses, To-do, Recettes, Nounou…) sera isolé pour pouvoir être développé/désactivé/remplacé sans casser le reste.
- **Stack** : Next.js + Supabase. Tout en TypeScript pour la sécurité de typage.

---

## 10. Glossaire (pour débutant)

| Terme | Définition simple |
|---|---|
| **PWA** | Progressive Web App. Une appli web qu'on peut "installer" sur son téléphone et qui fonctionne comme une appli native, sans passer par l'App Store / Play Store. |
| **PRD** | Product Requirements Document. Le document que tu lis. Définit *quoi* construire et *pourquoi*. |
| **Hub** | Un écran qui sert de point d'entrée vers plusieurs sous-écrans. Notre écran d'accueil "Listes" est un hub. |
| **Persona** | Description fictionnelle d'un type d'utilisateur, qui aide à concevoir pour des personnes réelles plutôt qu'un "utilisateur moyen" abstrait. |
| **Sheet** | Une fenêtre qui apparaît en bas de l'écran (s'élève depuis le bas). Souvent utilisée pour proposer des choix sans changer d'écran. |
| **Temps réel** | Quand une modification faite par un utilisateur est visible chez l'autre en quelques secondes maximum, sans rafraîchir. |
| **Scope** | Le périmètre de ce qu'on construit pour une version donnée. "Hors scope" = pas dans cette version. |
| **Roadmap** | Plan dans le temps de ce qu'on va construire, version par version. |
| **KPI** | Key Performance Indicator. Indicateur de réussite. |
| **Supabase** | Service qui fournit base de données + authentification + temps réel + stockage de fichiers, prêt à l'emploi. |
| **Next.js** | Framework basé sur React pour construire des applications web modernes. Inclut front et back dans un même projet. |
| **TypeScript** | JavaScript avec des "types" en plus, qui permet d'attraper les erreurs dès l'écriture du code plutôt qu'à l'exécution. |
| **Auth** | Authentification. Le système de connexion / inscription / mots de passe. |
| **Synchro** | Synchronisation. Mécanisme qui garde les données alignées entre plusieurs appareils ou utilisateurs. |

---

*Fin du PRD V1.*
