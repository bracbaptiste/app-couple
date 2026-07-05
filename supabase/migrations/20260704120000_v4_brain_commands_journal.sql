-- ============================================================================
-- App Couple — Migration V4 (Journal du Cerveau — « ticket de caisse »)
-- ----------------------------------------------------------------------------
-- Référence : PRD_V4 §7 (le journal) + §9 (modèle de données) + §6 (annulation
-- journalisée). Décisions actées :
--   - Le journal est À CÔTÉ de l'historique d'achats (il ne le remplace pas) :
--     il ne trace QUE les commandes du Cerveau (vocal + propositions IA
--     acceptées), jamais les actions tactiles ordinaires.
--   - `statut` bascule `fait` → `annule` quand on annule (le trait d'encre qui
--     raye la ligne, §7) ; `annule_at`/`annule_by` journalisent l'annulation
--     elle-même (§6 « l'annulation est elle-même journalisée »).
--   - `undo_data` (jsonb) porte les opérations d'annulation ({UndoOp}[] côté
--     serveur : ids créés, états précédents) — null si l'action n'est pas
--     réversible (→ pas de bouton ANNULER, §12 Phase 3).
--   - Rétention : pas de purge automatique (volumétrie négligeable à 2). Donc
--     AUCUNE policy / grant DELETE (garde-fou projet : jamais de DELETE sans
--     filtre couple_id/id — ici on ne supprime tout simplement pas).
--
-- Contenu :
--   1. brain_commands
--   2. Index
--   3. RLS + policies (cloisonnement par couple, cohérent avec V1/V2/V3)
--   4. Grants (select/insert/update) pour le rôle authenticated
--   5. Realtime (publication + replica identity full)
-- ============================================================================


-- ============================================================================
-- 1. brain_commands
-- ============================================================================
create table public.brain_commands (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  -- Auteur de la commande (point sauge/brique du ticket). ON DELETE SET NULL :
  -- si le profil part, la ligne du ticket reste lisible (auteur inconnu).
  user_id     uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- La phrase d'origine telle que dictée (§7).
  texte_dicte text not null,
  -- Actions exécutées, avec leur détail AFFICHABLE (groupes { label, lignes }).
  -- Purement descriptif : la source de vérité des données reste dans les tables
  -- métier. Sert à réimprimer la ligne du ticket sans re-relire le contexte.
  actions     jsonb not null default '[]'::jsonb,
  -- fait = exécutée ; annule = défaite via undo_data (ligne rayée, §7).
  statut      text not null default 'fait' check (statut in ('fait', 'annule')),
  -- Ce qu'il faut pour défaire ({ "ops": [UndoOp...] }). null = non réversible.
  undo_data   jsonb,
  -- Horodatage + auteur de l'annulation (journalise l'annulation, §6).
  annule_at   timestamptz,
  annule_by   uuid references public.profiles(id) on delete set null
);

comment on table public.brain_commands is
  'Journal du Cerveau (ticket de caisse) : commandes vocales / IA exécutées, annulables ligne par ligne. PRD_V4 §7/§9. Aucune purge auto (pas de DELETE).';

-- ============================================================================
-- 2. INDEX — lecture des 100 dernières commandes du couple (§7 rétention).
-- ============================================================================
create index brain_commands_couple_created_idx
  on public.brain_commands (couple_id, created_at desc);

-- ============================================================================
-- 3. ROW LEVEL SECURITY — même règle que V1/V2/V3 : on n'accède qu'à son couple.
--    Pas de policy DELETE : le journal ne se purge pas (§7).
-- ============================================================================
alter table public.brain_commands enable row level security;

create policy "brain_commands_select_own_couple"
  on public.brain_commands for select
  using (couple_id = public.current_couple_id());

-- L'auteur ne peut journaliser que POUR son couple et EN SON nom (user_id = soi).
create policy "brain_commands_insert_own_couple"
  on public.brain_commands for insert
  with check (
    couple_id = public.current_couple_id()
    and user_id = auth.uid()
  );

-- UPDATE = annuler (les deux membres peuvent annuler une commande du couple).
create policy "brain_commands_update_own_couple"
  on public.brain_commands for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ============================================================================
-- 4. GRANTS — le grant initial (V1) ne couvre que les tables d'alors. On
--    n'accorde PAS delete (aucune purge — §7).
-- ============================================================================
grant select, insert, update on public.brain_commands to authenticated;

-- ============================================================================
-- 5. REALTIME — l'annulation et les nouvelles lignes sont visibles par l'autre
--    sans rechargement (§7 « partagé, temps réel »). Même mécanique que V1/V2 :
--    publication + REPLICA IDENTITY FULL (le hook client filtre par couple_id,
--    colonne ≠ PK → FULL nécessaire pour que les UPDATE portent la ligne).
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'brain_commands'
  ) then
    alter publication supabase_realtime add table public.brain_commands;
  end if;
end $$;

alter table public.brain_commands replica identity full;

-- ============================================================================
-- Fin de la migration V4 (Journal du Cerveau).
-- ============================================================================
