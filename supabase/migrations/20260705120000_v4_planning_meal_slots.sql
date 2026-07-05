-- ============================================================================
-- App Couple — Migration V4 (Planning — repas de la semaine)
-- ----------------------------------------------------------------------------
-- Référence : PRD_V4 §8.1 (grille 7 jours × 2 créneaux) + §9 (modèle de données :
-- meal_slots + provenance, besoins de la semaine). Décisions actées :
--   - Un créneau = une case de la grille : (couple, date, créneau) est UNIQUE.
--     Placer un repas là où il y en a déjà un le REMPLACE (upsert), on ne cumule
--     pas deux repas sur le même déjeuner (le placement arrive au prompt 9).
--   - Un repas est soit une RECETTE liée (recipe_id) soit un TEXTE libre. Le CHECK
--     de cohérence garantit qu'une des deux formes est renseignée, jamais les deux.
--   - `recipe_id` ON DELETE CASCADE : supprimer une recette retire ses occurrences
--     planifiées (une case ne peut pas pointer une recette qui n'existe plus — ça
--     violerait le CHECK). Les repas TEXTE ne sont pas concernés.
--   - `meal_slot_sources` (provenance) relie une case à l'article de liste qu'elle
--     a engendré (§9). Marqueur `origine` : 'generation' (créé par la génération de
--     la liste de la semaine) vs 'fusion' (fusionné dans un article déjà présent).
--     Créée ici, EXPLOITÉE aux prompts 10/11 (génération + besoins). Pas de front
--     ni de Realtime dessus pour l'instant (usage serveur).
--
-- Contenu :
--   1. meal_slots
--   2. meal_slot_sources (provenance)
--   3. Index
--   4. RLS + policies (cloisonnement par couple, cohérent avec V1/V2/V3)
--   5. Grants pour le rôle authenticated
--   6. Realtime sur meal_slots (publication + replica identity full)
--
-- Additive uniquement : aucune donnée existante n'est modifiée ou supprimée.
-- ============================================================================


-- ============================================================================
-- 1. meal_slots — une case de la grille (un créneau d'un jour pour un couple)
-- ============================================================================
create table public.meal_slots (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples(id) on delete cascade,
  date        date not null,
  creneau     text not null check (creneau in ('dejeuner', 'diner')),
  -- Forme du repas : recette liée du carnet, ou texte libre (« restau », « restes »…).
  type        text not null check (type in ('recette', 'texte')),
  -- Rempli si type = recette. CASCADE : la case suit la recette qu'elle référence.
  recipe_id   uuid references public.recipes(id) on delete cascade,
  -- Rempli si type = texte (repas libre sans fiche recette).
  texte       text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  -- Une seule case par (couple, jour, créneau) : placer remplace (§8.1).
  constraint meal_slots_couple_date_creneau_key unique (couple_id, date, creneau),

  -- Cohérence type ↔ contenu : exactement une des deux formes est renseignée.
  constraint meal_slots_content_coherent check (
    (type = 'recette' and recipe_id is not null and texte is null)
    or
    (type = 'texte'   and texte is not null and recipe_id is null)
  )
);

comment on table public.meal_slots is
  'Repas planifiés : une case de la grille (couple, jour, créneau). Recette liée ou texte libre. PRD_V4 §8.1/§9.';

-- ============================================================================
-- 2. meal_slot_sources — provenance (case ↔ article de liste engendré)
-- ----------------------------------------------------------------------------
-- Trace ce qu'une case a produit dans la liste de courses de la semaine (§9).
-- Créée ici, exploitée aux prompts 10/11 (génération de la liste + calcul des
-- besoins). `origine` distingue un article CRÉÉ par la génération d'un article
-- déjà présent où la quantité a été FUSIONNÉE.
-- ============================================================================
create table public.meal_slot_sources (
  id           uuid primary key default gen_random_uuid(),
  meal_slot_id uuid not null references public.meal_slots(id) on delete cascade,
  list_item_id uuid not null references public.list_items(id) on delete cascade,
  origine      text not null check (origine in ('generation', 'fusion')),
  created_at   timestamptz not null default now(),

  -- Un lien unique par (case, article) : on ne double pas la provenance.
  constraint meal_slot_sources_slot_item_key unique (meal_slot_id, list_item_id)
);

comment on table public.meal_slot_sources is
  'Provenance : lien case de planning ↔ article de liste engendré. origine = generation (créé) ou fusion (fusionné). PRD_V4 §9. Exploitée aux prompts 10/11.';

-- ============================================================================
-- 3. INDEX
-- ============================================================================
-- Lecture d'une semaine : plage de dates d'un couple (l'écran /planning).
create index meal_slots_couple_date_idx on public.meal_slots (couple_id, date);
-- Recettes planifiées d'une recette donnée (ex. « où est-elle utilisée »).
create index meal_slots_recipe_id_idx   on public.meal_slots (recipe_id)
  where recipe_id is not null;
-- Remontée de provenance dans les deux sens (prompts 10/11).
create index meal_slot_sources_slot_idx on public.meal_slot_sources (meal_slot_id);
create index meal_slot_sources_item_idx on public.meal_slot_sources (list_item_id);

-- ============================================================================
-- 4. ROW LEVEL SECURITY — même règle que V1/V2/V3 : on n'accède qu'à son couple.
-- ============================================================================
alter table public.meal_slots        enable row level security;
alter table public.meal_slot_sources enable row level security;

-- 4.1 meal_slots — accès limité au couple
create policy "meal_slots_select_own_couple"
  on public.meal_slots for select
  using (couple_id = public.current_couple_id());

create policy "meal_slots_insert_own_couple"
  on public.meal_slots for insert
  with check (couple_id = public.current_couple_id());

create policy "meal_slots_update_own_couple"
  on public.meal_slots for update
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create policy "meal_slots_delete_own_couple"
  on public.meal_slots for delete
  using (couple_id = public.current_couple_id());

-- 4.2 meal_slot_sources — accès filtré via la CASE parente (pattern recipe_ingredients)
create policy "meal_slot_sources_select_via_slot"
  on public.meal_slot_sources for select
  using (
    exists (
      select 1 from public.meal_slots m
      where m.id = meal_slot_sources.meal_slot_id
        and m.couple_id = public.current_couple_id()
    )
  );

create policy "meal_slot_sources_insert_via_slot"
  on public.meal_slot_sources for insert
  with check (
    exists (
      select 1 from public.meal_slots m
      where m.id = meal_slot_sources.meal_slot_id
        and m.couple_id = public.current_couple_id()
    )
  );

create policy "meal_slot_sources_update_via_slot"
  on public.meal_slot_sources for update
  using (
    exists (
      select 1 from public.meal_slots m
      where m.id = meal_slot_sources.meal_slot_id
        and m.couple_id = public.current_couple_id()
    )
  )
  with check (
    exists (
      select 1 from public.meal_slots m
      where m.id = meal_slot_sources.meal_slot_id
        and m.couple_id = public.current_couple_id()
    )
  );

create policy "meal_slot_sources_delete_via_slot"
  on public.meal_slot_sources for delete
  using (
    exists (
      select 1 from public.meal_slots m
      where m.id = meal_slot_sources.meal_slot_id
        and m.couple_id = public.current_couple_id()
    )
  );

-- ============================================================================
-- 5. GRANTS — le grant initial (V1) ne couvre que les tables d'alors.
-- ============================================================================
grant select, insert, update, delete on public.meal_slots        to authenticated;
grant select, insert, update, delete on public.meal_slot_sources to authenticated;

-- ============================================================================
-- 6. REALTIME — un repas placé par l'un apparaît instantanément chez l'autre
--    (§8.1). Même mécanique que V1/V2/V3 : publication + REPLICA IDENTITY FULL
--    (le hook client filtre par couple_id, colonne ≠ PK → FULL nécessaire pour
--    que les UPDATE/DELETE portent bien la ligne). Sécurité = RLS.
--    `meal_slot_sources` n'est PAS diffusée (aucun usage temps réel côté client).
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meal_slots'
  ) then
    alter publication supabase_realtime add table public.meal_slots;
  end if;
end $$;

alter table public.meal_slots replica identity full;

-- ============================================================================
-- Fin de la migration V4 (Planning — repas de la semaine).
-- ============================================================================
