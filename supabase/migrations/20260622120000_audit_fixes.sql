-- Corrections issues de l'audit du 22/06/2026.
-- Les fonctions SECURITY DEFINER exposées ci-dessous valident toujours auth.uid()
-- et ont un search_path figé.

-- L'ancien RPC contournait la limite de deux membres et permettait de déplacer
-- directement un profil. Il est remplacé par join_couple, plus strict.
drop function if exists public.join_couple_with_code(text);

-- Compteur privé de tentatives de code d'invitation. Aucune lecture directe via
-- la Data API : seule join_couple (SECURITY DEFINER) y accède.
create table if not exists public.couple_join_attempts (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts          integer not null default 0 check (attempts >= 0)
);

alter table public.couple_join_attempts enable row level security;
revoke all on table public.couple_join_attempts from public, anon, authenticated;

-- Une adhésion renvoie un résultat structuré afin que les tentatives invalides
-- puissent être comptabilisées sans être annulées par une exception SQL.
drop function if exists public.join_couple(text, text);
create function public.join_couple(p_code text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_name           text := nullif(btrim(p_display_name), '');
  v_couple         uuid;
  v_current_couple uuid;
  v_count          integer;
  v_taken          text[];
  v_color          text;
  v_window         timestamptz;
  v_attempts       integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
  end if;

  insert into public.couple_join_attempts (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select window_started_at, attempts
    into v_window, v_attempts
  from public.couple_join_attempts
  where user_id = v_uid
  for update;

  if v_window < now() - interval '15 minutes' then
    update public.couple_join_attempts
    set window_started_at = now(), attempts = 0
    where user_id = v_uid;
    v_attempts := 0;
  end if;

  if v_attempts >= 5 then
    return jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  end if;

  update public.couple_join_attempts
  set attempts = attempts + 1
  where user_id = v_uid;

  -- Le verrou sur le couple sérialise deux adhésions simultanées : le plafond de
  -- deux membres ne peut plus être dépassé par une course concurrente.
  select id into v_couple
  from public.couples
  where invite_code = btrim(p_code)
  for update;

  if v_couple is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CODE');
  end if;

  select couple_id into v_current_couple
  from public.profiles
  where id = v_uid
  for update;

  if v_current_couple is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER');
  end if;

  select count(*), coalesce(array_agg(color), '{}')
    into v_count, v_taken
  from public.profiles
  where couple_id = v_couple;

  if v_count >= 2 then
    return jsonb_build_object('ok', false, 'code', 'COUPLE_FULL');
  end if;

  v_color := case when 'sauge' = any(v_taken) then 'brique' else 'sauge' end;

  update public.profiles
  set couple_id = v_couple, display_name = left(v_name, 40), color = v_color
  where id = v_uid;

  delete from public.couple_join_attempts where user_id = v_uid;
  return jsonb_build_object('ok', true, 'couple_id', v_couple);
end;
$$;

revoke execute on function public.join_couple(text, text) from public, anon;
grant execute on function public.join_couple(text, text) to authenticated;

-- Création atomique du couple, du profil et des catégories initiales.
create or replace function public.create_couple(p_display_name text, p_color text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_name     text := nullif(btrim(p_display_name), '');
  v_existing uuid;
  v_couple   public.couples%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'NAME_REQUIRED');
  end if;
  if p_color not in ('sauge', 'brique') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_COLOR');
  end if;

  select couple_id into v_existing
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND');
  end if;
  if v_existing is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_MEMBER');
  end if;

  insert into public.couples (created_by)
  values (v_uid)
  returning * into v_couple;

  update public.profiles
  set display_name = left(v_name, 40), color = p_color, couple_id = v_couple.id
  where id = v_uid;

  perform public.create_default_categories(v_couple.id);

  return jsonb_build_object(
    'ok', true,
    'couple_id', v_couple.id,
    'invite_code', v_couple.invite_code
  );
end;
$$;

revoke execute on function public.create_couple(text, text) from public, anon;
grant execute on function public.create_couple(text, text) to authenticated;

-- Les produits créés directement dans la bibliothèque commencent à zéro usage.
-- L'ajout depuis une liste passe explicitement usage_count = 1.
alter table public.library_items alter column usage_count set default 0;

-- Incrément atomique : évite les mises à jour perdues quand les deux membres
-- ajoutent le même produit simultanément.
create or replace function public.increment_library_usage(p_item_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.library_items
  set usage_count = usage_count + 1, last_used_at = now()
  where id = p_item_id
    and couple_id = public.current_couple_id();
$$;

revoke execute on function public.increment_library_usage(uuid) from public, anon;
grant execute on function public.increment_library_usage(uuid) to authenticated;

-- Un list_item n'a de sens que dans une liste de courses accessible. Les quatre
-- policies V1 sont recréées avec le contrôle de type ajouté en V2.
drop policy if exists "list_items_select_via_list" on public.list_items;
drop policy if exists "list_items_insert_via_list" on public.list_items;
drop policy if exists "list_items_update_via_list" on public.list_items;
drop policy if exists "list_items_delete_via_list" on public.list_items;

create policy "list_items_select_via_courses_list"
  on public.list_items for select using (
    exists (select 1 from public.lists l
      where l.id = list_items.list_id and l.kind = 'courses')
  );
create policy "list_items_insert_via_courses_list"
  on public.list_items for insert with check (
    exists (select 1 from public.lists l
      where l.id = list_items.list_id and l.kind = 'courses')
  );
create policy "list_items_update_via_courses_list"
  on public.list_items for update using (
    exists (select 1 from public.lists l
      where l.id = list_items.list_id and l.kind = 'courses')
  ) with check (
    exists (select 1 from public.lists l
      where l.id = list_items.list_id and l.kind = 'courses')
  );
create policy "list_items_delete_via_courses_list"
  on public.list_items for delete using (
    exists (select 1 from public.lists l
      where l.id = list_items.list_id and l.kind = 'courses')
  );

-- Réorganisation atomique de deux catégories voisines.
create or replace function public.move_category(p_category_id uuid, p_direction text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_current public.categories%rowtype;
  v_neighbor public.categories%rowtype;
begin
  if p_direction not in ('up', 'down') then return false; end if;
  perform 1 from public.categories where couple_id = v_couple for update;
  select * into v_current from public.categories
    where id = p_category_id and couple_id = v_couple;
  if not found then return false; end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.categories
      where couple_id = v_couple and position < v_current.position
      order by position desc limit 1;
  else
    select * into v_neighbor from public.categories
      where couple_id = v_couple and position > v_current.position
      order by position asc limit 1;
  end if;
  if not found then return true; end if;

  update public.categories
  set position = case id
    when v_current.id then v_neighbor.position
    when v_neighbor.id then v_current.position
  end
  where id in (v_current.id, v_neighbor.id) and couple_id = v_couple;
  return true;
end;
$$;

revoke execute on function public.move_category(uuid, text) from public, anon;
grant execute on function public.move_category(uuid, text) to authenticated;

-- Réaffectation + suppression atomiques d'une catégorie.
create or replace function public.delete_category_with_replacement(
  p_category_id uuid,
  p_replacement_id uuid default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_count integer;
begin
  perform 1 from public.categories
  where id = p_category_id and couple_id = v_couple
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select count(*) into v_count from public.library_items
  where couple_id = v_couple and category_id = p_category_id;

  if v_count > 0 then
    if p_replacement_id is null or p_replacement_id = p_category_id then
      return jsonb_build_object('ok', false, 'code', 'REPLACEMENT_REQUIRED', 'count', v_count);
    end if;
    perform 1 from public.categories
    where id = p_replacement_id and couple_id = v_couple;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'INVALID_REPLACEMENT');
    end if;
    update public.library_items set category_id = p_replacement_id
    where couple_id = v_couple and category_id = p_category_id;
  end if;

  delete from public.categories where id = p_category_id and couple_id = v_couple;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.delete_category_with_replacement(uuid, uuid) from public, anon;
grant execute on function public.delete_category_with_replacement(uuid, uuid) to authenticated;
