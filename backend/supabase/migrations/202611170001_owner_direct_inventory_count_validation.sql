begin;

alter table public.inventory_count_validations
  alter column correction_request_id drop not null;

alter table public.daily_stock_checks
  drop constraint if exists daily_stock_checks_status_check;

alter table public.daily_stock_checks
  add constraint daily_stock_checks_status_check
  check (status in ('submitted', 'pending_owner_review', 'validated'));

create or replace function public.validate_submitted_inventory_count(
  p_count_line_id uuid,
  p_reason text
)
returns public.inventory_count_validations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_line public.daily_stock_count_lines%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_validation public.inventory_count_validations%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_delta numeric(12, 3);
  v_precision integer;
begin
  select * into v_owner
  from public.profiles
  where id = (select auth.uid()) and role = 'owner' and active;
  if not found or not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only an active owner may validate a count';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'A validation reason of 1 to 1000 characters is required';
  end if;

  select * into v_line
  from public.daily_stock_count_lines
  where id = p_count_line_id
  for update;
  if not found then
    raise exception 'The physical count line was not found';
  end if;

  select * into v_check
  from public.daily_stock_checks
  where id = v_line.daily_stock_check_id
  for update;
  if not found or v_check.status not in ('pending_owner_review', 'validated') then
    raise exception 'The physical count is not pending owner review';
  end if;
  if not public.can_access_branch(v_check.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;

  select * into v_validation
  from public.inventory_count_validations
  where daily_stock_count_line_id = v_line.id;
  if found then
    return v_validation;
  end if;

  if exists (
    select 1
    from public.inventory_count_correction_requests
    where daily_stock_count_line_id = v_line.id
      and status = 'pending'
  ) then
    raise exception 'A correction request is pending for this count line';
  end if;
  if v_line.difference = 0 then
    raise exception 'The physical count has no discrepancy to validate';
  end if;

  select * into v_inventory
  from public.branch_inventory
  where branch_id = v_check.branch_id
    and ingredient_id = v_line.ingredient_id
  for update;
  if not found then
    raise exception 'Inventory is not configured for this branch and ingredient';
  end if;
  if v_line.inventory_revision is null
    or v_inventory.inventory_revision <> v_line.inventory_revision
    or v_inventory.quantity <> v_line.recorded_quantity then
    raise exception 'Inventory changed after this count; submit a new physical count before validating';
  end if;

  select quantity_precision into v_precision
  from public.ingredients
  where id = v_line.ingredient_id and active;
  if not found then
    raise exception 'Ingredient is not active';
  end if;
  v_delta := round(v_line.physical_quantity - v_line.recorded_quantity, v_precision);
  if v_delta = 0 or v_delta <> v_line.difference then
    raise exception 'The stored physical count discrepancy is invalid';
  end if;

  select * into v_movement
  from public.record_inventory_transactions(
    v_check.branch_id,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_line.ingredient_id,
      'type', 'adjustment',
      'quantity', v_delta,
      'reason', btrim(p_reason),
      'notes', 'Validated physical count line ' || v_line.id::text
    ))
  );
  if not found then
    raise exception 'The authorized inventory adjustment was not recorded';
  end if;

  insert into public.inventory_discrepancy_adjustments (
    daily_stock_count_line_id, daily_stock_check_id, branch_id, ingredient_id,
    recorded_quantity, physical_quantity, difference, approved_by, reason, inventory_movement_id
  ) values (
    v_line.id, v_check.id, v_check.branch_id, v_line.ingredient_id,
    v_line.recorded_quantity, v_line.physical_quantity, v_line.difference,
    v_owner.id, btrim(p_reason), v_movement.id
  );

  insert into public.inventory_count_validations (
    daily_stock_count_line_id, correction_request_id, branch_id, ingredient_id,
    expected_quantity, original_actual_quantity, corrected_actual_quantity,
    outcome, validated_by, reason, inventory_movement_id
  ) values (
    v_line.id, null, v_check.branch_id, v_line.ingredient_id,
    v_line.recorded_quantity, v_line.physical_quantity, v_line.physical_quantity,
    'adjusted', v_owner.id, btrim(p_reason), v_movement.id
  ) returning * into v_validation;

  if not exists (
    select 1
    from public.daily_stock_count_lines remaining
    left join public.inventory_count_validations completed
      on completed.daily_stock_count_line_id = remaining.id
    where remaining.daily_stock_check_id = v_check.id
      and remaining.difference <> 0
      and completed.id is null
  ) then
    update public.daily_stock_checks
    set status = 'validated'
    where id = v_check.id;
  end if;

  return v_validation;
end;
$$;

revoke all on function public.validate_submitted_inventory_count(uuid, text)
  from public, anon;
grant execute on function public.validate_submitted_inventory_count(uuid, text)
  to authenticated;
alter function public.validate_submitted_inventory_count(uuid, text) owner to postgres;

commit;
