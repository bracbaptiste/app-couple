-- ============================================================================
-- App Couple — Synchronisation temps réel sur `tasks` (V2)
-- ----------------------------------------------------------------------------
-- Objectif : quand un membre du couple ajoute / coche / modifie / supprime une
-- TÂCHE d'une to-do list partagée, l'autre le voit SANS refresh — comme déjà
-- fait pour list_items en V1 (cf. 20260604194405_enable_realtime.sql).
--
-- Même mécanique que la V1 :
--   1. publier `tasks` dans `supabase_realtime` → INSERT/UPDATE/DELETE diffusés
--      via postgres_changes ;
--   2. passer `tasks` en REPLICA IDENTITY FULL.
--
-- Pourquoi REPLICA IDENTITY FULL : par défaut (`d`), un event DELETE (et la
-- partie « old » d'un UPDATE) ne transporte QUE la PK. Or le hook client filtre
-- par `list_id` — colonne qui n'est PAS la PK. Sans FULL, une suppression ne
-- matcherait aucun filtre et passerait inaperçue chez le partenaire. FULL fait
-- voyager la ligne complète, donc le filtre s'applique aussi aux DELETE/UPDATE.
--
-- Sécurité : postgres_changes RESPECTE la RLS de `tasks` (cf.
-- 20260615093000_v2_rls_lists_tasks.sql) — un client ne reçoit que les events
-- des lignes qu'il pourrait lire en SELECT. Le filtre `list_id` côté client est
-- une optimisation (moins de trafic), pas la barrière de sécurité.
-- ============================================================================

-- Diffuser les changements de `tasks` (idempotent : on ignore si déjà publié).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

-- Ligne complète dans les events (nécessaire pour filtrer les DELETE/UPDATE).
alter table public.tasks replica identity full;
