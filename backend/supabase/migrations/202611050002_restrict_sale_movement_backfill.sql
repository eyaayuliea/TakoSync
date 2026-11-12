-- Restrict historical sale movement backfill to privileged maintenance execution.
-- This function must not be executable by anonymous or authenticated clients.

revoke all
on function public.backfill_historical_sale_movements()
from public, anon, authenticated;
