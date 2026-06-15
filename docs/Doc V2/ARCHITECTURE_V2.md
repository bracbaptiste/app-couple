# ARCHITECTURE V2 — Module To-do

> Évolution de `ARCHITECTURE.md` (V1). Décrit uniquement les **changements et ajouts**. Tout le reste (socle Supabase, structure des dossiers, hors ligne, etc.) reste valide.

| | |
|---|---|
| **Version** | 2.0 |
| **Date** | Juin 2026 |
| **Référence V1** | `ARCHITECTURE.md` |

---

## 1. Vue d'ensemble des changements

### Modifications de schéma
1. **Table `lists`** : ajout de 3 colonnes (`kind`, `is_shared`, `owner_id`)
2. **Nouvelle table `tasks`** : contient les tâches d'une to-do list
3. **Mise à jour des politiques RLS** pour gérer le partage individuel

### Nouvelles règles métier
1. Filtrage des listes selon `is_shared` et `owner_id`
2. Calcul de l'état d'une tâche (à faire / bientôt due / en retard / faite)
3. Tri automatique des tâches à faire
4. Règle d'archivage : on garde les 10 dernières cochées dans la vue active, le reste va dans l'historique

---

## 2. Migration SQL

> À appliquer dans Supabase via une migration. Ordre important.

```sql
-- ============ ÉTAPE 1 : modifier la table lists ============

-- 1.1 Ajout du type de liste (courses ou to-do)
alter table lists
  add column kind text not null default 'courses'
  check (kind in ('courses', 'todo'));

-- 1.2 Ajout du partage individuel et du propriétaire
alter table lists
  add column is_shared boolean not null default true;

alter table lists
  add column owner_id uuid references profiles(id) on delete set null;

-- 1.3 Migration : les listes existantes sont partagées et de type courses
-- (rien à faire, les défauts ci-dessus s'en occupent pour les futures
-- créations ; les lignes existantes prennent les valeurs par défaut
-- au moment de l'ALTER. À vérifier après migration.)

-- 1.4 Renseigner owner_id pour toutes les listes existantes (= created_by)
update lists set owner_id = created_by where owner_id is null;

-- 1.5 Contrainte : une liste personnelle doit avoir un owner
alter table lists
  add constraint lists_owner_required_if_personal
  check (is_shared = true or owner_id is not null);

-- ============ ÉTAPE 2 : créer la table tasks ============

create table tasks (
  id           uuid primary key default gen_random_uuid(),
  list_id      uuid not null references lists(id) on delete cascade,
  title        text not null,
  due_date     date,                       -- échéance optionnelle (date sans heure)
  is_done      boolean not null default false,
  done_at      timestamptz,                -- rempli quand is_done passe à true
  added_by     uuid references profiles(id),
  done_by      uuid references profiles(id),
  position     int not null default 0,     -- ordre manuel si souhaité
  created_at   timestamptz default now()
);

-- index pour les requêtes fréquentes
create index tasks_list_id_idx     on tasks(list_id);
create index tasks_is_done_idx     on tasks(is_done);
create index tasks_due_date_idx    on tasks(due_date) where due_date is not null;

-- ============ ÉTAPE 3 : activer RLS sur tasks ============

alter table tasks enable row level security;
```

---

## 3. Nouvelles politiques RLS

### 3.1 Mise à jour des politiques sur `lists`

> On remplace les politiques V1 par les nouvelles, plus précises.

> ⚠️ **Correction (appliqué dans la migration `20260615093000_v2_rls_lists_tasks.sql`)** —
> deux écarts par rapport à la première rédaction de cette section :
>
> 1. **`current_couple_id()` existe déjà depuis la V1** (`init_v1_schema` §4.1) en
>    version **durcie** : `security definer` + `set search_path = public`. Le
>    `security definer` est indispensable pour éviter la **récursion RLS infinie**
>    sur `profiles` (dont les policies s'appuient sur cette fonction). La version
>    naïve `language sql stable` ci-dessous **ne doit pas** être utilisée : c'est
>    une régression de sécurité qui casse les policies de `profiles`. On reconduit
>    la version V1 à l'identique.
> 2. **Les noms des anciennes policies V1 étaient faux.** Les vrais noms en base
>    sont `lists_select_own_couple`, `lists_insert_own_couple`,
>    `lists_update_own_couple`, `lists_delete_own_couple` (pas les libellés
>    français). Il faut dropper ces noms-là, sinon les anciennes policies
>    permissives survivent et **fuitent les listes perso** d'un autre user.

```sql
-- Helper : SQL function pour récupérer le couple de l'utilisateur connecté.
-- ⚠️ Existe déjà en V1 : on reconduit la version DURCIE (security definer +
-- search_path), PAS la version naïve. Sans security definer → récursion RLS
-- infinie sur profiles.
create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

-- Drop des anciennes politiques V1 sur lists (VRAIS noms créés en V1)
drop policy if exists "lists_select_own_couple" on lists;
drop policy if exists "lists_insert_own_couple" on lists;
drop policy if exists "lists_update_own_couple" on lists;
drop policy if exists "lists_delete_own_couple" on lists;

-- SELECT : on voit les listes partagées du couple + ses propres listes perso
create policy "lire les listes accessibles"
on lists for select
using (
  couple_id = current_couple_id()
  and (is_shared = true or owner_id = auth.uid())
);

-- INSERT : on crée pour son couple. Si perso, owner_id = soi.
create policy "créer une liste"
on lists for insert
with check (
  couple_id = current_couple_id()
  and (is_shared = true or owner_id = auth.uid())
);

-- UPDATE / DELETE : pareil que SELECT
create policy "modifier les listes accessibles"
on lists for update
using (
  couple_id = current_couple_id()
  and (is_shared = true or owner_id = auth.uid())
);

create policy "supprimer les listes accessibles"
on lists for delete
using (
  couple_id = current_couple_id()
  and (is_shared = true or owner_id = auth.uid())
);
```

### 3.2 Politiques sur `tasks`

```sql
-- On accède aux tâches via la liste parente. La liste filtre déjà.
create policy "lire les tâches des listes accessibles"
on tasks for select
using (
  list_id in (
    select id from lists
    where couple_id = current_couple_id()
      and (is_shared = true or owner_id = auth.uid())
  )
);

create policy "créer une tâche dans une liste accessible"
on tasks for insert
with check (
  list_id in (
    select id from lists
    where couple_id = current_couple_id()
      and (is_shared = true or owner_id = auth.uid())
  )
);

create policy "modifier une tâche d'une liste accessible"
on tasks for update
using (
  list_id in (
    select id from lists
    where couple_id = current_couple_id()
      and (is_shared = true or owner_id = auth.uid())
  )
);

create policy "supprimer une tâche d'une liste accessible"
on tasks for delete
using (
  list_id in (
    select id from lists
    where couple_id = current_couple_id()
      and (is_shared = true or owner_id = auth.uid())
  )
);
```

### 3.3 Vérification que `list_items` reste compatible

Les politiques V1 sur `list_items` filtraient via la liste parente. Comme `lists` a maintenant des règles plus strictes (partage), `list_items` hérite automatiquement de ces règles. **Rien à modifier sur `list_items`.**

---

## 4. Logique métier

### 4.1 Calcul de l'état d'une tâche

Côté client (TypeScript) :

```ts
type TaskState = 'todo' | 'soon' | 'overdue' | 'done';

function getTaskState(task: Task, now: Date = new Date()): TaskState {
  if (task.is_done) return 'done';
  if (!task.due_date) return 'todo';

  const due = new Date(task.due_date);
  const diffHours = (due.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 0) return 'overdue';
  if (diffHours < 24) return 'soon';
  return 'todo';
}
```

### 4.2 Étiquette d'échéance lisible

```ts
function getDueLabel(date: Date, now: Date = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dueDay < today)         return 'EN RETARD';
  if (+dueDay === +today)     return "AUJOURD'HUI";
  if (+dueDay === +tomorrow)  return 'DEMAIN';
  // Sinon, format jour de semaine ou date
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
    .format(date)
    .toUpperCase();
}
```

### 4.3 Tri des tâches à faire (non cochées)

Ordre d'affichage dans la liste :
1. Tâches **en retard**, de la plus ancienne échéance à la plus récente
2. Tâches **bientôt dues** (échéance dans 24h)
3. Tâches avec échéance future, par date croissante
4. Tâches sans échéance, par ordre de création (les plus récentes d'abord)

```ts
function sortPendingTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    // Tâches sans échéance vont à la fin
    if (!a.due_date && !b.due_date) return b.created_at.localeCompare(a.created_at);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}
```

### 4.4 Section "Fait" et historique

Côté client, on récupère **les 11 dernières tâches cochées** d'une liste (10 affichées + 1 pour savoir s'il y a plus). Les 10 sont affichées dans la section "Fait". Les tâches au-delà restent en base mais ne sont pas chargées sur l'écran de la liste — elles apparaissent dans l'écran "Historique des tâches" du Profil.

```sql
-- Pour la section "Fait" d'une liste précise
select * from tasks
where list_id = $1 and is_done = true
order by done_at desc
limit 10;

-- Pour l'historique (Profil), avec pagination
select t.*, l.name as list_name
from tasks t
join lists l on l.id = t.list_id
where l.couple_id = current_couple_id()
  and (l.is_shared = true or l.owner_id = auth.uid())
  and t.is_done = true
order by t.done_at desc
limit 50 offset $1;
```

> Pas besoin d'archivage physique en V2 : on garde tout en base, on filtre à l'affichage. Si la table grossit énormément (plusieurs années), on envisagera un mécanisme d'archivage en V3+.

### 4.5 Création d'une liste (côté client)

```ts
async function createList(input: {
  name: string;
  kind: 'courses' | 'todo';
  isShared: boolean;
}) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, couple_id')
    .eq('id', user.id)
    .single();

  return supabase.from('lists').insert({
    name: input.name,
    kind: input.kind,
    is_shared: input.isShared,
    couple_id: profile.couple_id,
    owner_id: input.isShared ? null : profile.id,
    created_by: profile.id,
  }).select().single();
}
```

---

## 5. Temps réel (Realtime)

Aucun changement structurel. On ajoute simplement la table `tasks` aux abonnements existants :

```ts
supabase
  .channel('tasks-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'tasks' },
    (payload) => { /* mise à jour du cache local */ }
  )
  .subscribe();
```

Les politiques RLS s'appliquent automatiquement aux événements Realtime : un utilisateur ne reçoit que les changements sur les tâches des listes auxquelles il a accès.

---

## 6. Stratégie hors ligne (rappel)

Les `tasks` suivent la même stratégie que `list_items` :
- Cache local IndexedDB
- Mises à jour optimistes
- File d'attente hors ligne
- "Dernier qui écrit gagne" en cas de conflit

Pas de logique particulière à ajouter pour V2.

---

## 7. Nouveaux dossiers à créer dans le projet

```
src/
├── app/(app)/lists/[listId]/
│   ├── page.tsx                # déjà existant (liste de courses)
│   └── todo/                   # NOUVEAU : intérieur d'une to-do list
│       └── page.tsx
│       # ou alors : on détecte le type au niveau de page.tsx
│       # et on render le bon composant. À voir avec Claude Code.
│
├── app/(app)/profile/
│   ├── page.tsx                # déjà existant
│   └── history/                # NOUVEAU : historique des tâches
│       └── page.tsx
│
├── components/
│   ├── lists/                  # existant
│   │   ├── NewListSheet.tsx    # NOUVEAU : modal de création
│   │   └── ListTypeIcon.tsx    # NOUVEAU : caddie ou checklist
│   ├── todo/                   # NOUVEAU dossier complet
│   │   ├── TaskItem.tsx
│   │   ├── AddTaskBar.tsx
│   │   ├── DueBadge.tsx
│   │   └── DonePanel.tsx
│   └── shared/
│       └── SharedBadge.tsx     # NOUVEAU : indicateur "partagé"
│
└── lib/hooks/
    ├── useTasks.ts             # NOUVEAU
    ├── useTaskState.ts         # NOUVEAU (calcul d'état + label)
    └── useTaskHistory.ts       # NOUVEAU
```

---

## 8. Ordre de construction conseillé pour V2

1. **Migration de schéma** (les SQL de la section 2) + RLS (section 3). Validation : un user de test ne peut pas voir une liste perso d'un autre user.
2. **Modal "Nouvelle liste"** sur l'onglet Listes. Validation : on peut créer les 4 combinaisons (courses partagée, courses perso, to-do partagée, to-do perso).
3. **Tuile mise à jour** (icône type + icône partagé).
4. **Routage** : selon le `kind` de la liste, on route vers l'écran courses (existant) ou to-do (nouveau).
5. **Écran To-do list** + composants tâche (TaskItem, AddTaskBar, DueBadge).
6. **Section "Fait"** + DonePanel.
7. **Page Historique** dans le Profil.
8. **Realtime** sur tasks.
9. **Hors ligne** : étendre le cache et la file d'attente aux tasks.

---

*Fin de l'ARCHITECTURE V2.*
