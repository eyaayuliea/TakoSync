create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('owner', 'staff');
create type public.inventory_transaction_type as enum (
  'stock_in',
  'stock_out',
  'usage',
  'waste',
  'spoilage',
  'adjustment'
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  city text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.branches (id, code, name, city) values
  ('00000000-0000-4000-8000-000000000001', 'BR-001', 'Gelo''s Takoyaki · Branch 1', 'Manila'),
  ('00000000-0000-4000-8000-000000000002', 'BR-002', 'Gelo''s Takoyaki · Branch 2', ''),
  ('00000000-0000-4000-8000-000000000003', 'BR-003', 'Gelo''s Takoyaki · Branch 3', '')
on conflict (code) do update
set name = excluded.name, city = excluded.city, active = true;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  branch_id uuid references public.branches(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_has_no_assigned_branch check (role <> 'owner' or branch_id is null),
  constraint staff_requires_branch check (role <> 'staff' or branch_id is not null)
);

create table public.ingredient_categories (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.ingredients (
  id text primary key,
  category_id text not null references public.ingredient_categories(id),
  name text not null unique,
  unit text not null,
  quantity_precision smallint not null default 2 check (quantity_precision between 0 and 3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  quantity numeric(12, 3) not null default 0 check (quantity >= 0),
  minimum_stock numeric(12, 3) not null default 0 check (minimum_stock >= 0),
  updated_at timestamptz not null default now(),
  unique (branch_id, ingredient_id)
);

create table public.ingredient_batches (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  batch_reference text not null,
  received_date date not null default current_date,
  expiration_date date,
  quantity_received numeric(12, 3) not null check (quantity_received > 0),
  quantity_remaining numeric(12, 3) not null check (quantity_remaining >= 0),
  created_at timestamptz not null default now(),
  unique (branch_id, batch_reference),
  foreign key (branch_id, ingredient_id)
    references public.inventory(branch_id, ingredient_id)
    on delete cascade
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  actor_id uuid not null references public.profiles(id),
  type public.inventory_transaction_type not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null,
  movement numeric(12, 3) not null check (movement <> 0),
  before_quantity numeric(12, 3) not null check (before_quantity >= 0),
  after_quantity numeric(12, 3) not null check (after_quantity >= 0),
  transaction_date timestamptz not null default now(),
  reason text not null default '',
  notes text not null default '',
  batch_id uuid references public.ingredient_batches(id),
  created_at timestamptz not null default now()
);

create table public.daily_stock_checks (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  branch_id uuid not null references public.branches(id),
  submitted_by uuid not null references public.profiles(id),
  check_date date not null default current_date,
  remarks text not null default '',
  status text not null check (status in ('submitted', 'pending_owner_review')),
  created_at timestamptz not null default now()
);

create table public.daily_stock_count_lines (
  id uuid primary key default gen_random_uuid(),
  daily_stock_check_id uuid not null references public.daily_stock_checks(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  recorded_quantity numeric(12, 3) not null check (recorded_quantity >= 0),
  physical_quantity numeric(12, 3) not null check (physical_quantity >= 0),
  difference numeric(12, 3) not null,
  unit text not null,
  created_at timestamptz not null default now(),
  unique (daily_stock_check_id, ingredient_id)
);

create index inventory_transactions_branch_date_idx
  on public.inventory_transactions (branch_id, transaction_date desc);
create index ingredient_batches_expiration_idx
  on public.ingredient_batches (branch_id, expiration_date)
  where expiration_date is not null;
create index daily_stock_checks_branch_date_idx
  on public.daily_stock_checks (branch_id, check_date desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger ingredients_touch_updated_at
before update on public.ingredients
for each row execute function public.touch_updated_at();

create or replace function public.bootstrap_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, role, branch_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'staff',
    '00000000-0000-4000-8000-000000000001'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_profile_bootstrap
after insert on auth.users
for each row execute function public.bootstrap_auth_profile();

create or replace function public.is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner' and active
  );
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.branches
    where id = target_branch and active
  ) and exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and active
      and (role = 'owner' or branch_id = target_branch)
  );
$$;

create or replace function public.protect_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and not public.is_active_owner() then
      raise exception 'Only an active owner may change user profiles';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT'
    and new.id = auth.uid()
    and new.role = 'staff'
    and new.branch_id = '00000000-0000-4000-8000-000000000001' then
    return new;
  end if;
  if auth.uid() is not null and not public.is_active_owner() then
    raise exception 'Only an active owner may change user profiles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_changes
before insert or update or delete on public.profiles
for each row execute function public.protect_profile_changes();

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.ingredient_categories enable row level security;
alter table public.ingredients enable row level security;
alter table public.inventory enable row level security;
alter table public.ingredient_batches enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.daily_stock_checks enable row level security;
alter table public.daily_stock_count_lines enable row level security;

create policy branches_read_access on public.branches
for select to authenticated using (active and public.can_access_branch(id));
create policy branches_owner_manage on public.branches
for update to authenticated using (public.is_active_owner()) with check (public.is_active_owner());

create policy profiles_read_self_or_owner on public.profiles
for select to authenticated using (id = (select auth.uid()) or public.is_active_owner());
create policy profiles_owner_manage on public.profiles
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());

create policy categories_read_authenticated on public.ingredient_categories
for select to authenticated using (exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));
create policy categories_owner_manage on public.ingredient_categories
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());

create policy ingredients_read_authenticated on public.ingredients
for select to authenticated using (exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));
create policy ingredients_owner_manage on public.ingredients
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());

create policy inventory_read_branch on public.inventory
for select to authenticated using (public.can_access_branch(branch_id));
create policy batches_read_branch on public.ingredient_batches
for select to authenticated using (public.can_access_branch(branch_id));
create policy transactions_read_branch on public.inventory_transactions
for select to authenticated using (public.can_access_branch(branch_id));
create policy checks_read_branch on public.daily_stock_checks
for select to authenticated using (public.can_access_branch(branch_id));
create policy count_lines_read_branch on public.daily_stock_count_lines
for select to authenticated using (exists (
  select 1 from public.daily_stock_checks check_record
  where check_record.id = daily_stock_check_id
    and public.can_access_branch(check_record.branch_id)
));

revoke all on public.branches, public.profiles, public.ingredient_categories,
  public.ingredients, public.inventory, public.ingredient_batches,
  public.inventory_transactions, public.daily_stock_checks,
  public.daily_stock_count_lines from anon;
grant select on public.branches, public.profiles, public.ingredient_categories,
  public.ingredients, public.inventory, public.ingredient_batches,
  public.inventory_transactions, public.daily_stock_checks,
  public.daily_stock_count_lines to authenticated;
grant insert, update, delete on public.ingredient_categories,
  public.ingredients to authenticated;
grant update on public.branches to authenticated;
grant insert, update, delete on public.profiles to authenticated;
revoke all on function public.is_active_owner() from public, anon;
revoke all on function public.can_access_branch(uuid) from public, anon;
grant execute on function public.is_active_owner() to authenticated;
grant execute on function public.can_access_branch(uuid) to authenticated;

create or replace function public.record_inventory_transactions(
  p_branch_id uuid,
  p_transactions jsonb
)
returns setof public.inventory_transactions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_entry jsonb;
  v_inventory public.inventory%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_batch public.ingredient_batches%rowtype;
  v_transaction public.inventory_transactions%rowtype;
  v_type public.inventory_transaction_type;
  v_quantity numeric(12, 3);
  v_movement numeric(12, 3);
  v_after numeric(12, 3);
  v_remaining numeric(12, 3);
  v_from_batch numeric(12, 3);
  v_reference text;
  v_batch_reference text;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if jsonb_typeof(p_transactions) <> 'array' or jsonb_array_length(p_transactions) = 0 then
    raise exception 'At least one transaction is required';
  end if;

  for v_entry in select value from jsonb_array_elements(p_transactions)
  loop
    v_type := (v_entry ->> 'type')::public.inventory_transaction_type;
    v_quantity := (v_entry ->> 'quantity')::numeric;
    if v_quantity is null or v_quantity = 0 then raise exception 'Transaction quantity cannot be zero'; end if;
    if v_profile.role = 'staff' and v_type = 'adjustment' then
      raise exception 'Only an owner may record an adjustment';
    end if;
    if v_type <> 'adjustment' and v_quantity < 0 then
      raise exception 'Transaction quantity must be positive';
    end if;

    select * into v_inventory from public.inventory
    where branch_id = p_branch_id and ingredient_id = v_entry ->> 'ingredient_id'
    for update;
    if not found then raise exception 'Ingredient is not configured for this branch'; end if;
    select * into v_ingredient from public.ingredients where id = v_inventory.ingredient_id and active;
    if not found then raise exception 'Ingredient is inactive'; end if;
    if v_type = 'stock_in' then
      v_movement := abs(v_quantity);
    elsif v_type = 'adjustment' then
      if v_profile.role <> 'owner' then raise exception 'Only an owner may record an adjustment'; end if;
      v_movement := v_quantity;
    else
      v_movement := -abs(v_quantity);
    end if;
    v_after := v_inventory.quantity + v_movement;
    if v_after < 0 then raise exception 'Transaction exceeds available stock'; end if;

    update public.inventory set quantity = v_after, updated_at = now()
    where id = v_inventory.id;

    v_batch := null;
    v_batch_reference := null;
    if v_type = 'stock_in' then
      v_batch_reference := nullif(btrim(v_entry ->> 'batch_reference'), '');
      if v_batch_reference is null then
        v_batch_reference := 'B-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      end if;
      insert into public.ingredient_batches (
        branch_id, ingredient_id, batch_reference, received_date, expiration_date,
        quantity_received, quantity_remaining
      ) values (
        p_branch_id, v_inventory.ingredient_id, v_batch_reference,
        coalesce((v_entry ->> 'transaction_date')::date, current_date),
        nullif(v_entry ->> 'expiration_date', '')::date,
        abs(v_quantity), abs(v_quantity)
      ) returning * into v_batch;
    elsif v_movement < 0 then
      v_remaining := abs(v_movement);
      for v_batch in
        select * from public.ingredient_batches
        where branch_id = p_branch_id and ingredient_id = v_inventory.ingredient_id
          and quantity_remaining > 0
        order by expiration_date nulls last, received_date, created_at
        for update
      loop
        exit when v_remaining <= 0;
        v_from_batch := least(v_batch.quantity_remaining, v_remaining);
        update public.ingredient_batches
        set quantity_remaining = quantity_remaining - v_from_batch
        where id = v_batch.id;
        v_remaining := v_remaining - v_from_batch;
      end loop;
      v_batch := null;
    end if;

    v_reference := 'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.inventory_transactions (
      reference, branch_id, ingredient_id, actor_id, type, quantity, unit, movement,
      before_quantity, after_quantity, transaction_date, reason, notes, batch_id
    ) values (
      v_reference, p_branch_id, v_inventory.ingredient_id, v_profile.id, v_type,
      abs(v_quantity), v_ingredient.unit, v_movement, v_inventory.quantity, v_after,
      coalesce((v_entry ->> 'transaction_date')::timestamptz, now()),
      coalesce(v_entry ->> 'reason', ''), coalesce(v_entry ->> 'notes', ''),
      v_batch.id
    ) returning * into v_transaction;
    return next v_transaction;
  end loop;
end;
$$;

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
  v_inventory public.inventory%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_physical numeric(12, 3);
  v_difference numeric(12, 3);
  v_discrepancies integer := 0;
  v_count integer := 0;
  v_reference text;
  v_line_results jsonb := '[]'::jsonb;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
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
    v_physical := (v_line ->> 'physical_quantity')::numeric;
    if v_physical is null or v_physical < 0 then raise exception 'Physical counts must be zero or greater'; end if;
    select * into v_inventory from public.inventory
    where branch_id = p_branch_id and ingredient_id = v_line ->> 'ingredient_id'
    for update;
    if not found then raise exception 'Ingredient is not configured for this branch'; end if;
    select * into v_ingredient from public.ingredients
    where id = v_inventory.ingredient_id and active;
    v_difference := round(v_physical - v_inventory.quantity, v_ingredient.quantity_precision);
    if v_difference <> 0 then v_discrepancies := v_discrepancies + 1; end if;
    insert into public.daily_stock_count_lines (
      daily_stock_check_id, ingredient_id, recorded_quantity, physical_quantity, difference, unit
    ) values (
      v_check.id, v_inventory.ingredient_id, v_inventory.quantity, v_physical, v_difference, v_ingredient.unit
    );
    v_line_results := v_line_results || jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_inventory.ingredient_id,
      'recorded_quantity', v_inventory.quantity,
      'physical_quantity', v_physical,
      'difference', v_difference,
      'unit', v_ingredient.unit
    ));
    v_count := v_count + 1;
  end loop;

  if v_discrepancies > 0 then
    update public.daily_stock_checks set status = 'pending_owner_review' where id = v_check.id returning * into v_check;
  end if;
  return jsonb_build_object(
    'id', v_check.id, 'reference', v_check.reference, 'status', v_check.status,
    'counted', v_count, 'discrepancies', v_discrepancies, 'check_date', v_check.check_date,
    'lines', v_line_results
  );
end;
$$;

revoke all on function public.record_inventory_transactions(uuid, jsonb) from public, anon;
revoke all on function public.submit_daily_stock_check(uuid, date, text, jsonb) from public, anon;
grant execute on function public.record_inventory_transactions(uuid, jsonb) to authenticated;
grant execute on function public.submit_daily_stock_check(uuid, date, text, jsonb) to authenticated;
