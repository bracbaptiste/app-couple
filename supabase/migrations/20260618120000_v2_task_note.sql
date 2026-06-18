-- ============ V2 : note sur une tâche ============
-- Une tâche peut désormais porter une note libre, affichée en petits caractères
-- sous l'intitulé (parité avec la note d'un article de courses). Colonne
-- nullable : les tâches existantes restent inchangées (note vide = NULL).
alter table tasks
  add column note text;
