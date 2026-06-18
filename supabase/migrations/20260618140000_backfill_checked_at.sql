-- Backfill checked_at pour les articles cochés avant son stampillage.
--
-- `checked_at` n'est renseigné par l'app que depuis le 04/06/2026. Les articles
-- cochés avant cette date ont is_checked = true mais checked_at = NULL. Or la
-- liste de courses ne charge plus que `is_checked = false OR checked_at >= -24h`,
-- et l'historique des achats ne garde que les lignes horodatées : ces articles
-- disparaissaient donc des deux écrans.
--
-- On leur donne pour date d'achat leur date de création (meilleure estimation
-- disponible) afin qu'ils rejoignent proprement l'historique. No-op si aucune
-- ligne ne correspond.
update public.list_items
set checked_at = created_at
where is_checked = true
  and checked_at is null;
