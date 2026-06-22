-- ============================================================================
-- App Couple — Migration V3 (Module Recettes)
-- ----------------------------------------------------------------------------
-- Référence : docs/Doc V3/PRD_recettes.md §4 (modèle de données), §6 (fusion),
--             §10 (taxonomie). Décisions validées avec Baptiste :
--   - list_items : colonne `quantities jsonb` ADDITIVE (l'ancienne `quantity`
--     texte est conservée pour la saisie manuelle libre). PRD §4.
--   - normaliserNom() strict réservé aux recettes + fusion ; la bibliothèque
--     garde sa dedup actuelle sur le nom affiché (pas de backfill).
--
-- Contenu :
--   1. recipes
--   2. recipe_ingredients
--   3. list_items.quantities (colonne additive)
--   4. Index
--   5. RLS + policies (cloisonnement par couple, cohérent avec V1/V2)
--   6. Grants pour le rôle authenticated (tables créées après le grant initial)
--   7. Storage : bucket privé `recipe-photos` + policies couple
-- ============================================================================


-- ============================================================================
-- 1. recipes
-- ============================================================================
create table public.recipes (
  id                   uuid primary key default gen_random_uuid(),
  couple_id            uuid not null references public.couples(id) on delete cascade,
  titre                text not null,
  photo_url            text,                        -- chemin Supabase Storage, nullable
  duree_minutes        int,                         -- estimée par l'IA, nullable
  type_plat            text not null
                         check (type_plat in (
                           'aperitif', 'entree', 'plat', 'accompagnement',
                           'dessert', 'petit_dejeuner', 'boisson', 'sauce_base'
                         )),                         -- Axe 1, jeu fermé (PRD §10)
  tags                 text[] not null default '{}', -- Axe 2 (jeu fermé côté app, PRD §10)
  nombre_personnes     int  not null default 4,     -- nb de personnes « de base »
  calories_par_portion int,                          -- ESTIMATION par portion
  proteines_g          numeric,                       -- par portion
  glucides_g           numeric,                       -- par portion
  lipides_g            numeric,                       -- par portion
  etapes               jsonb not null default '[]'::jsonb, -- tableau de chaînes
  notes                text,
  source               text not null
                         check (source in ('photo', 'manuelle', 'ia')),
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now()
);

comment on table public.recipes is
  'Recettes du couple (photo / manuelle / IA). Module V3.';

-- ============================================================================
-- 2. recipe_ingredients
-- ----------------------------------------------------------------------------
-- INDÉPENDANT de library_items (décision PRD §2.6) : un ingrédient existe au
-- sein de sa recette sans être un article de la bibliothèque. `nom_normalise`
-- est rempli côté serveur via normaliserNom() (PRD §5).
-- ============================================================================
create table public.recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references public.recipes(id) on delete cascade,
  nom_affiche   text not null,               -- ce que voit l'utilisateur (« tomates bien mûres »)
  nom_normalise text not null,               -- la clé de comparaison (« tomate »)
  quantite      numeric,                     -- null pour les ingrédients « au goût »
  unite         text check (unite in ('g', 'ml', 'piece')), -- ou null
  ordre         int not null default 0       -- ordre d'affichage
);

comment on table public.recipe_ingredients is
  'Ingrédients d''une recette. Indépendant de library_items (PRD §2.6).';

-- ============================================================================
-- 3. list_items.quantities — quantités structurées (PRD §4, décision validée)
-- ----------------------------------------------------------------------------
-- Tableau de quantités NON additionnables sur la même ligne, ex. :
--   [{ "valeur": 1, "unite": "piece" }, { "valeur": 200, "unite": "g" }]
-- Colonne ADDITIVE : l'ancienne `quantity` texte reste pour la saisie manuelle.
-- La fusion des recettes (PRD §6) lit/écrit ce jsonb ; les unités de base sont
-- g / ml / piece (kg×1000, l×1000 ramenés en amont côté serveur).
-- ============================================================================
alter table public.list_items
  add column quantities jsonb;

comment on column public.list_items.quantities is
  'Quantités structurées non additionnables [{valeur, unite}] (recettes, PRD §4/§6). Additive : `quantity` texte conservée pour la saisie manuelle.';

-- ============================================================================
-- 4. INDEX
-- ============================================================================
create index recipes_couple_id_idx            on public.recipes (couple_id);
create index recipes_type_plat_idx            on public.recipes (type_plat);
create index recipes_tags_gin_idx             on public.recipes using gin (tags);
create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);
-- Recherche de la ligne existante lors de la fusion (PRD §6) par clé normalisée.
create index recipe_ingredients_nom_norm_idx  on public.recipe_ingredients (nom_normalise);

-- ============================================================================
-- 5. ROW LEVEL SECURITY — même règle que V1/V2 : on n'accède qu'à son couple.
-- ============================================================================
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;

-- 5.1 recipes — accès limité au couple
create policy "recipes_select_own_couple"
  on public.recipes for select
  using (couple_id = public.current_couple_id());

create policy "recipes_insert_own_couple"
  on public.recipes for insert
  with check (couple_id = public.current_couple_id());

create policy "recipes_update_own_couple"
  on public.recipes for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create policy "recipes_delete_own_couple"
  on public.recipes for delete
  using (couple_id = public.current_couple_id());

-- 5.2 recipe_ingredients — accès filtré via la RECETTE parente
create policy "recipe_ingredients_select_via_recipe"
  on public.recipe_ingredients for select
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.couple_id = public.current_couple_id()
    )
  );

create policy "recipe_ingredients_insert_via_recipe"
  on public.recipe_ingredients for insert
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.couple_id = public.current_couple_id()
    )
  );

create policy "recipe_ingredients_update_via_recipe"
  on public.recipe_ingredients for update
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.couple_id = public.current_couple_id()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.couple_id = public.current_couple_id()
    )
  );

create policy "recipe_ingredients_delete_via_recipe"
  on public.recipe_ingredients for delete
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id
        and r.couple_id = public.current_couple_id()
    )
  );

-- ============================================================================
-- 6. GRANTS — le grant initial (migration V1) ne couvre QUE les tables qui
--    existaient alors. On le ré-accorde pour les nouvelles tables.
-- ============================================================================
grant select, insert, update, delete on public.recipes            to authenticated;
grant select, insert, update, delete on public.recipe_ingredients to authenticated;

-- ============================================================================
-- 7. STORAGE — bucket privé `recipe-photos`, accès restreint au couple.
-- ----------------------------------------------------------------------------
-- Convention de chemin : « <couple_id>/<recipe_id>/<fichier> ». La 1re partie
-- du chemin doit être le couple courant → cloisonnement par foyer. Bucket privé
-- (public = false) : l'affichage passera par des URLs signées côté serveur.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('recipe-photos', 'recipe-photos', false)
on conflict (id) do nothing;

create policy "recipe_photos_select_own_couple"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

create policy "recipe_photos_insert_own_couple"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

create policy "recipe_photos_update_own_couple"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

create policy "recipe_photos_delete_own_couple"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = public.current_couple_id()::text
  );

-- ============================================================================
-- Fin de la migration V3 (Module Recettes).
-- ============================================================================
