-- ============================================================================
-- App Couple — Synchronisation temps réel (V1)
-- ----------------------------------------------------------------------------
-- Objectif : quand un membre du couple ajoute / coche / modifie / supprime un
-- item, une liste ou un produit, l'autre le voit SANS refresh.
--
-- Mécanique côté serveur (ici) :
--   1. publier les tables concernées dans `supabase_realtime` → les
--      changements (INSERT/UPDATE/DELETE) sont diffusés via postgres_changes ;
--   2. passer ces tables en REPLICA IDENTITY FULL.
--
-- Pourquoi REPLICA IDENTITY FULL : par défaut (`d`), un event DELETE (et la
-- partie « old » d'un UPDATE) ne transporte QUE la clé primaire. Or les hooks
-- client filtrent par `couple_id` (lists, library_items, categories) ou
-- `list_id` (list_items) — colonnes qui ne sont PAS la PK. Sans FULL, une
-- suppression ne matcherait aucun filtre et passerait inaperçue. FULL fait
-- voyager la ligne complète, donc le filtre s'applique aussi aux DELETE.
--
-- Sécurité : postgres_changes RESPECTE la RLS déjà en place sur ces tables —
-- un client ne reçoit que les events des lignes qu'il pourrait lire en SELECT.
-- Un autre couple ne voit donc jamais rien. Le filtre `couple_id`/`list_id`
-- côté client est une optimisation (moins de trafic), pas la barrière de
-- sécurité : celle-ci reste la RLS.
-- ============================================================================

-- Diffuser les changements de ces tables (idempotent : on ignore si déjà publié).
do $$
declare
  t text;
begin
  foreach t in array array['lists', 'list_items', 'library_items', 'categories']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Ligne complète dans les events (nécessaire pour filtrer les DELETE/UPDATE).
alter table public.lists          replica identity full;
alter table public.list_items     replica identity full;
alter table public.library_items  replica identity full;
alter table public.categories     replica identity full;
