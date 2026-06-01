-- ============================================================================
-- App Couple — Durcissement des fonctions SECURITY DEFINER
-- ----------------------------------------------------------------------------
-- Suite à l'audit `get_advisors` (security) après la migration initiale :
--   1. PostgreSQL accorde EXECUTE à PUBLIC par défaut sur toute nouvelle
--      fonction → les fonctions étaient exposées au rôle `anon` via
--      /rest/v1/rpc. On retire cet accès large.
--   2. handle_new_user n'est qu'un trigger : personne ne doit pouvoir l'appeler.
--   3. create_default_categories était SECURITY DEFINER sans contrôle : un
--      utilisateur pouvait insérer des catégories dans le couple d'autrui
--      (contournement RLS). On ajoute un garde-fou d'appartenance.
--
-- Les 4 fonctions qui restent appelables par `authenticated`
-- (current_couple_id, generate_invite_code, join_couple_with_code,
-- create_default_categories) le sont INTENTIONNELLEMENT et sont protégées
-- par auth.uid() / un contrôle d'appartenance. Les WARN résiduels de l'advisor
-- sur ces 4 fonctions sont donc attendus.
-- ============================================================================

-- 3. Garde-fou : le caller doit avoir créé le couple (cas onboarding, où
--    profile.couple_id n'est pas encore posé) OU en être déjà membre.
create or replace function public.create_default_categories(p_couple_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.couples c
    where c.id = p_couple_id
      and (c.created_by = auth.uid() or c.id = public.current_couple_id())
  ) then
    raise exception 'Couple non autorisé';
  end if;

  insert into public.categories (couple_id, name, position)
  values
    (p_couple_id, 'Fruits & Légumes',  0),
    (p_couple_id, 'Viande & Poisson',  1),
    (p_couple_id, 'Crémerie & Œufs',   2),
    (p_couple_id, 'Boulangerie',       3),
    (p_couple_id, 'Surgelés',          4),
    (p_couple_id, 'Épicerie',          5),
    (p_couple_id, 'Boissons',          6),
    (p_couple_id, 'Hygiène',           7),
    (p_couple_id, 'Entretien',         8),
    (p_couple_id, 'Papeterie',         9),
    (p_couple_id, 'Bricolage',        10),
    (p_couple_id, 'Jardinage',        11),
    (p_couple_id, 'Autre',            12);
end;
$$;

-- 1+2. Retire l'EXECUTE large (PUBLIC/anon) ; conserve authenticated où requis.
revoke execute on function public.handle_new_user()               from public, anon, authenticated;
revoke execute on function public.current_couple_id()             from public, anon;
revoke execute on function public.generate_invite_code()          from public, anon;
revoke execute on function public.join_couple_with_code(text)     from public, anon;
revoke execute on function public.create_default_categories(uuid) from public, anon;

-- authenticated conserve l'EXECUTE indispensable :
--   current_couple_id    -> évalué dans les policies RLS
--   generate_invite_code -> appelé par le DEFAULT lors d'un INSERT couples
--   join_couple_with_code / create_default_categories -> RPC onboarding
grant execute on function public.current_couple_id()             to authenticated;
grant execute on function public.generate_invite_code()          to authenticated;
grant execute on function public.join_couple_with_code(text)     to authenticated;
grant execute on function public.create_default_categories(uuid) to authenticated;
