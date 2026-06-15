# PRD V2 — Module To-do intégré

> Évolution du V1. À lire après `PRD_V1.md`. On ne réécrit pas les sections inchangées (vision, personas, etc.) — on ne décrit que les **ajouts et modifications**.

| | |
|---|---|
| **Version** | 2.0 |
| **Date** | Juin 2026 |
| **Statut** | ✅ Validé pour développement |
| **Référence V1** | `PRD_V1.md` |

---

## 1. Objectif de cette V2

Ajouter le module **To-do** à l'application, en l'**intégrant dans le même onglet "Listes"** que les courses. Une liste devient donc soit :
- une **liste de courses** (comportement V1 inchangé),
- une **to-do list** (nouveau).

On introduit aussi un nouveau concept transversal : la **liste partagée vs personnelle**. Une liste peut désormais être visible uniquement par toi, ou partagée avec ta conjointe.

---

## 2. Ce qu'on ajoute

### 2.1 Type de liste (courses / to-do)
Chaque liste a désormais un **type**, déterminé à sa création et non modifiable ensuite.

- **Liste de courses** : la V1 actuelle.
- **To-do list** : nouveau type.

Les deux types **cohabitent dans l'onglet "Listes"** mais sont **regroupés visuellement** (cf. 3.1) : section to-do en haut, section courses en bas. Chaque section est introduite par une **icône simple alignée à gauche** (checklist pour to-do, caddie pour courses), sans cadre ni encadré. Les tuiles elles-mêmes n'ont plus d'icône de type — c'est l'icône de section qui porte cette info.

### 2.2 Partage individuel par liste
À la création d'une liste, l'utilisateur choisit si elle est :
- **Partagée** : visible et modifiable par les deux membres du couple.
- **Personnelle** : visible uniquement par le créateur.

Les listes partagées portent **un petit logo "partagé"** discret dans le coin (icône à choisir dans le DS).

### 2.3 Modal "Nouvelle liste"
Le bouton `+` (déjà existant en haut à droite de l'onglet Listes) ouvre désormais une **sheet** qui demande :
1. **Type** : Courses ou To-do (deux gros boutons côte à côte)
2. **Nom** de la liste (champ texte)
3. **Partage** : checkbox "Partager avec ma conjointe" (cochée par défaut)
4. Bouton "Créer"

### 2.4 Tâches (contenu d'une to-do list)

Chaque tâche a :
- Un **titre** (obligatoire, texte court)
- Une **échéance** (date, optionnelle)
- Un **état** : à faire / fait
- Métadonnées : qui a ajoutée, qui a cochée, dates

**Pas de description longue, pas d'assignation, pas de récurrence en V2.**

### 2.5 États visuels d'une tâche
- **Normale** : à faire, sans échéance ou échéance future > 24h.
- **Bientôt due** : échéance dans les 24h. Étiquette discrète "AUJOURD'HUI" ou "DEMAIN" en sauge.
- **En retard** : échéance passée. Bordure gauche brique épaisse + titre en brique + étiquette "EN RETARD" en Silkscreen.
- **Faite** : titre barré, opacité réduite, glisse dans la section "Fait" en bas de la liste.

### 2.6 Section "Fait" + Historique
- Sur l'écran d'une to-do list, en bas, une section **"Fait"** (collapsible) montre les **10 dernières tâches cochées**.
- Au-delà, les tâches plus anciennes vont dans un **"Historique des tâches"** accessible depuis l'onglet **Profil**.
- L'historique permet de relire ce qu'on a accompli, par liste, sans encombrer la vue active.

---

## 3. Modifications à l'existant

### 3.1 Onglet Listes (hub)
- Affiche **toutes les listes** du couple, **regroupées par type** : to-do en premier, courses ensuite.
- Chaque groupe est introduit par une **icône simple alignée à gauche** (`section-marker`) : checklist pour to-do, caddie pour courses. Sans cadre.
- Si un groupe est vide (par exemple aucune to-do encore créée), son icône est masquée — pas de section vide.
- À l'intérieur d'un groupe, les listes sont ordonnées selon leur position (par défaut : ordre de création, modifiable par l'utilisateur).
- Chaque tuile arbore son icône "partagé" (en haut à droite) si applicable.
- Le bouton `+` ouvre le nouveau modal de création (cf. 2.3).

### 3.2 Onglet Profil
Nouvelle section : **"Historique des tâches"**. Liste les tâches archivées (au-delà des 10 récentes), regroupées par to-do list d'origine, du plus récent au plus ancien.

### 3.3 Intérieur d'une to-do list
Nouvel écran (sœur de l'écran "Liste de courses" mais adapté) :
- En haut : titre, retour, indicateur partagé éventuel, icône crayon (pour renommer)
- Bandeau "Ajouter une tâche…" (équivalent du "Ajouter un article…")
- Liste des tâches non cochées, triées par échéance (les en retard en premier, puis les bientôt dues, puis les sans échéance)
- En bas : section "Fait" (10 dernières)

---

## 4. Hors scope V2

| Feature | Cible | Pourquoi reporté |
|---|---|---|
| Assignation d'une tâche à une personne (accept/refuse) | V3 | Complexifie l'UX. À évaluer après usage réel. |
| Tâches récurrentes (poubelles le mardi, etc.) | V3 | Réutilisera la table `recurrence_rules` qu'on créera à ce moment. |
| Description longue / notes sur une tâche | V2.1 si demandé | Pas nécessaire d'emblée. |
| Pièces jointes (photos sur tâche) | V3 | Nécessite la table `attachments` (à créer plus tard). |
| Notifications push (rappel d'échéance) | V3 | Chantier d'infrastructure séparé. |
| Sous-tâches | hors roadmap actuelle | Apporte de la complexité pour peu de valeur. |

---

## 5. Parcours utilisateurs nouveaux

### 5.1 Parcours — Créer une to-do list personnelle
Tu es dans l'onglet Listes. Tu tap sur `+`. Le modal s'ouvre. Tu choisis **"To-do"**, tu tapes "Démarches admin", tu **décoches** la case "Partager avec ma conjointe", tu valides. La liste apparaît dans le hub avec l'icône checklist (mais sans icône partagé — elle est perso).

### 5.2 Parcours — Ajouter une tâche avec échéance
Tu tap sur la to-do list "Démarches admin". L'écran s'ouvre. Tu tap "Ajouter une tâche…", tu tapes "Renvoyer formulaire CAF", tu tap sur l'icône calendrier, tu choisis "Vendredi". La tâche s'ajoute en haut, marquée "VENDREDI" en discrétion. Si on est jeudi soir, l'étiquette devient "DEMAIN" en sauge.

### 5.3 Parcours — Tâche en retard
La tâche "Renvoyer formulaire CAF" était due vendredi. Lundi, tu rouvres la liste : la tâche est désormais marquée **bordure brique à gauche** + titre **rouge brique** + petite étiquette **"EN RETARD"** en Silkscreen. Visible instantanément en ouvrant la liste.

### 5.4 Parcours — Cocher une tâche faite
Tu coches "Renvoyer formulaire CAF". La tâche se barre, glisse dans la section "Fait" en bas. Si tu changes d'avis dans la journée, tu peux la décocher : elle remonte. Si tu attends quelques jours, elle finit dans l'Historique du Profil quand 10 nouvelles tâches l'ont remplacée.

### 5.5 Parcours — Consulter l'historique
Tu vas dans l'onglet Profil. Tu tap sur "Historique des tâches". Tu vois tes tâches anciennes groupées par to-do list, chronologiquement décroissant.

---

## 6. Mesure du succès V2

À ressentir mensuellement (après 1-2 mois d'usage) :

1. **Mixité d'usage** — tu utilises *à la fois* courses et to-do dans l'appli (pas que l'un des deux).
2. **Désertion des outils to-do concurrents** — plus de notes pour les tâches perso, plus de post-its sur le frigo.
3. **Réduction des tâches "en retard"** — au fil du temps, le nombre de tâches "EN RETARD" baisse (signe que l'appli aide à les voir et les traiter).

---

## 7. Décisions à valider avant le dev

- [ ] L'icône "partagé" : choix entre 3 propositions dans `DESIGN_SYSTEM_V2.md`.
- [ ] Les hypothèses de scope (cf. 2.4 et 4) sont OK ?
- [ ] Le tri des tâches non cochées (en retard → bientôt due → autres) te paraît bon, ou tu préfères tri manuel (drag & drop) ?

---

*Fin du PRD V2.*
