-- OW-25 c6, c9 / OM-14 c7, c9 (Charter Rev 8 BR-C4, #18): Validate Count and
-- Reject Count.
--
-- Validate Count no longer refuses when stock moved after the count. The
-- difference between the counted quantity and the expected quantity saved with
-- the count is added to the CURRENT balance, so sales and other entries
-- recorded between the count and the validation are preserved.
--
-- Reject Count asks staff for a recount with a reason. It does not change the
-- expected quantity, and a rejected count can no longer be validated.
begin;

-- 1. Reject Count -----------------------------------------------------------------

create table if not exists public.inventory_count_rejections (
  id uuid primary key default gen_random_uuid(),
  daily_stock_count_line_id uuid not null unique references public.daily_stock_count_lines(id),
  daily_stock_check_id uuid not null references public.daily_stock_checks(id),
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  rejected_by uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  rejected_at timestamptz not null default now()
);

comment on table public.inventory_count_rejections is
  'OW-25 c9 / OM-14 c9: counts the owner rejected and asked staff to recount. Stock is not changed.';

alter table public.inventory_count_rejections enable row level security;
drop policy if exists inventory_count_rejections_read_accessible_branches on public.inventory_count_rejections;
create policy inventory_count_rejections_read_accessible_branches on public.inventory_count_rejections
for select to authenticated using (public.can_access_branch(branch_id));
revoke all on table public.inventory_count_rejections from public, anon, authenticated;
grant select on table public.inventory_count_rejections to authenticated;

-- Marks the check reviewed once every discrepancy line is validated or rejected.
create or replace function private.close_reviewed_stock_check(p_check_id uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.daily_stock_checks
  set status = 'validated'
  where id = p_check_id
    and status = 'pending_owner_review'
    and not exists (
      select 1
      from public.daily_stock_count_lines remaining
      left join public.inventory_count_validations completed on completed.daily_stock_count_line_id = remaining.id
      left join public.inventory_count_rejections rejected on rejected.daily_stock_count_line_id = remaining.id
      where remaining.daily_stock_check_id = p_check_id
        and remaining.difference <> 0
        and completed.id is null
        and rejected.id is null
    );
$$;
revoke all on function private.close_reviewed_stock_check(uuid) from public, anon, authenticated, service_role;

create or replace function public.reject_submitted_inventory_count(
  p_count_line_id uuid,
  p_reason text
)
returns public.inventory_count_rejections
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_line public.daily_stock_count_lines%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_rejection public.inventory_count_rejections%rowtype;
begin
  select * into v_owner from public.profiles
  where id = (select auth.uid()) and role = 'owner' and active;
  if not found or not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only an active owner may reject a count';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'A reason of 1 to 1000 characters is required to request a recount';
  end if;

  select * into v_line from public.daily_stock_count_lines where id = p_count_line_id for update;
  if not found then
    raise exception 'The physical count line was not found';
  end if;
  select * into v_check from public.daily_stock_checks where id = v_line.daily_stock_check_id for update;
  if not found or not public.can_access_branch(v_check.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;

  -- A retried rejection returns the one already saved.
  select * into v_rejection from public.inventory_count_rejections where daily_stock_count_line_id = v_line.id;
  if found then
    return v_rejection;
  end if;

  if exists (select 1 from public.inventory_count_validations where daily_stock_count_line_id = v_line.id) then
    raise exception 'This count has already been validated and is locked';
  end if;
  if exists (
    select 1 from public.inventory_count_correction_requests
    where daily_stock_count_line_id = v_line.id and status = 'pending'
  ) then
    raise exception 'Decide the pending correction request before rejecting this count';
  end if;
  if v_check.status <> 'pending_owner_review' then
    raise exception 'The physical count is not pending owner review';
  end if;

  insert into public.inventory_count_rejections (
    daily_stock_count_line_id, daily_stock_check_id, branch_id, ingredient_id, rejected_by, reason
  ) values (
    v_line.id, v_check.id, v_check.branch_id, v_line.ingredient_id, v_owner.id, btrim(p_reason)
  ) returning * into v_rejection;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (v_owner.id, v_check.branch_id, 'inventory.count_rejected',
    format('Count %s line %s rejected for recount: %s', v_check.reference, v_line.id, btrim(p_reason)));

  perform private.close_reviewed_stock_check(v_check.id);
  return v_rejection;
end;
$$;

revoke all on function public.reject_submitted_inventory_count(uuid, text) from public, anon;
grant execute on function public.reject_submitted_inventory_count(uuid, text) to authenticated;
alter function public.reject_submitted_inventory_count(uuid, text) owner to postgres;

-- 2. Validate Count: add the counted difference to the current balance ------------

-- Shared by both validation paths. Returns the adjustment movement.
create or replace function private.post_count_adjustment(
  p_branch_id uuid,
  p_ingredient_id text,
  p_line_id uuid,
  p_delta numeric,
  p_reason text
)
returns public.inventory_movements
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inventory public.branch_inventory%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_name text;
begin
  select * into v_inventory from public.branch_inventory
  where branch_id = p_branch_id and ingredient_id = p_ingredient_id
  for update;
  if not found then
    raise exception 'Inventory is not configured for this branch and ingredient';
  end if;
  if v_inventory.quantity + p_delta < 0 then
    select name into v_name from public.ingredients where id = p_ingredient_id;
    raise exception 'Validating this count would make the expected % negative (% now, adjustment %). Reject the count and ask for a recount instead.',
      coalesce(v_name, p_ingredient_id), v_inventory.quantity, p_delta;
  end if;

  select * into v_movement
  from public.record_inventory_transactions(
    p_branch_id,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', p_ingredient_id,
      'type', 'adjustment',
      'quantity', p_delta,
      'reason', p_reason,
      'notes', 'Validated physical count line ' || p_line_id::text
    ))
  );
  if not found then
    raise exception 'The authorized inventory adjustment was not recorded';
  end if;
  return v_movement;
end;
$$;
revoke all on function private.post_count_adjustment(uuid, text, uuid, numeric, text) from public, anon, authenticated, service_role;

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

  select * into v_line from public.daily_stock_count_lines where id = p_count_line_id for update;
  if not found then
    raise exception 'The physical count line was not found';
  end if;
  select * into v_check from public.daily_stock_checks where id = v_line.daily_stock_check_id for update;
  if not found or v_check.status not in ('pending_owner_review', 'validated') then
    raise exception 'The physical count is not pending owner review';
  end if;
  if not public.can_access_branch(v_check.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;

  select * into v_validation from public.inventory_count_validations where daily_stock_count_line_id = v_line.id;
  if found then
    return v_validation;
  end if;
  if exists (select 1 from public.inventory_count_rejections where daily_stock_count_line_id = v_line.id) then
    raise exception 'This count was rejected for a recount and can no longer be validated';
  end if;
  if exists (
    select 1 from public.inventory_count_correction_requests
    where daily_stock_count_line_id = v_line.id and status = 'pending'
  ) then
    raise exception 'A correction request is pending for this count line';
  end if;
  if v_line.difference = 0 then
    raise exception 'The physical count has no discrepancy to validate';
  end if;

  select quantity_precision into v_precision from public.ingredients where id = v_line.ingredient_id and active;
  if not found then
    raise exception 'Ingredient is not active';
  end if;
  -- BR-C4: counted − expected saved with the count, applied to the current balance.
  v_delta := round(v_line.physical_quantity - v_line.recorded_quantity, v_precision);
  if v_delta = 0 or v_delta <> v_line.difference then
    raise exception 'The stored physical count discrepancy is invalid';
  end if;

  v_movement := private.post_count_adjustment(v_check.branch_id, v_line.ingredient_id, v_line.id, v_delta, btrim(p_reason));

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

  perform private.close_reviewed_stock_check(v_check.id);
  return v_validation;
end;
$$;

create or replace function public.validate_inventory_count_correction(
  p_request_id uuid,
  p_reason text
)
returns public.inventory_count_validations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_request public.inventory_count_correction_requests%rowtype;
  v_line public.daily_stock_count_lines%rowtype;
  v_check public.daily_stock_checks%rowtype;
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

  select * into v_request from public.inventory_count_correction_requests where request_id = p_request_id for update;
  if not found then
    raise exception 'The count correction request was not found';
  end if;
  if not public.can_access_branch(v_request.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if v_request.status <> 'approved' then
    raise exception 'Only an approved correction request can be validated';
  end if;

  select * into v_line from public.daily_stock_count_lines where id = v_request.daily_stock_count_line_id for update;
  if exists (
    select 1 from public.inventory_count_correction_requests
    where daily_stock_count_line_id = v_line.id and status = 'pending'
  ) then
    raise exception 'Another correction request is pending for this count line';
  end if;
  if exists (select 1 from public.inventory_count_rejections where daily_stock_count_line_id = v_line.id) then
    raise exception 'This count was rejected for a recount and can no longer be validated';
  end if;
  select * into v_check from public.daily_stock_checks where id = v_line.daily_stock_check_id;
  select * into v_validation from public.inventory_count_validations where daily_stock_count_line_id = v_line.id;
  if found then
    if v_validation.correction_request_id = v_request.id
      and v_validation.validated_by = v_owner.id
      and v_validation.reason = btrim(p_reason) then
      return v_validation;
    end if;
    raise exception 'This count line has already been validated';
  end if;

  select quantity_precision into v_precision from public.ingredients where id = v_line.ingredient_id and active;
  if not found then
    raise exception 'Ingredient is not active';
  end if;
  -- BR-C4: corrected count − expected saved with the count, applied to the current balance.
  v_delta := round(v_request.corrected_actual_quantity - v_line.recorded_quantity, v_precision);

  if v_delta = 0 then
    insert into public.inventory_count_validations (
      daily_stock_count_line_id, correction_request_id, branch_id, ingredient_id,
      expected_quantity, original_actual_quantity, corrected_actual_quantity,
      outcome, validated_by, reason
    ) values (
      v_line.id, v_request.id, v_check.branch_id, v_line.ingredient_id,
      v_line.recorded_quantity, v_line.physical_quantity, v_request.corrected_actual_quantity,
      'no_change', v_owner.id, btrim(p_reason)
    ) returning * into v_validation;
    return v_validation;
  end if;

  v_movement := private.post_count_adjustment(v_check.branch_id, v_line.ingredient_id, v_line.id, v_delta, btrim(p_reason));

  insert into public.inventory_discrepancy_adjustments (
    daily_stock_count_line_id, daily_stock_check_id, branch_id, ingredient_id,
    recorded_quantity, physical_quantity, difference, approved_by, reason, inventory_movement_id
  ) values (
    v_line.id, v_check.id, v_check.branch_id, v_line.ingredient_id,
    v_line.recorded_quantity, v_request.corrected_actual_quantity, v_delta,
    v_owner.id, btrim(p_reason), v_movement.id
  );

  insert into public.inventory_count_validations (
    daily_stock_count_line_id, correction_request_id, branch_id, ingredient_id,
    expected_quantity, original_actual_quantity, corrected_actual_quantity,
    outcome, validated_by, reason, inventory_movement_id
  ) values (
    v_line.id, v_request.id, v_check.branch_id, v_line.ingredient_id,
    v_line.recorded_quantity, v_line.physical_quantity, v_request.corrected_actual_quantity,
    'adjusted', v_owner.id, btrim(p_reason), v_movement.id
  ) returning * into v_validation;

  -- As before #85, the correction path leaves the check's status alone, so a
  -- saved correction retry still resolves after validation.
  return v_validation;
end;
$$;

revoke all on function public.validate_submitted_inventory_count(uuid, text) from public, anon;
grant execute on function public.validate_submitted_inventory_count(uuid, text) to authenticated;
alter function public.validate_submitted_inventory_count(uuid, text) owner to postgres;
revoke all on function public.validate_inventory_count_correction(uuid, text) from public, anon;
grant execute on function public.validate_inventory_count_correction(uuid, text) to authenticated;
alter function public.validate_inventory_count_correction(uuid, text) owner to postgres;

notify pgrst, 'reload schema';
commit;
