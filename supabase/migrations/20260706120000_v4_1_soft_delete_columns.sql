-- ============================================================================
-- App Couple — V4.1 Pilier A : colonne deleted_at (soft-delete)
-- ----------------------------------------------------------------------------
-- Decisions actees PRD_V4.1 §3.1 : les suppressions depuis l'UI ne font plus
-- de DELETE SQL sur ces 5 tables, elles posent deleted_at (UPDATE filtre
-- couple_id/id). RLS inchangee : une ligne soft-deleted reste une ligne du
-- couple, le filtre existant suffit. Realtime deja couvert (REPLICA IDENTITY
-- FULL, migration 20260604194405) : un soft-delete est un UPDATE, l'autre
-- appareil le recoit deja via useRealtimeRefresh. Pas d'index partiel : volume
-- negligeable pour 2 utilisateurs, rien ne le justifie a ce stade.
-- ============================================================================

alter table public.lists          add column if not exists deleted_at timestamptz null;
alter table public.list_items     add column if not exists deleted_at timestamptz null;
alter table public.tasks          add column if not exists deleted_at timestamptz null;
alter table public.library_items  add column if not exists deleted_at timestamptz null;
alter table public.recipes        add column if not exists deleted_at timestamptz null;
