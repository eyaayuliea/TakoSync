alter table public.branch_inventory
  add column inventory_revision bigint not null default 0
  check (inventory_revision >= 0);

alter table public.daily_stock_count_lines
  add column inventory_revision bigint;

create function public.track_inventory_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.inventory_revision := old.inventory_revision + 1;
  return new;
end;
$$;

create trigger branch_inventory_track_revision
before update of quantity on public.branch_inventory
for each row execute function public.track_inventory_revision();

create function public.snapshot_daily_stock_count_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_branch_id uuid;
begin
  select branch_id into v_branch_id
  from public.daily_stock_checks
  where id = new.daily_stock_check_id;
  if not found then
    raise exception 'The physical inventory check was not found';
  end if;

  select inventory_revision into new.inventory_revision
  from public.branch_inventory
  where branch_id = v_branch_id
    and ingredient_id = new.ingredient_id
  for update;
  if not found then
    raise exception 'Inventory is not configured for this branch and ingredient';
  end if;
  return new;
end;
$$;

create trigger daily_stock_count_lines_snapshot_revision
before insert on public.daily_stock_count_lines
for each row execute function public.snapshot_daily_stock_count_revision();

revoke all on function public.track_inventory_revision() from public, anon, authenticated;
revoke all on function public.snapshot_daily_stock_count_revision() from public, anon, authenticated;

create table public.inventory_discrepancy_adjustments (
  id uuid primary key default gen_random_uuid(),
  daily_stock_count_line_id uuid not null unique
    references public.daily_stock_count_lines(id) on delete restrict,
  daily_stock_check_id uuid not null
    references public.daily_stock_checks(id) on delete restrict,
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  recorded_quantity numeric(12, 3) not null check (recorded_quantity >= 0),
  physical_quantity numeric(12, 3) not null check (physical_quantity >= 0),
  difference numeric(12, 3) not null check (difference <> 0),
  approved_by uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  approved_at timestamptz not null default clock_timestamp(),
  inventory_movement_id uuid not null unique
    references public.inventory_movements(id) on delete restrict
);

create index inventory_discrepancy_adjustments_branch_approved_idx
  on public.inventory_discrepancy_adjustments (branch_id, approved_at desc);

alter table public.inventory_discrepancy_adjustments enable row level security;

create policy inventory_discrepancy_adjustments_owner_read
  on public.inventory_discrepancy_adjustments
  for select to authenticated
  using (public.is_active_owner());

revoke all on public.inventory_discrepancy_adjustments from public, anon, authenticated;
grant select on public.inventory_discrepancy_adjustments to authenticated;

create or replace function public.authorize_inventory_discrepancy_adjustment(
  p_count_line_id uuid,
  p_reason text
)
returns public.inventory_discrepancy_adjustments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_line public.daily_stock_count_lines%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_adjustment public.inventory_discrepancy_adjustments%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_delta numeric(12, 3);
begin
  select * into v_owner
  from public.profiles
  where id = (select auth.uid())
    and role = 'owner'
    and active;
  if not found then
    raise exception using
      errcode = '42501',
      message = 'Only an active owner may authorize inventory adjustments';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'An adjustment reason of 1 to 1000 characters is required';
  end if;

  select * into v_line
  from public.daily_stock_count_lines
  where id = p_count_line_id
  for update;
  if not found then
    raise exception 'The physical count line was not found';
  end if;

  select * into v_adjustment
  from public.inventory_discrepancy_adjustments
  where daily_stock_count_line_id = v_line.id;
  if found then
    return v_adjustment;
  end if;

  select * into v_check
  from public.daily_stock_checks
  where id = v_line.daily_stock_check_id;
  if not found or v_check.status <> 'pending_owner_review' then
    raise exception 'The physical count is not pending owner review';
  end if;
  if v_line.difference = 0 then
    raise exception 'The physical count has no discrepancy to adjust';
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
    raise exception 'Inventory changed after this count; submit a new physical count before adjusting';
  end if;

  v_delta := round(
    v_line.physical_quantity - v_line.recorded_quantity,
    (select quantity_precision from public.ingredients where id = v_line.ingredient_id)
  );
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
      'notes', 'Authorized physical count line ' || v_line.id::text
    ))
  );
  if not found then
    raise exception 'The authorized inventory adjustment was not recorded';
  end if;

  insert into public.inventory_discrepancy_adjustments (
    daily_stock_count_line_id,
    daily_stock_check_id,
    branch_id,
    ingredient_id,
    recorded_quantity,
    physical_quantity,
    difference,
    approved_by,
    reason,
    inventory_movement_id
  ) values (
    v_line.id,
    v_check.id,
    v_check.branch_id,
    v_line.ingredient_id,
    v_line.recorded_quantity,
    v_line.physical_quantity,
    v_line.difference,
    v_owner.id,
    btrim(p_reason),
    v_movement.id
  ) returning * into v_adjustment;

  return v_adjustment;
end;
$$;

revoke all on function public.authorize_inventory_discrepancy_adjustment(uuid, text)
  from public, anon;
grant execute on function public.authorize_inventory_discrepancy_adjustment(uuid, text)
  to authenticated;
alter function public.authorize_inventory_discrepancy_adjustment(uuid, text)
  owner to postgres;
