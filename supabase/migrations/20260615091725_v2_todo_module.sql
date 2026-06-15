-- ============ ÉTAPE 0 : nettoyer la table tasks legacy ============
-- Une table `tasks` (modèle « tâches du couple », assigned_to) avait été créée
-- à la main hors migrations, avec un schéma incompatible avec la V2 (qui rattache
-- les tâches à une liste). Elle est vide (0 ligne) et non référencée. On la supprime
-- pour repartir sur le modèle V2 décrit dans ARCHITECTURE_V2 §2.
drop table if exists tasks cascade;

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
