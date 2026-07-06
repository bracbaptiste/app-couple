-- ============================================================================
-- V4.1 — §6.5 : échange des couleurs d'identité du couple
--
-- Aujourd'hui, une fois les deux couleurs prises (sauge / brique), aucun des
-- deux membres ne peut plus jamais changer de couleur (l'autre bloque
-- toujours l'option restante, cf. profile/actions.ts:updateProfile). On
-- ajoute une fonction dédiée qui échange les deux couleurs en une seule
-- transaction (atomique par construction : un unique UPDATE), filtrée par
-- couple_id comme le reste des RPC de ce module (move_category,
-- delete_category_with_replacement).
-- ============================================================================

create or replace function public.swap_couple_colors()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid := public.current_couple_id();
  v_count integer;
begin
  if v_couple is null then
    return jsonb_build_object('ok', false, 'code', 'NO_COUPLE');
  end if;

  -- Verrouille les deux lignes du couple pour la durée de la transaction :
  -- évite qu'une mise à jour concurrente (ex. updateProfile) ne s'intercale
  -- entre la lecture du compte et l'échange.
  perform 1 from public.profiles where couple_id = v_couple for update;

  select count(*) into v_count from public.profiles where couple_id = v_couple;
  if v_count <> 2 then
    return jsonb_build_object('ok', false, 'code', 'NOT_TWO_MEMBERS');
  end if;

  -- Un seul UPDATE inverse les deux couleurs simultanément : jamais d'état
  -- intermédiaire où les deux profils partageraient la même couleur.
  update public.profiles
  set color = case color when 'sauge' then 'brique' else 'sauge' end
  where couple_id = v_couple;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.swap_couple_colors() from public, anon;
grant execute on function public.swap_couple_colors() to authenticated;
