-- ============================================================================
-- App Couple — V4.1 Pilier A (suite) : lectures filtrees + resurrection anti-doublon
-- ----------------------------------------------------------------------------
-- PRD_V4.1 §4.3 (checklist des lectures) + §4.4 (resurrection anti-doublon).
-- Trois fonctions SQL touchent les 5 tables soft-delete et doivent etre mises a
-- jour en CREATE OR REPLACE (pas de nouvelle table, pas de nouvelle policy) :
--
--   1. add_or_merge_list_item : le find-or-create bibliotheque (par
--      nom_normalise) et l'anti-doublon list_items (ligne non cochee) doivent
--      RESSUSCITER une ligne soft-deleted au lieu d'ignorer/dupliquer. Contrainte
--      library_items.unique(couple_id, name) : sans resurrection, recreer un
--      produit du meme nom apres suppression echouerait (23505). Utilisee par le
--      Cerveau (execute.ts) ET la generation de semaine (commit_week_list_lines).
--   2. confirm_meal_removal (retrait cible §8.6) : ne propose jamais une ligne
--      deja supprimee ; et son retrait devient un UPDATE deleted_at (plus jamais
--      un DELETE physique sur list_items, meme depuis ce chemin serveur).
--   3. delete_category_with_replacement : le comptage/reaffectation de rayon
--      ignore les produits deja soft-deleted (sinon un rayon vide en apparence
--      resterait bloque « encore N produits »).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. add_or_merge_list_item
-- ----------------------------------------------------------------------------
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
      and deleted_at is null
  ) then
    raise exception 'Liste introuvable';
  end if;

  -- Un verrou par couple + cle produit evite les doublons simultanes.
  perform pg_advisory_xact_lock(hashtext(v_couple_id::text), hashtext(v_key));

  -- On cherche aussi parmi les lignes soft-deleted (resurrection §4.4) : une
  -- ligne active du meme couple+cle est toujours preferee (ordre : active
  -- d'abord, puis la plus utilisee/ancienne) ; si le seul match est supprime,
  -- on le ressuscite plus bas plutot que d'en creer un doublon.
  select id
    into v_library_item_id
  from public.library_items
  where couple_id = v_couple_id
    and nom_normalise = v_key
  order by (deleted_at is null) desc, usage_count desc, created_at asc
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
  else
    -- Reutilise la ligne trouvee : la ressuscite si besoin (deleted_at = null
    -- est un no-op si elle etait deja active), et compte l'usage si demande.
    update public.library_items
    set usage_count = case when p_count_usage then usage_count + 1 else usage_count end,
        last_used_at = case when p_count_usage then now() else last_used_at end,
        deleted_at = null
    where id = v_library_item_id
      and couple_id = v_couple_id;
  end if;

  -- Un verrou par liste + produit evite deux lignes actives concurrentes.
  perform pg_advisory_xact_lock(hashtext(p_list_id::text), hashtext(v_library_item_id::text));

  -- Ligne non cochee de ce produit dans cette liste, active OU soft-deleted
  -- (resurrection §4.4 : jamais deux lignes actives du meme produit dans une liste).
  select id, coalesce(quantities, '[]'::jsonb)
    into v_list_item_id, v_previous
  from public.list_items
  where list_id = p_list_id
    and library_item_id = v_library_item_id
    and is_checked = false
  order by (deleted_at is null) desc, created_at asc
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
    -- Ressuscite la ligne si elle etait soft-deleted (no-op sinon).
    update public.list_items
    set quantities = v_next,
        deleted_at = null
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

-- ----------------------------------------------------------------------------
-- 2. confirm_meal_removal (retrait cible §8.6)
-- ----------------------------------------------------------------------------
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
      and li.deleted_at is null
      and sc.source_count <= 1
      and li.id = any(coalesce(p_list_item_ids, array[]::uuid[]))
    for update of li
  loop
    v_touched := array_append(v_touched, v_item.list_id);
    -- Soft-delete (PRD_V4.1 §3.1) : plus jamais un DELETE physique, meme depuis
    -- ce chemin serveur — le retrait cible ne propose deja plus jamais une ligne
    -- au-dessus (deleted_at is null dans la CTE), cette ecriture reste coherente.
    update public.list_items
    set deleted_at = now()
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
          and deleted_at is null
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

-- ----------------------------------------------------------------------------
-- 3. delete_category_with_replacement : ignore les produits deja soft-deleted
-- ----------------------------------------------------------------------------
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
  where couple_id = v_couple and category_id = p_category_id and deleted_at is null;

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
    where couple_id = v_couple and category_id = p_category_id and deleted_at is null;
  end if;

  delete from public.categories where id = p_category_id and couple_id = v_couple;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.delete_category_with_replacement(uuid, uuid) from public, anon;
grant execute on function public.delete_category_with_replacement(uuid, uuid) to authenticated;
