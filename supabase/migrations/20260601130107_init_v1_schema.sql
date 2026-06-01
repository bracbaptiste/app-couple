-- ============================================================================
-- App Couple — Migration initiale V1 (Module Courses)
-- ----------------------------------------------------------------------------
-- Référence : docs/ARCHITECTURE.md §2 (schéma), §3 (RLS), §4.2 (trigger profil)
--             docs/PRD_V1.md §5.2 (catégories), §5.3 (couleurs)
--
-- Contenu :
--   1. Extensions
--   2. Tables socle      : couples, profiles, categories
--   3. Tables courses    : lists, library_items, list_items
--   4. Fonctions helper  : current_couple_id, generate_invite_code,
--                          handle_new_user (trigger), join_couple_with_code,
--                          create_default_categories
--   5. RLS + policies (chaque utilisateur n'accède qu'aux données de son couple)
--
-- Hors scope V1 (NE PAS créer ici) : tasks, recipes, attachments,
--   recurrence_rules — viendront avec les modules V1.5 / V2.
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
-- gen_random_uuid() est natif depuis PostgreSQL 13, mais on s'assure que
-- pgcrypto est présent (Supabase l'active par défaut).
create extension if not exists "pgcrypto";


-- ============================================================================
-- 2. TABLES SOCLE
-- ============================================================================

-- couples : l'espace partagé, racine de toutes les données du couple.
create table public.couples (
  id          uuid primary key default gen_random_uuid(),
  name        text,                          -- optionnel, ex "Maison Brac"
  invite_code text unique not null,          -- code à 6 chiffres pour rejoindre
  created_by  uuid,                          -- FK vers profiles, ajoutée plus bas
                                             -- (référence circulaire couples<->profiles)
  created_at  timestamptz not null default now()
);

comment on table public.couples is 'Espace partagé d''un couple — racine de toutes les données.';

-- profiles : infos applicatives de chaque utilisateur.
-- Le compte + mot de passe sont gérés par Supabase dans auth.users.
-- profiles.id = auth.users.id (même identifiant).
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',     -- prénom affiché (complété à l'onboarding)
  color        text not null default 'sauge'
                 check (color in ('sauge', 'brique')),  -- couleur d'identité (PRD §5.3)
  couple_id    uuid references public.couples(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'Profil applicatif d''un utilisateur (1:1 avec auth.users).';

-- Lien couples.created_by -> profiles, maintenant que profiles existe.
alter table public.couples
  add constraint couples_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- categories : les rayons, personnalisables par couple (PRD §5.2).
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  name       text not null,                  -- ex "Fruits & Légumes"
  position   int  not null default 0,        -- ordre d'affichage
  created_at timestamptz not null default now()
);

comment on table public.categories is 'Rayons de courses, propres et modifiables par chaque couple.';


-- ============================================================================
-- 3. TABLES MODULE COURSES
-- ============================================================================

-- lists : une liste de courses (Auchan, Marché…).
create table public.lists (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples(id) on delete cascade,
  name       text not null,
  position   int  not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.lists is 'Une liste de courses appartenant à un couple.';

-- library_items : la bibliothèque maître — chaque produit déjà utilisé au moins
-- une fois par le couple. Sert la mémoire de catégorie et le tri par fréquence.
create table public.library_items (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples(id) on delete cascade,
  name         text not null,
  category_id  uuid references public.categories(id) on delete set null,
  usage_count  int  not null default 1,      -- pour le tri par fréquence (Bibliothèque)
  last_used_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (couple_id, name)                   -- pas de doublon de produit par couple
);

comment on table public.library_items is 'Bibliothèque maître des produits du couple (mémoire + fréquence).';

-- list_items : un article présent dans une liste précise.
create table public.list_items (
  id              uuid primary key default gen_random_uuid(),
  list_id         uuid not null references public.lists(id) on delete cascade,
  library_item_id uuid not null references public.library_items(id) on delete cascade,
  is_checked      boolean not null default false,
  added_by        uuid references public.profiles(id) on delete set null,
  checked_by      uuid references public.profiles(id) on delete set null,
  checked_at      timestamptz,
  quantity        text,                       -- optionnel, ex "2 kg" ou "x3"
  note            text,                       -- optionnel
  created_at      timestamptz not null default now()
);

comment on table public.list_items is 'Un article dans une liste précise (pointe vers un library_item).';

-- Index sur les clés étrangères les plus sollicitées (filtrage par couple/liste).
create index categories_couple_id_idx     on public.categories (couple_id);
create index lists_couple_id_idx          on public.lists (couple_id);
create index library_items_couple_id_idx  on public.library_items (couple_id);
create index library_items_category_id_idx on public.library_items (category_id);
create index list_items_list_id_idx       on public.list_items (list_id);
create index list_items_library_item_idx  on public.list_items (library_item_id);
create index profiles_couple_id_idx       on public.profiles (couple_id);


-- ============================================================================
-- 4. FONCTIONS
-- ============================================================================

-- 4.1 current_couple_id()
-- Renvoie le couple_id de l'utilisateur connecté.
-- SECURITY DEFINER : contourne RLS pour lire profiles, ce qui ÉVITE la
-- récursion infinie quand les policies de profiles s'appuient dessus.
create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

comment on function public.current_couple_id() is
  'Couple de l''utilisateur connecté. SECURITY DEFINER pour éviter la récursion RLS.';

-- 4.2 generate_invite_code()
-- Génère un code à 6 chiffres unique (réessaie tant qu'une collision existe).
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  loop
    -- 000000 à 999999, toujours sur 6 caractères (zéros à gauche conservés).
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.couples where invite_code = code);
  end loop;
  return code;
end;
$$;

comment on function public.generate_invite_code() is
  'Génère un invite_code à 6 chiffres garanti unique dans public.couples.';

-- On câble la fonction comme valeur par défaut de couples.invite_code
-- (possible seulement maintenant que la fonction existe).
alter table public.couples
  alter column invite_code set default public.generate_invite_code();

-- 4.3 handle_new_user() — trigger
-- À chaque inscription (insert dans auth.users), crée la ligne profiles
-- correspondante. Prénom/couleur seront complétés à l'onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, color)
  values (new.id, '', 'sauge');
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crée automatiquement un profile à l''inscription d''un utilisateur.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4.4 join_couple_with_code(p_code)
-- Permet à l'utilisateur connecté de rejoindre un couple via son code.
-- SECURITY DEFINER car un utilisateur non encore lié ne peut PAS lire la table
-- couples sous RLS (il ne verrait que son propre couple, qu'il n'a pas encore).
-- Valide le code, rattache le profil, et renvoie l'id du couple rejoint.
create or replace function public.join_couple_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_couple uuid;
begin
  select id into target_couple
  from public.couples
  where invite_code = p_code;

  if target_couple is null then
    raise exception 'Code d''invitation invalide';
  end if;

  update public.profiles
  set couple_id = target_couple
  where id = auth.uid();

  return target_couple;
end;
$$;

comment on function public.join_couple_with_code(text) is
  'Rattache l''utilisateur connecté au couple correspondant au code fourni.';

-- 4.5 create_default_categories(p_couple_id)
-- Crée les 12 catégories de départ du PRD (§5.2) pour un couple donné.
-- À appeler après la création d'un couple (onboarding). NON déclenché
-- automatiquement : c'est le code applicatif (ou seed.sql) qui l'invoque.
create or replace function public.create_default_categories(p_couple_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.categories (couple_id, name, position)
  values
    (p_couple_id, 'Fruits & Légumes',  0),
    (p_couple_id, 'Viande & Poisson',  1),
    (p_couple_id, 'Crémerie & Œufs',   2),
    (p_couple_id, 'Boulangerie',       3),
    (p_couple_id, 'Surgelés',          4),
    (p_couple_id, 'Épicerie',          5),
    (p_couple_id, 'Boissons',          6),
    (p_couple_id, 'Hygiène',           7),
    (p_couple_id, 'Entretien',         8),
    (p_couple_id, 'Papeterie',         9),
    (p_couple_id, 'Bricolage',        10),
    (p_couple_id, 'Jardinage',        11),
    (p_couple_id, 'Autre',            12);
$$;

comment on function public.create_default_categories(uuid) is
  'Insère les 12 catégories de départ (PRD §5.2) pour un couple. À appeler à l''onboarding.';


-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Règle universelle : on n'accède qu'aux données de SON couple.
-- La protection vit dans la base : un bug front ne peut pas exposer un autre couple.
-- ============================================================================

alter table public.couples       enable row level security;
alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.lists         enable row level security;
alter table public.library_items enable row level security;
alter table public.list_items    enable row level security;

-- Privilèges de table pour le rôle authentifié (RLS filtre ensuite les lignes).
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ----------------------------------------------------------------------------
-- 5.1 profiles
--   - SELECT : son propre profil + celui du partenaire (même couple)
--   - UPDATE : uniquement son propre profil (prénom, couleur, couple_id)
--   - INSERT/DELETE : via trigger / cascade auth → pas de policy client
-- ----------------------------------------------------------------------------
create policy "profiles_select_self_or_partner"
  on public.profiles for select
  using (id = auth.uid() or couple_id = public.current_couple_id());

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 5.2 couples
--   - SELECT : son couple (ou celui qu'on vient de créer, via created_by,
--              pour permettre le RETURNING à la création avant rattachement)
--   - INSERT : on ne crée qu'un couple dont on est le créateur
--   - UPDATE/DELETE : membres du couple uniquement
--   (Rejoindre par code passe par join_couple_with_code, pas par SELECT direct.)
-- ----------------------------------------------------------------------------
create policy "couples_select_member_or_creator"
  on public.couples for select
  using (id = public.current_couple_id() or created_by = auth.uid());

create policy "couples_insert_self_as_creator"
  on public.couples for insert
  with check (created_by = auth.uid());

create policy "couples_update_member"
  on public.couples for update
  using (id = public.current_couple_id())
  with check (id = public.current_couple_id());

create policy "couples_delete_member"
  on public.couples for delete
  using (id = public.current_couple_id());

-- ----------------------------------------------------------------------------
-- 5.3 categories — accès limité au couple
-- ----------------------------------------------------------------------------
create policy "categories_select_own_couple"
  on public.categories for select
  using (couple_id = public.current_couple_id());

create policy "categories_insert_own_couple"
  on public.categories for insert
  with check (couple_id = public.current_couple_id());

create policy "categories_update_own_couple"
  on public.categories for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create policy "categories_delete_own_couple"
  on public.categories for delete
  using (couple_id = public.current_couple_id());

-- ----------------------------------------------------------------------------
-- 5.4 lists — accès limité au couple
-- ----------------------------------------------------------------------------
create policy "lists_select_own_couple"
  on public.lists for select
  using (couple_id = public.current_couple_id());

create policy "lists_insert_own_couple"
  on public.lists for insert
  with check (couple_id = public.current_couple_id());

create policy "lists_update_own_couple"
  on public.lists for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create policy "lists_delete_own_couple"
  on public.lists for delete
  using (couple_id = public.current_couple_id());

-- ----------------------------------------------------------------------------
-- 5.5 library_items — accès limité au couple
-- ----------------------------------------------------------------------------
create policy "library_items_select_own_couple"
  on public.library_items for select
  using (couple_id = public.current_couple_id());

create policy "library_items_insert_own_couple"
  on public.library_items for insert
  with check (couple_id = public.current_couple_id());

create policy "library_items_update_own_couple"
  on public.library_items for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create policy "library_items_delete_own_couple"
  on public.library_items for delete
  using (couple_id = public.current_couple_id());

-- ----------------------------------------------------------------------------
-- 5.6 list_items — accès filtré via la LISTE PARENTE
--   On vérifie que la liste référencée appartient bien au couple courant.
-- ----------------------------------------------------------------------------
create policy "list_items_select_via_list"
  on public.list_items for select
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and l.couple_id = public.current_couple_id()
    )
  );

create policy "list_items_insert_via_list"
  on public.list_items for insert
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and l.couple_id = public.current_couple_id()
    )
  );

create policy "list_items_update_via_list"
  on public.list_items for update
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and l.couple_id = public.current_couple_id()
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and l.couple_id = public.current_couple_id()
    )
  );

create policy "list_items_delete_via_list"
  on public.list_items for delete
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_items.list_id
        and l.couple_id = public.current_couple_id()
    )
  );

-- ============================================================================
-- Fin de la migration initiale V1.
-- ============================================================================
