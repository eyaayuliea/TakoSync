begin;

create table public.inventory_count_correction_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  daily_stock_count_line_id uuid not null
    references public.daily_stock_count_lines(id) on delete restrict,
  daily_stock_check_id uuid not null
    references public.daily_stock_checks(id) on delete restrict,
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  requested_by uuid not null references public.profiles(id),
  corrected_actual_quantity numeric(12, 3) not null
    check (corrected_actual_quantity >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references public.profiles(id),
  decision_reason text,
  decided_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'pending' and decided_by is null and decision_reason is null and decided_at is null)
    or (status <> 'pending' and decided_by is not null and decision_reason is not null and decided_at is not null)
  )
);

create unique index inventory_count_one_pending_correction_per_line
  on public.inventory_count_correction_requests (daily_stock_count_line_id)
  where status = 'pending';
create index inventory_count_correction_branch_status_idx
  on public.inventory_count_correction_requests (branch_id, status, created_at desc);

create table public.inventory_count_validations (
  id uuid primary key default gen_random_uuid(),
  daily_stock_count_line_id uuid not null unique
    references public.daily_stock_count_lines(id) on delete restrict,
  correction_request_id uuid not null unique
    references public.inventory_count_correction_requests(id) on delete restrict,
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  expected_quantity numeric(12, 3) not null check (expected_quantity >= 0),
  original_actual_quantity numeric(12, 3) not null check (original_actual_quantity >= 0),
  corrected_actual_quantity numeric(12, 3) not null check (corrected_actual_quantity >= 0),
  outcome text not null check (outcome in ('adjusted', 'no_change')),
  validated_by uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  inventory_movement_id uuid unique references public.inventory_movements(id) on delete restrict,
  validated_at timestamptz not null default clock_timestamp(),
  check (
    (outcome = 'adjusted' and inventory_movement_id is not null)
    or (outcome = 'no_change' and inventory_movement_id is null)
  )
);

create index inventory_count_validations_branch_idx
  on public.inventory_count_validations (branch_id, validated_at desc);

alter table public.inventory_count_correction_requests enable row level security;
alter table public.inventory_count_validations enable row level security;

create policy inventory_count_correction_branch_read
  on public.inventory_count_correction_requests
  for select to authenticated
  using (public.can_access_branch(branch_id));
create policy inventory_count_correction_owner_read
  on public.inventory_count_correction_requests
  for select to authenticated
  using (public.is_active_owner());
create policy inventory_count_validation_branch_read
  on public.inventory_count_validations
  for select to authenticated
  using (public.can_access_branch(branch_id));
create policy inventory_count_validation_owner_read
  on public.inventory_count_validations
  for select to authenticated
  using (public.is_active_owner());

revoke all on public.inventory_count_correction_requests,
  public.inventory_count_validations from public, anon, authenticated;
grant select on public.inventory_count_correction_requests,
  public.inventory_count_validations to authenticated;

create or replace function public.submit_daily_stock_check(
  p_branch_id uuid,
  p_check_date date,
  p_remarks text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_line jsonb;
  v_inventory public.branch_inventory%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_expected numeric(12, 3);
  v_physical numeric(12, 3);
  v_revision bigint;
  v_difference numeric(12, 3);
  v_discrepancies integer := 0;
  v_count integer := 0;
  v_reference text;
  v_line_results jsonb := '[]'::jsonb;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then
    raise exception using errcode = '42501', message = 'An active user profile is required';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one count line is required';
  end if;

  v_reference := 'IC-' || to_char(coalesce(p_check_date, current_date), 'YYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.daily_stock_checks (
    reference, branch_id, submitted_by, check_date, remarks, status
  ) values (
    v_reference, p_branch_id, v_profile.id, coalesce(p_check_date, current_date),
    coalesce(p_remarks, ''), 'submitted'
  ) returning * into v_check;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or v_line ->> 'ingredient_id' is null
      or v_line ->> 'recorded_quantity' is null
      or v_line ->> 'physical_quantity' is null
      or v_line ->> 'inventory_revision' is null then
      raise exception 'Each count line requires ingredient, pinned quantity, physical quantity, and inventory revision';
    end if;
    v_expected := (v_line ->> 'recorded_quantity')::numeric;
    v_physical := (v_line ->> 'physical_quantity')::numeric;
    v_revision := (v_line ->> 'inventory_revision')::bigint;
    if v_expected < 0 or v_physical < 0 or v_revision < 0 then
      raise exception 'Count quantities and inventory revisions must be zero or greater';
    end if;

    select * into v_inventory
    from public.branch_inventory
    where branch_id = p_branch_id
      and ingredient_id = v_line ->> 'ingredient_id'
    for update;
    if not found then
      raise exception 'Ingredient is not configured for this branch';
    end if;
    if v_inventory.quantity <> v_expected or v_inventory.inventory_revision <> v_revision then
      raise exception 'Inventory changed after this count began; restart the count before submitting';
    end if;

    select * into v_ingredient
    from public.ingredients
    where id = v_inventory.ingredient_id and active;
    if not found then
      raise exception 'Ingredient is not active';
    end if;
    if round(v_expected, v_ingredient.quantity_precision) <> v_expected
      or round(v_physical, v_ingredient.quantity_precision) <> v_physical then
      raise exception 'Count quantities do not match the ingredient precision';
    end if;
    v_difference := round(v_physical - v_expected, v_ingredient.quantity_precision);
    if v_difference <> 0 then
      v_discrepancies := v_discrepancies + 1;
    end if;

    insert into public.daily_stock_count_lines (
      daily_stock_check_id, ingredient_id, recorded_quantity, physical_quantity, difference, unit,
      inventory_revision
    ) values (
      v_check.id, v_inventory.ingredient_id, v_expected, v_physical, v_difference,
      v_ingredient.unit, v_revision
    );
    v_line_results := v_line_results || jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_inventory.ingredient_id,
      'recorded_quantity', v_expected,
      'physical_quantity', v_physical,
      'difference', v_difference,
      'unit', v_ingredient.unit,
      'inventory_revision', v_revision
    ));
    v_count := v_count + 1;
  end loop;

  if v_discrepancies > 0 then
    update public.daily_stock_checks
    set status = 'pending_owner_review'
    where id = v_check.id
    returning * into v_check;
  end if;
  return jsonb_build_object(
    'id', v_check.id,
    'reference', v_check.reference,
    'status', v_check.status,
    'counted', v_count,
    'discrepancies', v_discrepancies,
    'check_date', v_check.check_date,
    'lines', v_line_results
  );
end;
$$;

create or replace function public.request_inventory_count_correction(
  p_count_line_id uuid,
  p_request_id uuid,
  p_corrected_actual_quantity numeric,
  p_reason text
)
returns public.inventory_count_correction_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_line public.daily_stock_count_lines%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_request public.inventory_count_correction_requests%rowtype;
  v_precision integer;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then
    raise exception using errcode = '42501', message = 'An active Staff account is required';
  end if;
  if v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'Only Staff may request a count correction';
  end if;
  if p_request_id is null then
    raise exception 'A correction request ID is required';
  end if;
  if p_corrected_actual_quantity is null or p_corrected_actual_quantity < 0 then
    raise exception 'Corrected actual quantity must be zero or greater';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'A correction reason of 1 to 1000 characters is required';
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
  if not found or v_check.submitted_by <> v_profile.id then
    raise exception using errcode = '42501', message = 'This count line does not belong to the authenticated Staff account';
  end if;
  if not public.can_access_branch(v_check.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if v_check.status <> 'pending_owner_review' then
    raise exception 'Only a submitted count discrepancy can be corrected';
  end if;
  select * into v_request
  from public.inventory_count_correction_requests
  where request_id = p_request_id;
  if found then
    if v_request.requested_by <> v_profile.id
      or v_request.branch_id <> v_check.branch_id
      or v_request.daily_stock_count_line_id <> v_line.id
      or v_request.corrected_actual_quantity <> p_corrected_actual_quantity
      or v_request.reason <> btrim(p_reason) then
      raise exception 'Correction request ID was already used with a different payload';
    end if;
    return v_request;
  end if;

  if exists (
    select 1 from public.inventory_count_validations
    where daily_stock_count_line_id = v_line.id
  ) or exists (
    select 1 from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = v_line.id
  ) then
    raise exception 'This count line has already been validated or adjusted';
  end if;

  select quantity_precision into v_precision
  from public.ingredients
  where id = v_line.ingredient_id and active;
  if not found then
    raise exception 'Ingredient is not active';
  end if;
  if round(p_corrected_actual_quantity, v_precision) <> p_corrected_actual_quantity then
    raise exception 'Corrected quantity does not match the ingredient precision';
  end if;

  if exists (
    select 1 from public.inventory_count_correction_requests
    where daily_stock_count_line_id = v_line.id and status = 'pending'
  ) then
    raise exception 'A correction request is already pending for this count line';
  end if;

  insert into public.inventory_count_correction_requests (
    request_id, daily_stock_count_line_id, daily_stock_check_id, branch_id, ingredient_id,
    requested_by, corrected_actual_quantity, reason
  ) values (
    p_request_id, v_line.id, v_check.id, v_check.branch_id, v_line.ingredient_id,
    v_profile.id, p_corrected_actual_quantity, btrim(p_reason)
  ) returning * into v_request;
  return v_request;
end;
$$;

create or replace function public.decide_inventory_count_correction(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns public.inventory_count_correction_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_request public.inventory_count_correction_requests%rowtype;
begin
  select * into v_owner
  from public.profiles
  where id = (select auth.uid()) and role = 'owner' and active;
  if not found or not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only an active owner may decide count correction requests';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'A decision reason of 1 to 1000 characters is required';
  end if;

  select * into v_request
  from public.inventory_count_correction_requests
  where request_id = p_request_id
  for update;
  if not found then
    raise exception 'The count correction request was not found';
  end if;
  if not public.can_access_branch(v_request.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if v_request.status <> 'pending' then
    if v_request.status = p_decision
      and v_request.decided_by = v_owner.id
      and v_request.decision_reason = btrim(p_reason) then
      return v_request;
    end if;
    raise exception 'This correction request has already been decided';
  end if;

  update public.inventory_count_correction_requests
  set status = p_decision,
      decided_by = v_owner.id,
      decision_reason = btrim(p_reason),
      decided_at = clock_timestamp()
  where id = v_request.id
  returning * into v_request;
  return v_request;
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

  select * into v_request
  from public.inventory_count_correction_requests
  where request_id = p_request_id
  for update;
  if not found then
    raise exception 'The count correction request was not found';
  end if;
  if not public.can_access_branch(v_request.branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if v_request.status <> 'approved' then
    raise exception 'Only an approved correction request can be validated';
  end if;

  select * into v_line
  from public.daily_stock_count_lines
  where id = v_request.daily_stock_count_line_id
  for update;
  if exists (
    select 1
    from public.inventory_count_correction_requests
    where daily_stock_count_line_id = v_line.id
      and status = 'pending'
  ) then
    raise exception 'Another correction request is pending for this count line';
  end if;
  select * into v_check
  from public.daily_stock_checks
  where id = v_line.daily_stock_check_id;
  select * into v_validation
  from public.inventory_count_validations
  where daily_stock_count_line_id = v_line.id;
  if found then
    if v_validation.correction_request_id = v_request.id
      and v_validation.validated_by = v_owner.id
      and v_validation.reason = btrim(p_reason) then
      return v_validation;
    end if;
    raise exception 'This count line has already been validated';
  end if;

  select * into v_inventory
  from public.branch_inventory
  where branch_id = v_check.branch_id and ingredient_id = v_line.ingredient_id
  for update;
  if not found then
    raise exception 'Inventory is not configured for this branch and ingredient';
  end if;
  if v_line.inventory_revision is null
    or v_inventory.inventory_revision <> v_line.inventory_revision
    or v_inventory.quantity <> v_line.recorded_quantity then
    raise exception 'Inventory changed after this count began; start a new count before validating';
  end if;

  select quantity_precision into v_precision
  from public.ingredients
  where id = v_line.ingredient_id and active;
  if not found then
    raise exception 'Ingredient is not active';
  end if;
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
    raise exception 'The validated inventory adjustment was not recorded';
  end if;

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
  return v_validation;
end;
$$;

revoke all on function public.submit_daily_stock_check(uuid, date, text, jsonb)
  from public, anon;
grant execute on function public.submit_daily_stock_check(uuid, date, text, jsonb)
  to authenticated;

revoke all on function public.request_inventory_count_correction(uuid, uuid, numeric, text)
  from public, anon;
revoke all on function public.decide_inventory_count_correction(uuid, text, text)
  from public, anon;
revoke all on function public.validate_inventory_count_correction(uuid, text)
  from public, anon;
grant execute on function public.request_inventory_count_correction(uuid, uuid, numeric, text)
  to authenticated;
grant execute on function public.decide_inventory_count_correction(uuid, text, text)
  to authenticated;
grant execute on function public.validate_inventory_count_correction(uuid, text)
  to authenticated;

revoke all on function public.authorize_inventory_discrepancy_adjustment(uuid, text)
  from public, anon, authenticated;
revoke all on function public.authorize_inventory_discrepancy_adjustment_unchecked(uuid, text)
  from public, anon, authenticated;

alter function public.submit_daily_stock_check(uuid, date, text, jsonb) owner to postgres;
alter function public.request_inventory_count_correction(uuid, uuid, numeric, text) owner to postgres;
alter function public.decide_inventory_count_correction(uuid, text, text) owner to postgres;
alter function public.validate_inventory_count_correction(uuid, text) owner to postgres;

commit;
