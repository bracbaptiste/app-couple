-- ============================================================================
-- V2.1 « Récurrence » — génération de l'occurrence suivante (étape 3/7)
-- Réf : PRD-taches-v2.1.md §3.3, §3.4
--
-- Comportement : quand une tâche récurrente est cochée comme faite, on crée
-- AUTOMATIQUEMENT une nouvelle tâche pour l'occurrence suivante. On garde
-- l'historique : la tâche cochée reste telle quelle (is_done = true), seule
-- une nouvelle ligne non faite est insérée.
--
-- Mécanisme : fonction trigger + trigger AFTER UPDATE sur `tasks`, déclenché
-- UNIQUEMENT quand is_done passe false -> true ET recurrence_type <> 'none'
-- (cf. clause WHEN du trigger).
--
-- Pas de boucle infinie : le trigger est sur UPDATE uniquement. L'INSERT de
-- l'occurrence suivante (is_done = false) ne le redéclenche donc jamais.
--
-- Calcul de la prochaine échéance à partir de l'actuelle (NEW.due_date) :
--   'daily'   : + recurrence_interval jours
--   'weekly'  : + recurrence_interval × 7 jours (jour de semaine stable)
--   'monthly' : + recurrence_interval mois ; Postgres ramène au dernier jour
--               valide du mois (31 janv. + 1 mois -> 28/29 févr.).
--
-- Garde-fous :
--   - due_date null sur une tâche récurrente -> on ne fait rien.
--   - recurrence_end_date non null ET prochaine date > end_date -> pas de
--     nouvelle tâche (la série est terminée).
--
-- SECURITY DEFINER : l'INSERT doit aboutir quel que soit le rôle qui coche la
-- tâche (RLS de tasks dérive de la liste parente, déjà vérifiée à l'UPDATE).
-- On retire l'EXECUTE large (PUBLIC/anon/authenticated) : c'est un trigger,
-- personne ne doit pouvoir l'appeler via /rest/v1/rpc (cf. migration
-- 20260601130308_harden_function_grants).
-- ============================================================================

create or replace function public.tasks_generate_next_occurrence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_due date;
begin
  -- Une tâche récurrente sans échéance ne peut pas se projeter : on ne fait rien.
  if new.due_date is null then
    return new;
  end if;

  -- Prochaine échéance selon le type de récurrence.
  case new.recurrence_type
    when 'daily' then
      next_due := new.due_date + (new.recurrence_interval);
    when 'weekly' then
      next_due := new.due_date + (new.recurrence_interval * 7);
    when 'monthly' then
      -- date + interval mois -> Postgres clampe au dernier jour valide du mois.
      next_due := (new.due_date + (new.recurrence_interval || ' months')::interval)::date;
    else
      -- Type inconnu (ne devrait pas arriver vu la clause WHEN) : on ignore.
      return new;
  end case;

  -- Fin de série : si la prochaine date dépasse la borne, on n'engendre rien.
  if new.recurrence_end_date is not null and next_due > new.recurrence_end_date then
    return new;
  end if;

  -- Nouvelle occurrence : copie des champs porteurs + récurrence, état remis à neuf.
  insert into public.tasks (
    list_id,
    title,
    assigned_to,
    note,
    recurrence_type,
    recurrence_interval,
    recurrence_weekday,
    recurrence_day_of_month,
    recurrence_end_date,
    due_date,
    is_done,
    done_at,
    done_by,
    position,
    added_by,
    created_at
  ) values (
    new.list_id,
    new.title,
    new.assigned_to,
    new.note,
    new.recurrence_type,
    new.recurrence_interval,
    new.recurrence_weekday,
    new.recurrence_day_of_month,
    new.recurrence_end_date,
    next_due,
    false,
    null,
    null,
    coalesce(new.position, 0),
    new.added_by,
    now()
  );

  return new;
end;
$$;

-- Personne ne doit pouvoir appeler ce trigger directement.
revoke execute on function public.tasks_generate_next_occurrence() from public, anon, authenticated;

-- Trigger : uniquement quand on passe une tâche récurrente de « à faire » à « faite ».
create trigger tasks_generate_next_occurrence_trg
  after update on public.tasks
  for each row
  when (
    new.is_done = true
    and old.is_done = false
    and new.recurrence_type <> 'none'
  )
  execute function public.tasks_generate_next_occurrence();
