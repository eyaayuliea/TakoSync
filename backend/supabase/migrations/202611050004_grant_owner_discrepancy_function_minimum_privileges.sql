begin;

-- The SECURITY DEFINER function uses these column privileges
-- only to lock the affected rows with SELECT ... FOR UPDATE.
grant update (id)
  on public.daily_stock_count_lines
  to postgres;

grant update (id)
  on public.branch_inventory
  to postgres;

-- The function records the owner's authorization audit record.
grant insert
  on public.inventory_discrepancy_adjustments
  to postgres;

notify pgrst, 'reload schema';

commit;
