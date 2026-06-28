-- ============================================================================
-- V2.1 « Enrichissement » — assignation + récurrence sur tasks
-- Réf : PRD-taches-v2.1.md §3.3, §3.4, §4
--
-- Périmètre STRICT : on ajoute des colonnes à `tasks` + un index de tri.
--   - `assigned_to` : la personne responsable (≠ added_by/done_by). null = non
--     assigné / partagé. FK profiles, ON DELETE SET NULL (la tâche survit au
--     départ d'un profil, elle redevient simplement non assignée).
--   - colonnes de récurrence (modèle « auto-réapparition », régénération à la
--     complétion gérée plus tard côté applicatif). Aucune logique ici.
--
-- RLS : INCHANGÉE. L'accès aux tâches dérive déjà de la liste parente
-- (policies tasks_*_accessible, via list_id) ; les nouvelles colonnes en
-- héritent automatiquement. Aucune nouvelle politique à créer.
-- Realtime : `tasks` est déjà dans la publication ; on n'y touche pas.
-- ============================================================================

-- ---- Assignation -----------------------------------------------------------
alter table public.tasks
  add column assigned_to uuid references public.profiles(id) on delete set null;

-- ---- Récurrence (cf. PRD §3.3) ---------------------------------------------
alter table public.tasks
  add column recurrence_type text not null default 'none'
    check (recurrence_type in ('none', 'daily', 'weekly', 'monthly')),
  add column recurrence_interval int not null default 1,
  add column recurrence_weekday int            -- 0–6, pour 'weekly'
    check (recurrence_weekday between 0 and 6),
  add column recurrence_day_of_month int       -- 1–31, pour 'monthly'
    check (recurrence_day_of_month between 1 and 31),
  add column recurrence_end_date date;         -- null = sans fin

-- ---- Index de tri par échéance (PRD §4) ------------------------------------
-- Sert le tri « par échéance » au sein d'une liste (filtre list_id + order due_date).
create index tasks_list_due_idx on public.tasks (list_id, due_date);
