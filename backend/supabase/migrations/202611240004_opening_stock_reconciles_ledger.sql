-- OW-28 c5 with OW-04 c9 / OW-13 c4: an opening stock entry also records any
-- balance that has no ledger movements (stock seeded or migrated before the
-- ledger), as an "Opening stock (balance recorded before the ledger)"
-- adjustment that leaves the balance unchanged. The entered quantity is then
-- posted as before (Stock-In or adjustment "Opening stock"). After an opening
-- entry, the item's balance equals the sum of its ledger movements.
-- Replaces record_opening_stock from 202611240003; nothing else changes.
begin;

create or replace function public.record_opening_stock(p_branch_id uuid, p_ingredient_id text, p_quantity numeric)
returns public.opening_stock_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_go_live public.business_go_live%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_branch public.branches%rowtype;
  v_delta numeric;
  v_ledger numeric;
  v_unrecorded numeric;
  v_movement public.inventory_movements%rowtype;
  v_entry public.opening_stock_entries%rowtype;
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  select * into v_owner from public.profiles where id = (select auth.uid()) and active and role = 'owner';
  if not found then
    raise exception using errcode = '42501', message = 'Only the owner can enter opening stock';
  end if;
  select * into v_go_live from public.business_go_live where id;
  if found then
    raise exception 'The opening stock is locked since go-live on %. Stock changes only through recorded transactions.',
      to_char(v_go_live.go_live_date, 'DD Mon YYYY');
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'The opening stock must be zero or greater.';
  end if;
  if p_quantity <> round(p_quantity, 3) then
    raise exception 'The opening stock can have at most three decimal places.';
  end if;
  select * into v_branch from public.branches where id = p_branch_id and active;
  if not found then raise exception 'The branch is unavailable.'; end if;
  select * into v_ingredient from public.ingredients where id = p_ingredient_id and active;
  if not found then raise exception 'The item is unavailable.'; end if;

  perform pg_advisory_xact_lock(hashtext('opening_stock:' || p_branch_id::text || ':' || p_ingredient_id));
  if exists (select 1 from public.opening_stock_entries where branch_id = p_branch_id and ingredient_id = p_ingredient_id) then
    raise exception 'The opening stock of % at Branch % was already entered. It can be entered only once.',
      v_ingredient.name, nullif(regexp_replace(v_branch.code, '\D', '', 'g'), '')::int;
  end if;

  select * into v_inventory from public.branch_inventory where branch_id = p_branch_id and ingredient_id = p_ingredient_id;
  if not found then raise exception 'The item is not configured for this branch.'; end if;

  -- OW-04 c9 / OW-13 c4: stock that predates the ledger (seeded or migrated
  -- balances) is first recorded as its own movement, without changing the
  -- balance, so that afterwards the balance equals the sum of the ledger.
  select coalesce(sum(movement), 0) into v_ledger
  from public.inventory_movements where branch_id = p_branch_id and ingredient_id = p_ingredient_id;
  v_unrecorded := v_inventory.quantity - v_ledger;
  if v_unrecorded <> 0 then
    insert into public.inventory_movements (
      reference, branch_id, ingredient_id, actor_id, type, quantity, unit, movement,
      before_quantity, after_quantity, transaction_date, reason, notes
    ) values (
      'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      p_branch_id, p_ingredient_id, v_owner.id, 'adjustment'::public.inventory_transaction_type,
      abs(v_unrecorded), v_ingredient.unit, v_unrecorded, v_ledger, v_inventory.quantity, now(),
      'Opening stock (balance recorded before the ledger)', 'opening stock entry'
    );
  end if;

  v_delta := p_quantity - v_inventory.quantity;
  if v_delta > 0 then
    select * into v_movement from public.record_inventory_transactions(p_branch_id, jsonb_build_array(jsonb_build_object(
      'ingredient_id', p_ingredient_id, 'type', 'stock_in', 'quantity', v_delta,
      'reason', 'Opening stock', 'notes', 'opening stock entry'))) limit 1;
  elsif v_delta < 0 then
    select * into v_movement from public.record_inventory_transactions(p_branch_id, jsonb_build_array(jsonb_build_object(
      'ingredient_id', p_ingredient_id, 'type', 'adjustment', 'quantity', v_delta,
      'reason', 'Opening stock', 'notes', 'opening stock entry'))) limit 1;
  end if;

  insert into public.opening_stock_entries (branch_id, ingredient_id, quantity, unit, previous_quantity, inventory_movement_id, recorded_by)
  values (p_branch_id, p_ingredient_id, p_quantity, v_ingredient.unit, v_inventory.quantity, v_movement.id, v_owner.id)
  returning * into v_entry;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (v_owner.id, p_branch_id, 'inventory.opening_stock',
    format('Opening stock of %s: %s %s (was %s)', v_ingredient.name, trim_scale(p_quantity), v_ingredient.unit, trim_scale(v_inventory.quantity)));
  return v_entry;
end;
$$;

revoke all on function public.record_opening_stock(uuid, text, numeric) from public, anon;
grant execute on function public.record_opening_stock(uuid, text, numeric) to authenticated;
alter function public.record_opening_stock(uuid, text, numeric) owner to postgres;

notify pgrst, 'reload schema';
commit;
