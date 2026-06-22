-- ============================================================================
-- App Couple — V3 (suite) : nom_normalise sur la bibliothèque
-- ----------------------------------------------------------------------------
-- Référence : PRD_recettes §4 (la bibliothèque doit posséder `nom_normalise`),
--             §5 (la clé de comparaison), §6 (fusion ingrédient → bibliothèque).
-- Décision validée avec Baptiste : Option A — on aligne la bibliothèque sur le
-- PRD « à la lettre » : colonne `nom_normalise` + backfill des lignes existantes
-- + index. La fusion (§6) peut ainsi retrouver l'article par clé indexée.
--
-- `list_items` n'a PAS besoin de la colonne : il ne stocke aucun nom, il pointe
-- vers `library_items` (la clé vit donc sur la bibliothèque, transitivement).
--
-- Contenu :
--   1. extension unaccent (suppression des accents en SQL)
--   2. fonction public.normaliser_nom(text)  — JUMEAU SQL de normaliserNom() (JS)
--   3. library_items.nom_normalise           — colonne + backfill
--   4. trigger de remplissage automatique     — filet pour les inserts legacy
--   5. NOT NULL + index
-- ============================================================================


-- ============================================================================
-- 1. EXTENSION unaccent
-- ----------------------------------------------------------------------------
-- Reproduit l'étape 2 de normaliserNom() (NFD + suppression des diacritiques).
-- Installée dans le schéma `extensions` (convention Supabase, hors search_path
-- applicatif par défaut).
-- ============================================================================
create extension if not exists unaccent with schema extensions;


-- ============================================================================
-- 2. public.normaliser_nom(text) — jumeau SQL de normaliserNom() (PRD §5)
-- ----------------------------------------------------------------------------
-- Reproduit fidèlement la fonction JS (src/lib/utils/normalize-name-key.ts) afin
-- que le backfill et les inserts côté base produisent EXACTEMENT la même clé que
-- l'app. La référence canonique reste la fonction JS (PRD §5) ; ce jumeau ne sert
-- qu'au backfill et de filet (trigger ci-dessous).
--
-- ⚠️ Seule divergence connue : les ligatures (« œuf » → « oeuf » via unaccent,
--    alors que NFD côté JS laisse « œuf »). Cas rarissime pour des produits ;
--    si un jour ça pose souci, l'app fournit elle-même la clé (le trigger la
--    respecte) et la divergence disparaît.
-- ============================================================================
create or replace function public.normaliser_nom(raw text)
returns text
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  s        text;
  liaison  text;
  -- Mots de liaison retirés en tête, forme la plus longue d'abord (PRD §5, ét. 4).
  liaisons text[] := array[
    'de la ', 'de l''', 'du ', 'des ', 'de ', 'd''',
    'le ', 'la ', 'les ', 'l''', 'un ', 'une '
  ];
begin
  -- 1. trim + minuscules.
  s := lower(trim(coalesce(raw, '')));
  if s = '' then
    return '';
  end if;

  -- 2. retirer les accents.
  s := extensions.unaccent(s);

  -- 3. réduire les espaces multiples à un seul.
  s := regexp_replace(s, '\s+', ' ', 'g');

  -- 4. retirer UN mot de liaison en début (une seule passe, pas en cascade).
  foreach liaison in array liaisons loop
    if left(s, length(liaison)) = liaison then
      s := substr(s, length(liaison) + 1);
      exit;
    end if;
  end loop;

  -- 5. mettre au singulier : « s » ou « x » final au-delà de 3 lettres.
  if length(s) > 3 and (right(s, 1) = 's' or right(s, 1) = 'x') then
    s := left(s, length(s) - 1);
  end if;

  -- 6. trim final.
  return trim(s);
end;
$$;

comment on function public.normaliser_nom(text) is
  'Jumeau SQL de normaliserNom() (PRD §5). Backfill + filet trigger. Référence canonique = la fonction JS.';


-- ============================================================================
-- 3. library_items.nom_normalise — colonne + backfill
-- ----------------------------------------------------------------------------
-- Ajout en nullable d'abord pour pouvoir backfiller, puis NOT NULL plus bas.
-- DEFAULT '' : rend la colonne optionnelle à l'insert (le trigger remplit la
-- vraie clé juste après) → le code app existant n'a pas à fournir la colonne.
-- ============================================================================
alter table public.library_items
  add column nom_normalise text not null default '';

comment on column public.library_items.nom_normalise is
  'Clé de comparaison normalisée (PRD §5/§6). Remplie par l''app (JS) ou, à défaut, par le trigger. La dedup historique unique(couple_id, name) reste en place.';

-- Backfill des lignes existantes à partir du nom affiché.
update public.library_items
  set nom_normalise = public.normaliser_nom(name);


-- ============================================================================
-- 4. TRIGGER de remplissage automatique
-- ----------------------------------------------------------------------------
-- Filet de sécurité : le code app actuel insère SANS nom_normalise. Sans ce
-- trigger, le NOT NULL ci-dessous casserait tout ajout de produit. Règle :
--   - si l'app fournit déjà une clé (non vide) → on la RESPECTE (clé JS canonique) ;
--   - sinon → on la calcule depuis `name` (jumeau SQL).
-- Recalcule aussi à un changement de `name` si aucune clé n'est fournie.
-- ============================================================================
create or replace function public.library_items_set_nom_normalise()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.nom_normalise is null or new.nom_normalise = '' then
    new.nom_normalise := public.normaliser_nom(new.name);
  end if;
  return new;
end;
$$;

comment on function public.library_items_set_nom_normalise() is
  'Remplit library_items.nom_normalise à l''insert/update si l''app ne l''a pas fournie.';

create trigger library_items_nom_normalise_biu
  before insert or update of name, nom_normalise on public.library_items
  for each row
  execute function public.library_items_set_nom_normalise();


-- ============================================================================
-- 5. INDEX
-- ----------------------------------------------------------------------------
-- Index NON unique (comme recipe_ingredients.nom_normalise) : deux noms affichés
-- distincts peuvent légitimement produire la même clé (« Tomate » / « Tomates »).
-- L'unicité « un article par clé » est gérée par la logique de fusion (§6), pas
-- par une contrainte qui échouerait sur des quasi-doublons existants.
-- ============================================================================
create index library_items_nom_normalise_idx
  on public.library_items (couple_id, nom_normalise);


-- ============================================================================
-- Fin — nom_normalise sur la bibliothèque (Option A).
-- ============================================================================
