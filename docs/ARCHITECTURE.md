# ARCHITECTURE — App couple (V1 Courses)

> Document technique. Décrit *comment* on construit ce que le PRD décrit. À lire avec `PRD_V1.md`. C'est la référence que Claude Code consulte avant d'écrire du code.

| | |
|---|---|
| **Version** | 1.0 |
| **Date** | Mai 2026 |
| **Stack** | Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Supabase · PWA |
| **Hébergement** | Vercel (front + API) · Supabase (base + auth + stockage) |

---

## 1. Vue d'ensemble de la stack

```
┌─────────────────────────────────────────────┐
│  TON TÉLÉPHONE (PWA installée)                │
│  ┌─────────────────────────────────────────┐  │
│  │  Next.js (React) + Tailwind + shadcn/ui  │  │
│  │  + cache local (mode hors ligne)         │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────┐
│  SUPABASE                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Postgres │ │   Auth   │ │ Temps réel + │  │
│  │ (la base)│ │ (login)  │ │   stockage   │  │
│  └──────────┘ └──────────┘ └──────────────┘  │
└─────────────────────────────────────────────┘
```

**Qui fait quoi :**
- **Next.js** : tout ce que tu vois (les écrans) + la logique côté serveur si besoin.
- **Supabase** : stocke les données, gère le login, pousse les modifs en temps réel, stocke les fichiers (photos, en V1.5+).
- **Vercel** : héberge l'appli Next.js, accessible depuis n'importe quel navigateur.

---

## 2. Schéma de la base de données

> Référence visuelle : `schema_relationnel_v1.html` et `schema_bdd_v1.html`.

### 2.1 Tables (V1)

Voici les définitions, en SQL commenté. Claude Code les transformera en migrations Supabase.

```sql
-- ============ SOCLE ============

-- couples : l'espace partagé (la racine de tout)
create table couples (
  id           uuid primary key default gen_random_uuid(),
  name         text,                       -- optionnel, ex "Maison Brac"
  invite_code  text unique not null,       -- code à 6 chiffres pour rejoindre
  created_by   uuid,                       -- FK ajoutée après (réf circulaire)
  created_at   timestamptz default now()
);

-- profiles : infos appli de chaque utilisateur
-- Le compte + mot de passe sont gérés par Supabase dans auth.users.
-- profiles.id = auth.users.id (même identifiant).
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,             -- prénom affiché
  color         text not null check (color in ('sauge','brique')),
  couple_id     uuid references couples(id) on delete set null,
  created_at    timestamptz default now()
);

-- On ajoute le lien couples.created_by -> profiles maintenant que profiles existe
alter table couples
  add constraint couples_created_by_fkey
  foreign key (created_by) references profiles(id);

-- categories : les rayons, personnalisables par couple
create table categories (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  name       text not null,                -- ex "Fruits & Légumes"
  position   int not null default 0,       -- ordre d'affichage
  created_at timestamptz default now()
);

-- ============ MODULE COURSES ============

-- lists : une liste de courses (Auchan, Marché…)
create table lists (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references couples(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- library_items : la mémoire — chaque produit déjà utilisé une fois
create table library_items (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references couples(id) on delete cascade,
  name         text not null,
  category_id  uuid references categories(id) on delete set null,
  usage_count  int not null default 1,     -- pour le tri par fréquence
  last_used_at timestamptz default now(),
  created_at   timestamptz default now(),
  unique (couple_id, name)                 -- pas de doublon de produit par couple
);

-- list_items : un article présent dans une liste précise
create table list_items (
  id              uuid primary key default gen_random_uuid(),
  list_id         uuid not null references lists(id) on delete cascade,
  library_item_id uuid not null references library_items(id) on delete cascade,
  is_checked      boolean not null default false,
  added_by        uuid references profiles(id),
  checked_by      uuid references profiles(id),
  checked_at      timestamptz,
  quantity        text,                     -- optionnel, ex "2 kg" ou "x3"
  note            text,                     -- optionnel
  created_at      timestamptz default now()
);
```

### 2.2 Logique d'ajout d'un article (important)

Quand l'utilisateur tape un article (ex "lessive") dans une liste :

1. Chercher si un `library_item` nommé "lessive" existe déjà pour ce couple.
2. **S'il existe** → créer un `list_item` qui pointe vers lui, et incrémenter son `usage_count` + `last_used_at`.
3. **S'il n'existe pas** → créer un nouveau `library_item` (auto-add à la Bibliothèque), deviner sa catégorie (voir 2.3), puis créer le `list_item`.

### 2.3 Deviner la catégorie d'un nouvel article

Pour la V1, une petite table de correspondance mots-clés → catégorie, en dur dans le code. Exemples :
- "lait", "yaourt", "beurre", "œuf" → Crémerie & Œufs
- "lessive", "éponge", "javel" → Entretien
- "pomme", "tomate", "salade" → Fruits & Légumes
- etc.

Si aucun mot-clé ne correspond → catégorie **Autre**. L'utilisateur peut toujours recatégoriser (et la mémoire enregistre son choix).

---

## 3. Sécurité — Row Level Security (RLS)

**Principe :** chaque table a des "politiques" qui filtrent les lignes accessibles selon l'utilisateur connecté. La règle universelle ici : *on n'accède qu'aux données de son propre couple.*

Cette protection vit dans la base de données, pas dans le code de l'appli. Donc un bug côté front ne peut pas exposer les données d'un autre couple.

### Exemple de politiques (pour la table `lists`)

```sql
-- 1. Activer RLS sur la table
alter table lists enable row level security;

-- 2. Lecture : on ne voit que les listes de son couple
create policy "lire les listes de son couple"
on lists for select
using (
  couple_id = (select couple_id from profiles where id = auth.uid())
);

-- 3. Création : on ne peut créer une liste que pour son couple
create policy "créer une liste pour son couple"
on lists for insert
with check (
  couple_id = (select couple_id from profiles where id = auth.uid())
);

-- 4. Modification / suppression : idem
create policy "modifier les listes de son couple"
on lists for update
using (couple_id = (select couple_id from profiles where id = auth.uid()));

create policy "supprimer les listes de son couple"
on lists for delete
using (couple_id = (select couple_id from profiles where id = auth.uid()));
```

> `auth.uid()` = l'identifiant de l'utilisateur connecté, fourni automatiquement par Supabase.

**À faire pour CHAQUE table** (categories, lists, library_items, list_items) : activer RLS + politiques équivalentes. Pour `list_items`, le filtrage passe par la liste parente (on vérifie que la liste appartient au couple).

---

## 4. Authentification (le login)

### 4.1 Technologie
**Supabase Auth.** On ne gère jamais les mots de passe nous-mêmes ; Supabase les stocke chiffrés. Méthodes : email + mot de passe (V1), avec option magic link possible plus tard.

### 4.2 Flux d'inscription

```
1. Utilisateur saisit email + mot de passe
2. Supabase crée un compte dans auth.users
3. Un "trigger" (déclencheur automatique) crée une ligne dans profiles
4. Première connexion → écran "Créer ou rejoindre un espace couple ?"
   ├── CRÉER  → génère un couple + invite_code → l'utilisateur choisit prénom + couleur
   └── REJOINDRE → saisie de l'invite_code → rattachement au couple existant
```

Le trigger qui crée le profil automatiquement (à mettre dans Supabase) :

```sql
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, color)
  values (new.id, '', 'sauge');  -- prénom/couleur complétés à l'onboarding
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### 4.3 Protection des pages

Les pages du groupe `(app)` (listes, bibliothèque, profil) sont accessibles uniquement si connecté. Une vérification de session redirige vers `/login` sinon.

---

## 5. Structure des dossiers

```
mon-app/
├── docs/                       # Documentation du projet
│   ├── PRD_V1.md
│   ├── ARCHITECTURE.md         # ce fichier
│   └── DESIGN_SYSTEM.md        # (à venir)
│
├── public/                     # fichiers statiques
│   ├── manifest.json           # config PWA (nom, icônes…)
│   └── icons/                  # icônes de l'app
│
├── src/
│   ├── app/                    # LES PAGES (Next.js App Router)
│   │   ├── (auth)/             # groupe : pages avant connexion
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── signup/
│   │   │       └── page.tsx
│   │   ├── (app)/              # groupe : pages après connexion
│   │   │   ├── lists/
│   │   │   │   ├── page.tsx           # onglet Listes (hub)
│   │   │   │   └── [listId]/
│   │   │   │       └── page.tsx       # une liste précise
│   │   │   ├── library/
│   │   │   │   └── page.tsx           # onglet Bibliothèque
│   │   │   ├── profile/
│   │   │   │   └── page.tsx           # onglet Profil
│   │   │   └── layout.tsx             # layout avec la nav du bas
│   │   ├── layout.tsx          # layout racine (polices, thème)
│   │   └── globals.css         # styles globaux + variables couleur
│   │
│   ├── components/             # COMPOSANTS RÉUTILISABLES
│   │   ├── ui/                 # composants shadcn (Button, Input, Sheet…)
│   │   ├── lists/              # ListTile, ListItem, AddItemBar…
│   │   ├── library/            # LibraryItem, SendToListSheet…
│   │   └── shared/             # Avatar, BottomNav, CategoryHeader…
│   │
│   ├── lib/                    # CODE UTILITAIRE
│   │   ├── supabase/           # config + client Supabase
│   │   │   ├── client.ts       # client côté navigateur
│   │   │   └── server.ts       # client côté serveur
│   │   ├── hooks/              # hooks React custom (useLists, useLibrary…)
│   │   ├── offline/            # logique de cache et synchro hors ligne
│   │   └── utils/              # fonctions diverses (devine-catégorie…)
│   │
│   └── types/                  # DÉFINITIONS TYPESCRIPT
│       └── database.ts         # types générés depuis le schéma Supabase
│
├── package.json                # dépendances du projet
├── tailwind.config.ts          # config Tailwind (couleurs Sauge & Brique)
├── next.config.js              # config Next.js (+ PWA)
└── tsconfig.json               # config TypeScript
```

**Principe directeur :** on range par *type* (pages / composants / utilitaires) puis par *feature* (lists / library). Quand on ajoutera le module To-do en V1.5, on créera `app/(app)/todos/`, `components/todos/`, `lib/hooks/useTodos.ts` — sans toucher au reste.

---

## 6. Stratégie hors ligne

> C'est la partie techniquement la plus délicate de la V1. À traiter avec soin.

### 6.1 Objectif
Pouvoir **consulter et cocher** ses listes sans réseau (cas : supermarché en sous-sol), avec synchro automatique au retour du réseau.

### 6.2 Approche

1. **Cache local** : les données (listes, articles, bibliothèque) sont stockées localement sur le téléphone via le navigateur (IndexedDB). À l'ouverture, on affiche d'abord le cache, puis on rafraîchit depuis Supabase.

2. **Mises à jour optimistes** : quand tu coches un article, l'interface réagit *immédiatement* (sans attendre le serveur). La modif est envoyée en arrière-plan.

3. **File d'attente hors ligne** : si pas de réseau, les modifs (cocher, ajouter, supprimer) sont stockées dans une file locale, puis rejouées dès la reconnexion.

4. **Résolution de conflits** : règle simple "dernier qui écrit gagne" (last-write-wins) pour la V1. Suffisant pour un couple (faible probabilité de modifier exactement la même chose au même instant).

5. **Indicateur visuel** : un badge discret signale quand on est hors ligne.

### 6.3 Outils envisagés
- **TanStack Query** + persistance pour le cache et les mutations optimistes.
- Le temps réel Supabase pour le rafraîchissement quand on est en ligne.
- Possibilité d'évaluer **PowerSync** plus tard si le besoin offline devient critique, mais on commence simple.

### 6.4 Phasage conseillé
- **Étape 1** (dans V1) : cache lecture + mises à jour optimistes + file d'attente basique.
- **Étape 2** (si besoin après usage réel) : durcir la gestion des conflits.

---

## 7. Principes de malléabilité (pour les futurs modules)

1. **Tout pend de `couples`.** Chaque nouveau module crée des tables avec une colonne `couple_id`. Le socle (couples, profiles) ne change jamais.

2. **Tables génériques prévues** (à créer au moment voulu, pas avant) :
   - `attachments` — pièces jointes polymorphes (peut s'attacher à une tâche To-do en V1.5, à une recette en V2). Colonnes : `id`, `couple_id`, `entity_type` ('task'|'recipe'|…), `entity_id`, `file_url`, `created_at`.
   - `recurrence_rules` — règles de récurrence réutilisables (article récurrent OU tâche récurrente). Colonnes : `id`, `couple_id`, `entity_type`, `entity_id`, `frequency`, `next_occurrence`.

3. **Back-end modulaire.** Chaque module (Courses, To-do, Recettes…) a ses propres dossiers et hooks isolés. On peut développer, désactiver ou remplacer un module sans casser les autres.

4. **Types générés automatiquement.** On génère les types TypeScript depuis le schéma Supabase. Quand le schéma change, les types suivent, et Claude Code détecte immédiatement les incohérences.

---

## 8. Comment on greffera les futurs modules

| Module | Nouvelles tables | Réutilise |
|---|---|---|
| **To-do (V1.5)** | `tasks`, `task_sections` | `couples`, `profiles`, `attachments`, `recurrence_rules` |
| **Recettes (V2)** | `recipes`, `recipe_ingredients` | `couples`, `library_items` (lien ingrédient→produit), `attachments` |
| **Nounou (V2)** | `nanny_infos`, `emergency_contacts` | `couples`, `profiles` |
| **Femme de ménage (V2)** | `cleaning_templates`, `cleaning_notes` | `couples`, `library_items` (produits à racheter) |

Chaque ajout = nouvelles tables + nouvelles politiques RLS + nouveaux dossiers. Le socle reste intact.

---

## 9. Ordre de construction conseillé (pour le dev)

1. **Setup** : créer le projet Next.js, installer Supabase, Tailwind, shadcn.
2. **Base de données** : créer les tables + RLS dans Supabase.
3. **Auth** : inscription / connexion / onboarding couple.
4. **Écran le plus simple d'abord** : le Profil (peu d'interactions, idéal pour roder le workflow avec Claude Code).
5. **Listes** : hub + intérieur d'une liste + ajout/cochage.
6. **Bibliothèque** : affichage + envoi vers liste.
7. **Temps réel** : brancher la synchro live.
8. **Hors ligne** : cache + file d'attente.
9. **PWA** : manifest + installabilité + icônes.

---

*Fin du document Architecture.*
