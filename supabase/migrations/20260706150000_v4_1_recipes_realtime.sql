-- ============================================================================
-- V4.1 — §10 : recipes rejoint la publication Realtime
--
-- La table recipes n'a jamais été ajoutée à la publication Realtime (angle
-- mort de la V3), à la différence de lists/list_items/tasks/library_items/
-- meal_slots. Le PRD V4.1 §4.1 affirmait à tort que les 5 tables du
-- soft-delete étaient déjà couvertes : sans ce correctif, une suppression ou
-- restauration de recette ne se propageait pas en direct chez le partenaire
-- (critère §10 « temps réel intact »).
-- ============================================================================

alter table public.recipes replica identity full;
alter publication supabase_realtime add table public.recipes;
