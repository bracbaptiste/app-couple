-- ============================================================================
-- App Couple — Onboarding : rejoindre un couple (V1)
-- ----------------------------------------------------------------------------
-- Le `join_couple_with_code` initial se contentait de rattacher le profil au
-- couple. L'onboarding « Rejoindre » a besoin de plus, et de façon ATOMIQUE :
--
--   1. valider le code d'invitation                      → « Code invalide »
--   2. refuser si le couple a déjà 2 membres (cap V1)     → « Couple complet »
--   3. exiger un prénom                                   → « Prénom requis »
--   4. attribuer la couleur RESTANTE (l'autre est prise)
--   5. poser display_name + color + couple_id sur le profil
--
-- Pourquoi une fonction SECURITY DEFINER : un utilisateur pas encore rattaché
-- ne peut PAS lire les membres du couple cible sous RLS (current_couple_id()
-- est NULL pour lui). Compter les membres et lire la couleur du partenaire
-- doit donc contourner RLS — mais reste borné par auth.uid() + le code secret.
-- ============================================================================

create or replace function public.join_couple(
  p_code         text,
  p_display_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_couple uuid;
  v_count  int;
  v_taken  text[];
  v_color  text;
  v_name   text := nullif(btrim(p_display_name), '');
begin
  if v_name is null then
    raise exception 'Prénom requis';
  end if;

  -- 1. Résolution du code (le code est sur 6 chiffres, on tolère les espaces).
  select id into v_couple
  from public.couples
  where invite_code = btrim(p_code);

  if v_couple is null then
    raise exception 'Code invalide';
  end if;

  -- 2. Plafond V1 : deux membres maximum.
  --    Le caller n'est pas encore rattaché à v_couple, donc non compté ici.
  select count(*), coalesce(array_agg(color), '{}')
    into v_count, v_taken
  from public.profiles
  where couple_id = v_couple;

  if v_count >= 2 then
    raise exception 'Couple complet';
  end if;

  -- 4. Couleur restante : si « sauge » est déjà prise, on prend « brique »,
  --    sinon « sauge » (couvre aussi le couple encore vide, improbable ici).
  if 'sauge' = any(v_taken) then
    v_color := 'brique';
  else
    v_color := 'sauge';
  end if;

  -- 5. Rattachement du profil du caller.
  update public.profiles
  set couple_id    = v_couple,
      display_name = v_name,
      color        = v_color
  where id = auth.uid();

  return v_couple;
end;
$$;

comment on function public.join_couple(text, text) is
  'Onboarding « Rejoindre » : valide le code, refuse un couple complet (cap 2), '
  'attribue la couleur restante et rattache le profil. SECURITY DEFINER, borné '
  'par auth.uid() + code secret.';

-- Mêmes garde-fous d'exécution que les autres fonctions (cf. migration de
-- durcissement) : pas d'accès anon/public, seulement le rôle authentifié.
revoke execute on function public.join_couple(text, text) from public, anon;
grant  execute on function public.join_couple(text, text) to authenticated;
