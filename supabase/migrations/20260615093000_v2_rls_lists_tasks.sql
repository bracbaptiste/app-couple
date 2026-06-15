-- ============================================================================
-- V2 — Politiques RLS pour lists (partage individuel) et tasks
-- Réf : ARCHITECTURE_V2.md §3 « Nouvelles politiques RLS »
--
-- Atomicité : migration séparée du schéma (20260615091725_v2_todo_module.sql).
-- Cette migration ne touche QUE les politiques RLS + le helper current_couple_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ÉTAPE 1 : helper current_couple_id()
--
-- ⚠️ Écart volontaire avec ARCHITECTURE_V2 §3.1 :
-- Le doc propose une version naïve (`language sql stable`, sans SECURITY DEFINER
-- ni search_path). Or la fonction EXISTE DÉJÀ depuis la V1
-- (20260601130107_init_v1_schema.sql §4.1) en version DURCIE :
--   - SECURITY DEFINER : contourne RLS pour lire profiles et ÉVITE la récursion
--     infinie des policies de profiles qui s'appuient sur cette fonction.
--   - set search_path = public : durcissement (résolution de schéma figée).
-- Recopier la version du doc serait une RÉGRESSION de sécurité et casserait les
-- policies de profiles. On reconduit donc à l'identique la version V1 durcie.
-- ----------------------------------------------------------------------------
create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- ÉTAPE 2 : drop des anciennes politiques V1 sur lists
--
-- ⚠️ Écart volontaire avec ARCHITECTURE_V2 §3.1 :
-- Le doc droppe des noms français qui N'EXISTENT PAS en base. Les vrais noms
-- créés en V1 sont `lists_{select,insert,update,delete}_own_couple`. On droppe
-- les VRAIS noms (sinon les anciennes policies permissives survivraient et
-- coexisteraient avec les nouvelles → fuite des listes perso d'un autre user).
-- On droppe aussi les noms du doc en `if exists` (filet de sécurité, no-op).
-- ----------------------------------------------------------------------------
drop policy if exists "lists_select_own_couple" on public.lists;
drop policy if exists "lists_insert_own_couple" on public.lists;
drop policy if exists "lists_update_own_couple" on public.lists;
drop policy if exists "lists_delete_own_couple" on public.lists;

-- noms du doc (n'existent pas en base, drop défensif no-op)
drop policy if exists "lire les listes de son couple" on public.lists;
drop policy if exists "créer une liste pour son couple" on public.lists;
drop policy if exists "modifier les listes de son couple" on public.lists;
drop policy if exists "supprimer les listes de son couple" on public.lists;

-- ----------------------------------------------------------------------------
-- ÉTAPE 3 : nouvelles politiques sur lists (gèrent is_shared + owner_id)
--
-- Règle : on voit/édite une liste si elle appartient à son couple ET
-- (elle est partagée OU on en est le propriétaire).
-- ----------------------------------------------------------------------------

-- SELECT : listes partagées du couple + ses propres listes perso
create policy "lists_select_accessible"
  on public.lists for select
  using (
    couple_id = public.current_couple_id()
    and (is_shared = true or owner_id = auth.uid())
  );

-- INSERT : on crée pour son couple ; si perso, owner_id doit être soi
create policy "lists_insert_accessible"
  on public.lists for insert
  with check (
    couple_id = public.current_couple_id()
    and (is_shared = true or owner_id = auth.uid())
  );

-- UPDATE : même périmètre que SELECT (using + with check pour empêcher
-- de « déplacer » une liste hors de son périmètre)
create policy "lists_update_accessible"
  on public.lists for update
  using (
    couple_id = public.current_couple_id()
    and (is_shared = true or owner_id = auth.uid())
  )
  with check (
    couple_id = public.current_couple_id()
    and (is_shared = true or owner_id = auth.uid())
  );

-- DELETE : même périmètre que SELECT
create policy "lists_delete_accessible"
  on public.lists for delete
  using (
    couple_id = public.current_couple_id()
    and (is_shared = true or owner_id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- ÉTAPE 4 : politiques sur tasks (s'appuient sur la liste parente)
--
-- RLS déjà activée sur tasks par la migration de schéma (§3 todo_module).
-- L'accès aux tâches dérive de l'accès à la liste parente.
-- ----------------------------------------------------------------------------

create policy "tasks_select_accessible"
  on public.tasks for select
  using (
    list_id in (
      select id from public.lists
      where couple_id = public.current_couple_id()
        and (is_shared = true or owner_id = auth.uid())
    )
  );

create policy "tasks_insert_accessible"
  on public.tasks for insert
  with check (
    list_id in (
      select id from public.lists
      where couple_id = public.current_couple_id()
        and (is_shared = true or owner_id = auth.uid())
    )
  );

create policy "tasks_update_accessible"
  on public.tasks for update
  using (
    list_id in (
      select id from public.lists
      where couple_id = public.current_couple_id()
        and (is_shared = true or owner_id = auth.uid())
    )
  )
  with check (
    list_id in (
      select id from public.lists
      where couple_id = public.current_couple_id()
        and (is_shared = true or owner_id = auth.uid())
    )
  );

create policy "tasks_delete_accessible"
  on public.tasks for delete
  using (
    list_id in (
      select id from public.lists
      where couple_id = public.current_couple_id()
        and (is_shared = true or owner_id = auth.uid())
    )
  );
