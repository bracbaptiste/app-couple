-- ============================================================================
-- App Couple - Correctifs fiabilite V4
-- ----------------------------------------------------------------------------
-- Objectifs:
--   1. Fusionner les quantites cote base sans perte si deux membres agissent
--      en meme temps.
--   2. Rendre la generation de liste et le retrait de repas transactionnels.
--   3. Remplacer recette + ingredients dans une seule transaction.
--   4. Ajouter une limite simple sur les routes IA payantes.
-- ============================================================================

-- Fusion pure des quantites stockees en jsonb.
create or replace function public.merge_quantities(
  p_existing jsonb,
  p_additions jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_result jsonb := case
    when jsonb_typeof(coalesce(p_existing, '[]'::jsonb)) = 'array'
      then coalesce(p_existing, '[]'::jsonb)
    else '[]'::jsonb
  end;
  v_add jsonb;
  v_raw jsonb;
  v_value double precision;
  v_unit text;
  v_elem jsonb;
  v_ord bigint;
  v_match_ord bigint;
  v_before double precision;
  v_next jsonb;
begin
  if jsonb_typeof(coalesce(p_additions, '[]'::jsonb)) <> 'array' then
    raise exception 'Quantites invalides';
  end if;

  for v_add in select value from jsonb_array_elements(coalesce(p_additions, '[]'::jsonb))
  loop
    if jsonb_typeof(v_add) <> 'object' then
      continue;
    end if;

    v_raw := coalesce(v_add -> 'quantite', v_add -> 'valeur');
    if v_raw is null or jsonb_typeof(v_raw) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_raw) <> 'number' then
      raise exception 'Quantite invalide';
    end if;

    v_value := (v_raw #>> '{}')::double precision;
    v_unit := v_add ->> 'unite';

    if v_unit = 'kg' then
      v_value := v_value * 1000;
      v_unit := 'g';
    elsif v_unit = 'l' then
      v_value := v_value * 1000;
      v_unit := 'ml';
    elsif v_unit not in ('g', 'ml', 'piece') then
      v_unit := null;
    end if;

    v_match_ord := null;
    v_before := null;

    for v_elem, v_ord in
      select value, ordinality
      from jsonb_array_elements(v_result) with ordinality
    loop
      if (v_elem ->> 'unite') is not distinct from v_unit then
        v_match_ord := v_ord;
        v_before := coalesce((v_elem ->> 'valeur')::double precision, 0);
        exit;
      end if;
    end loop;

    if v_match_ord is null then
      v_result := v_result || jsonb_build_array(
        jsonb_build_object('valeur', v_value, 'unite', v_unit)
      );
    else
      v_next := '[]'::jsonb;
      for v_elem, v_ord in
        select value, ordinality
        from jsonb_array_elements(v_result) with ordinality
      loop
        if v_ord = v_match_ord then
          v_next := v_next || jsonb_build_array(
            jsonb_build_object('valeur', v_before + v_value, 'unite', v_unit)
          );
        else
          v_next := v_next || jsonb_build_array(v_elem);
        end if;
      end loop;
      v_result := v_next;
    end if;
  end loop;

  return v_result;
end;
$$;

revoke execute on function public.merge_quantities(jsonb, jsonb) from public, anon;
grant execute on function public.merge_quantities(jsonb, jsonb) to authenticated;

-- Find-or-create bibliotheque + fusion active de ligne de courses.
create or replace function public.add_or_merge_list_item(
  p_list_id uuid,
  p_name text,
  p_nom_normalise text,
  p_category_name text,
  p_added_by uuid,
  p_additions jsonb,
  p_count_usage boolean default true
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_key text := nullif(btrim(coalesce(p_nom_normalise, '')), '');
  v_category_id uuid;
  v_library_item_id uuid;
  v_list_item_id uuid;
  v_previous jsonb := '[]'::jsonb;
  v_next jsonb;
  v_created_library boolean := false;
  v_created_list_item boolean := false;
begin
  if v_couple_id is null or p_added_by is distinct from auth.uid() then
    raise exception 'Non autorise';
  end if;
  if v_name is null or v_key is null then
    raise exception 'Article invalide';
  end if;

  if not exists (
    select 1
    from public.lists
    where id = p_list_id
      and couple_id = v_couple_id
      and kind = 'courses'
  ) then
    raise exception 'Liste introuvable';
  end if;

  -- Un verrou par couple + cle produit evite les doublons simultanes.
  perform pg_advisory_xact_lock(hashtext(v_couple_id::text), hashtext(v_key));

  select id
    into v_library_item_id
  from public.library_items
  where couple_id = v_couple_id
    and nom_normalise = v_key
  order by usage_count desc, created_at asc
  limit 1
  for update;

  if v_library_item_id is null then
    select id
      into v_category_id
    from public.categories
    where couple_id = v_couple_id
      and lower(name) = lower(coalesce(p_category_name, 'Autre'))
    limit 1;

    insert into public.library_items (
      couple_id,
      name,
      nom_normalise,
      category_id,
      usage_count,
      last_used_at
    )
    values (
      v_couple_id,
      v_name,
      v_key,
      v_category_id,
      case when p_count_usage then 1 else 0 end,
      now()
    )
    returning id into v_library_item_id;

    v_created_library := true;
  elsif p_count_usage then
    update public.library_items
    set usage_count = usage_count + 1,
        last_used_at = now()
    where id = v_library_item_id
      and couple_id = v_couple_id;
  end if;

  -- Un verrou par liste + produit evite deux lignes actives concurrentes.
  perform pg_advisory_xact_lock(hashtext(p_list_id::text), hashtext(v_library_item_id::text));

  select id, coalesce(quantities, '[]'::jsonb)
    into v_list_item_id, v_previous
  from public.list_items
  where list_id = p_list_id
    and library_item_id = v_library_item_id
    and is_checked = false
  order by created_at asc
  limit 1
  for update;

  v_next := public.merge_quantities(v_previous, p_additions);

  if v_list_item_id is null then
    insert into public.list_items (
      list_id,
      library_item_id,
      added_by,
      quantities
    )
    values (
      p_list_id,
      v_library_item_id,
      p_added_by,
      v_next
    )
    returning id into v_list_item_id;

    v_previous := '[]'::jsonb;
    v_created_list_item := true;
  else
    update public.list_items
    set quantities = v_next
    where id = v_list_item_id
      and list_id = p_list_id;
  end if;

  return jsonb_build_object(
    'library_item_id', v_library_item_id,
    'list_item_id', v_list_item_id,
    'created_library_item', v_created_library,
    'created_list_item', v_created_list_item,
    'previous_quantities', v_previous,
    'quantities', v_next
  );
end;
$$;

revoke execute on function public.add_or_merge_list_item(uuid, text, text, text, uuid, jsonb, boolean) from public, anon;
grant execute on function public.add_or_merge_list_item(uuid, text, text, text, uuid, jsonb, boolean) to authenticated;

-- Generation de semaine: toutes les lignes + leur provenance dans un seul appel.
create or replace function public.commit_week_list_lines(
  p_list_id uuid,
  p_added_by uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_line jsonb;
  v_key text;
  v_name text;
  v_category text;
  v_additions jsonb;
  v_meals jsonb;
  v_meal_text text;
  v_meal_id uuid;
  v_res jsonb;
  v_results jsonb := '[]'::jsonb;
  v_origin text;
begin
  if v_couple_id is null or p_added_by is distinct from auth.uid() then
    raise exception 'Non autorise';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Lignes invalides';
  end if;

  for v_line in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Ligne invalide';
    end if;

    v_key := nullif(btrim(coalesce(v_line ->> 'key', '')), '');
    v_name := nullif(btrim(coalesce(v_line ->> 'name', '')), '');
    v_category := coalesce(nullif(btrim(coalesce(v_line ->> 'category', '')), ''), 'Autre');
    v_additions := coalesce(v_line -> 'additions', '[]'::jsonb);
    v_meals := coalesce(v_line -> 'meal_slot_ids', '[]'::jsonb);

    if v_key is null or v_name is null then
      raise exception 'Ligne invalide';
    end if;
    if jsonb_typeof(v_meals) <> 'array' then
      raise exception 'Provenance invalide';
    end if;
    if jsonb_array_length(v_meals) = 0 then
      raise exception 'Provenance manquante';
    end if;

    v_res := public.add_or_merge_list_item(
      p_list_id,
      v_name,
      v_key,
      v_category,
      p_added_by,
      v_additions,
      true
    );

    v_origin := case
      when coalesce((v_res ->> 'created_list_item')::boolean, false)
        then 'generation'
      else 'fusion'
    end;

    for v_meal_text in select value from jsonb_array_elements_text(v_meals)
    loop
      v_meal_id := v_meal_text::uuid;
      if not exists (
        select 1
        from public.meal_slots
        where id = v_meal_id
          and couple_id = v_couple_id
      ) then
        raise exception 'Repas introuvable';
      end if;

      insert into public.meal_slot_sources (meal_slot_id, list_item_id, origine)
      values (
        v_meal_id,
        (v_res ->> 'list_item_id')::uuid,
        v_origin
      )
      on conflict (meal_slot_id, list_item_id) do nothing;
    end loop;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('key', v_key, 'name', v_name) || v_res
    );
  end loop;

  return v_results;
end;
$$;

revoke execute on function public.commit_week_list_lines(uuid, uuid, jsonb) from public, anon;
grant execute on function public.commit_week_list_lines(uuid, uuid, jsonb) to authenticated;

-- Retrait/remplacement de repas avec suppression d'articles dans une transaction.
create or replace function public.confirm_meal_removal(
  p_slot_id uuid,
  p_list_item_ids uuid[],
  p_mode text,
  p_recipe_id uuid,
  p_texte text,
  p_created_by uuid
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_slot record;
  v_item record;
  v_touched uuid[] := array[]::uuid[];
  v_clean_text text;
begin
  if v_couple_id is null or p_created_by is distinct from auth.uid() then
    raise exception 'Non autorise';
  end if;

  select id, date, creneau
    into v_slot
  from public.meal_slots
  where id = p_slot_id
    and couple_id = v_couple_id
  for update;

  if not found then
    raise exception 'Repas introuvable';
  end if;

  for v_item in
    with source_counts as (
      select list_item_id, count(*)::int as source_count
      from public.meal_slot_sources
      group by list_item_id
    )
    select li.id, li.list_id
    from public.meal_slot_sources src
    join public.list_items li on li.id = src.list_item_id
    join source_counts sc on sc.list_item_id = li.id
    where src.meal_slot_id = p_slot_id
      and src.origine = 'generation'
      and li.is_checked = false
      and sc.source_count <= 1
      and li.id = any(coalesce(p_list_item_ids, array[]::uuid[]))
    for update of li
  loop
    v_touched := array_append(v_touched, v_item.list_id);
    delete from public.list_items
    where id = v_item.id
      and list_id = v_item.list_id;
  end loop;

  if p_mode = 'clear' then
    delete from public.meal_slots
    where id = p_slot_id
      and couple_id = v_couple_id;
  elsif p_mode = 'replace' then
    delete from public.meal_slot_sources
    where meal_slot_id = p_slot_id;

    if p_recipe_id is not null then
      if not exists (
        select 1
        from public.recipes
        where id = p_recipe_id
          and couple_id = v_couple_id
      ) then
        raise exception 'Recette introuvable';
      end if;

      update public.meal_slots
      set type = 'recette',
          recipe_id = p_recipe_id,
          texte = null,
          created_by = p_created_by
      where id = p_slot_id
        and couple_id = v_couple_id;
    else
      v_clean_text := nullif(btrim(coalesce(p_texte, '')), '');
      if v_clean_text is null then
        raise exception 'Repas invalide';
      end if;

      update public.meal_slots
      set type = 'texte',
          recipe_id = null,
          texte = left(v_clean_text, 80),
          created_by = p_created_by
      where id = p_slot_id
        and couple_id = v_couple_id;
    end if;
  else
    raise exception 'Mode invalide';
  end if;

  return jsonb_build_object(
    'touched_list_ids',
    coalesce(to_jsonb((select array_agg(distinct x) from unnest(v_touched) as x)), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.confirm_meal_removal(uuid, uuid[], text, uuid, text, uuid) from public, anon;
grant execute on function public.confirm_meal_removal(uuid, uuid[], text, uuid, text, uuid) to authenticated;

-- Edition de recette + remplacement complet des ingredients.
create or replace function public.update_recipe_with_ingredients(
  p_recipe_id uuid,
  p_titre text,
  p_duree_minutes int,
  p_type_plat text,
  p_tags text[],
  p_nombre_personnes int,
  p_calories_par_portion int,
  p_proteines_g numeric,
  p_glucides_g numeric,
  p_lipides_g numeric,
  p_etapes jsonb,
  p_ingredients jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_couple_id uuid := public.current_couple_id();
  v_ing jsonb;
  v_nom text;
  v_key text;
  v_unit text;
  v_qty numeric;
  v_order int;
begin
  if v_couple_id is null then
    raise exception 'Non autorise';
  end if;
  if jsonb_typeof(coalesce(p_ingredients, '[]'::jsonb)) <> 'array' then
    raise exception 'Ingredients invalides';
  end if;

  update public.recipes
  set titre = p_titre,
      duree_minutes = p_duree_minutes,
      type_plat = p_type_plat,
      tags = coalesce(p_tags, array[]::text[]),
      nombre_personnes = p_nombre_personnes,
      calories_par_portion = p_calories_par_portion,
      proteines_g = p_proteines_g,
      glucides_g = p_glucides_g,
      lipides_g = p_lipides_g,
      etapes = case
        when jsonb_typeof(coalesce(p_etapes, '[]'::jsonb)) = 'array'
          then coalesce(p_etapes, '[]'::jsonb)
        else '[]'::jsonb
      end
  where id = p_recipe_id
    and couple_id = v_couple_id;

  if not found then
    raise exception 'Recette introuvable';
  end if;

  delete from public.recipe_ingredients
  where recipe_id = p_recipe_id;

  for v_ing in select value from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb))
  loop
    if jsonb_typeof(v_ing) <> 'object' then
      continue;
    end if;

    v_nom := nullif(btrim(coalesce(v_ing ->> 'nom', '')), '');
    v_key := nullif(btrim(coalesce(v_ing ->> 'nom_normalise', '')), '');
    if v_nom is null or v_key is null then
      continue;
    end if;

    v_unit := v_ing ->> 'unite';
    if v_unit not in ('g', 'ml', 'piece') then
      v_unit := null;
    end if;

    if jsonb_typeof(v_ing -> 'quantite') = 'number' then
      v_qty := (v_ing ->> 'quantite')::numeric;
    else
      v_qty := null;
    end if;

    v_order := coalesce((v_ing ->> 'ordre')::int, 0);

    insert into public.recipe_ingredients (
      recipe_id,
      nom_affiche,
      nom_normalise,
      quantite,
      unite,
      ordre
    )
    values (
      p_recipe_id,
      v_nom,
      v_key,
      v_qty,
      v_unit,
      v_order
    );
  end loop;
end;
$$;

revoke execute on function public.update_recipe_with_ingredients(uuid, text, int, text, text[], int, int, numeric, numeric, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.update_recipe_with_ingredients(uuid, text, int, text, text[], int, int, numeric, numeric, numeric, jsonb, jsonb) to authenticated;

-- Limite d'usage des routes IA.
create table if not exists public.ai_route_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  route text not null,
  window_start timestamptz not null,
  count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, route, window_start)
);

alter table public.ai_route_limits enable row level security;

drop policy if exists "ai_route_limits_select_own_user" on public.ai_route_limits;
drop policy if exists "ai_route_limits_insert_own_user" on public.ai_route_limits;
drop policy if exists "ai_route_limits_update_own_user" on public.ai_route_limits;

create policy "ai_route_limits_select_own_user"
  on public.ai_route_limits for select
  using (user_id = auth.uid());

create policy "ai_route_limits_insert_own_user"
  on public.ai_route_limits for insert
  with check (user_id = auth.uid());

create policy "ai_route_limits_update_own_user"
  on public.ai_route_limits for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.ai_route_limits to authenticated;

create or replace function public.check_ai_rate_limit(
  p_route text,
  p_limit int default 12,
  p_window_seconds int default 60
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_seconds int := greatest(coalesce(p_window_seconds, 60), 10);
  v_limit int := greatest(coalesce(p_limit, 1), 1);
  v_window_start timestamptz;
  v_count int;
  v_retry_after int;
begin
  if v_user_id is null then
    raise exception 'Non authentifie';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / v_window_seconds) * v_window_seconds
  );

  insert into public.ai_route_limits (user_id, route, window_start, count)
  values (v_user_id, p_route, v_window_start, 1)
  on conflict (user_id, route, window_start)
  do update
    set count = public.ai_route_limits.count + 1,
        updated_at = now()
  returning count into v_count;

  v_retry_after := greatest(
    1,
    ceil(extract(epoch from (v_window_start + make_interval(secs => v_window_seconds) - now())))::int
  );

  return jsonb_build_object(
    'ok', v_count <= v_limit,
    'count', v_count,
    'limit', v_limit,
    'retry_after_seconds', v_retry_after
  );
end;
$$;

revoke execute on function public.check_ai_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_ai_rate_limit(text, int, int) to authenticated;
