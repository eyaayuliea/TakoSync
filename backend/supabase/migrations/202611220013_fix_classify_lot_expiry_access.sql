-- Fix for A1 (202611220009): public.classify_lot_expiry is a plain SQL function
-- that calls private.lot_expires_at, and API roles have no access to the private
-- schema. So every API call failed with "permission denied for schema private".
-- It now runs as security definer with a pinned search path. The function only
-- does date arithmetic and reads no tables.
create or replace function public.classify_lot_expiry(
  p_expiration_date date,
  p_now timestamptz default now(),
  p_warning_hours integer default 48,
  p_critical_hours integer default 24
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_expiration_date is null then 'NO_EXPIRY'
    when private.lot_expires_at(p_expiration_date) <= p_now then 'EXPIRED'
    when private.lot_expires_at(p_expiration_date) - p_now <= make_interval(hours => least(p_critical_hours, p_warning_hours)) then 'RED'
    when private.lot_expires_at(p_expiration_date) - p_now <= make_interval(hours => p_warning_hours) then 'YELLOW'
    else 'GREEN'
  end;
$$;
revoke all on function public.classify_lot_expiry(date, timestamptz, integer, integer) from public, anon;
grant execute on function public.classify_lot_expiry(date, timestamptz, integer, integer) to authenticated;
