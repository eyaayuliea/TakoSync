-- A2: dynamic low-stock threshold, Reorder Point with Safety Stock
-- (Algorithm Architecture Specification §2.5 and §3.5; US-ROP-05).
--
-- Low stock used to mean "quantity <= the owner's minimum", worked out in the
-- apps. Now, for each branch and purchased ingredient:
--   d̄  = mean daily usage over the last W operating days (default 14). Usage is
--        Sales Consumption + preparation usage, net of voided sales. Waste and
--        adjustments are excluded. An operating day is a Manila date before today
--        on which the branch recorded a sale. Operating days with no usage count
--        as 0.
--   σd = sample standard deviation of the same daily values
--   SS = z × σd × √L                 (z default 1.645 ≈ 95%, L = supplier lead time in days)
--   ROP = d̄ × L + SS, capped at d̄ × shelf life when a shelf life is set
--        (flagged inconsistent when shelf life < L)
--   ROPeff = max(ROP, owner minimum) with at least Nmin operating days (default 7),
--        otherwise the owner minimum ("cold start").
-- Prepared batter is made in-house, so it keeps the owner minimum.
--
-- An alert is opened or updated when stock <= ROPeff, and resolved when stock rises
-- above it. There is at most one open alert per branch and ingredient. Severity
-- is CRITICAL when stock <= SS or stock <= 0, otherwise LOW_STOCK. Alerts are
-- advisory only: nothing creates purchase orders.
-- The reorder point is recomputed at most once per business day per item: the
-- first time stock moves that day, when the owner minimum or replenishment
-- settings change, or when the apps call refresh_reorder_points.
-- Stock S is the branch_inventory balance, which is the authoritative balance
-- (see A1).

-- Owner inputs per ingredient (AC-ROP-05-02) -------------------------------------
create table if not exists public.ingredient_replenishment_settings (
  ingredient_id text primary key references public.ingredients(id) on delete cascade,
  lead_time_days numeric(5, 2) not null default 1 check (lead_time_days > 0 and lead_time_days <= 60),
  service_level_z numeric(4, 3) not null default 1.645 check (service_level_z >= 0 and service_level_z <= 4),
  window_days integer not null default 14 check (window_days between 2 and 90),
  min_history_days integer not null default 7,
  shelf_life_days numeric(6, 2) check (shelf_life_days is null or shelf_life_days > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (min_history_days between 2 and window_days)
);

insert into public.ingredient_replenishment_settings (ingredient_id)
select id from public.ingredients where id <> 'prepared-batter'
on conflict (ingredient_id) do nothing;

alter table public.ingredient_replenishment_settings enable row level security;
drop policy if exists ingredient_replenishment_settings_read on public.ingredient_replenishment_settings;
create policy ingredient_replenishment_settings_read on public.ingredient_replenishment_settings
for select to authenticated using (true);
drop policy if exists ingredient_replenishment_settings_owner_write on public.ingredient_replenishment_settings;
create policy ingredient_replenishment_settings_owner_write on public.ingredient_replenishment_settings
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
revoke all on public.ingredient_replenishment_settings from anon, authenticated;
grant select on public.ingredient_replenishment_settings to authenticated;
grant insert (ingredient_id, lead_time_days, service_level_z, window_days, min_history_days, shelf_life_days)
  on public.ingredient_replenishment_settings to authenticated;
grant update (lead_time_days, service_level_z, window_days, min_history_days, shelf_life_days)
  on public.ingredient_replenishment_settings to authenticated;

-- Computed reorder points (one current row per branch and ingredient) ------------
create table if not exists public.inventory_reorder_points (
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  method text not null check (method in ('DYNAMIC_ROP', 'OWNER_MINIMUM')),
  -- Why the owner minimum was used: COLD_START, IN_HOUSE_ITEM or NOT_CONFIGURED.
  method_reason text check (method_reason in ('COLD_START', 'IN_HOUSE_ITEM', 'NOT_CONFIGURED')),
  -- Which value is the trigger: the dynamic ROP or the owner minimum (the floor).
  threshold_source text not null check (threshold_source in ('DYNAMIC_ROP', 'OWNER_MINIMUM')),
  window_days integer,
  operating_days_used integer not null default 0,
  average_daily_usage numeric(14, 4),
  usage_stddev numeric(14, 4),
  lead_time_days numeric(5, 2),
  service_level_z numeric(4, 3),
  shelf_life_days numeric(6, 2),
  safety_stock numeric(14, 3) not null default 0 check (safety_stock >= 0),
  reorder_point numeric(14, 3),
  owner_minimum numeric(12, 3) not null,
  effective_rop numeric(14, 3) not null check (effective_rop >= owner_minimum),
  config_inconsistent boolean not null default false,
  business_date date not null,
  computed_at timestamptz not null default now(),
  algorithm_version text not null default 'rop-ss-v1',
  primary key (branch_id, ingredient_id),
  foreign key (branch_id, ingredient_id) references public.branch_inventory(branch_id, ingredient_id) on delete cascade
);

alter table public.inventory_reorder_points enable row level security;
drop policy if exists inventory_reorder_points_read_branch on public.inventory_reorder_points;
create policy inventory_reorder_points_read_branch on public.inventory_reorder_points
for select to authenticated using (public.can_access_branch(branch_id));
revoke all on public.inventory_reorder_points from anon, authenticated;
grant select on public.inventory_reorder_points to authenticated;

-- Low-stock alerts (AC-ROP-05-04) -----------------------------------------------
create table if not exists public.inventory_stock_alerts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id) on delete cascade,
  severity text not null check (severity in ('LOW_STOCK', 'CRITICAL')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  expected_stock numeric(12, 3) not null,
  effective_rop numeric(14, 3) not null,
  safety_stock numeric(14, 3) not null default 0,
  threshold_source text not null check (threshold_source in ('DYNAMIC_ROP', 'OWNER_MINIMUM')),
  method_reason text,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'resolved') = (resolved_at is not null)),
  foreign key (branch_id, ingredient_id) references public.branch_inventory(branch_id, ingredient_id) on delete cascade
);
create unique index if not exists inventory_stock_alerts_one_open
  on public.inventory_stock_alerts (branch_id, ingredient_id) where status = 'open';
create index if not exists inventory_stock_alerts_branch_idx
  on public.inventory_stock_alerts (branch_id, status, updated_at desc);

alter table public.inventory_stock_alerts enable row level security;
drop policy if exists inventory_stock_alerts_read_branch on public.inventory_stock_alerts;
create policy inventory_stock_alerts_read_branch on public.inventory_stock_alerts
for select to authenticated using (public.can_access_branch(branch_id));
revoke all on public.inventory_stock_alerts from anon, authenticated;
grant select on public.inventory_stock_alerts to authenticated;

create or replace function private.manila_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Manila')::date; $$;

-- COMPUTE_ROP (§3.5) -------------------------------------------------------------
create or replace function private.compute_reorder_point(
  p_branch_id uuid,
  p_ingredient_id text,
  p_business_date date default null
)
returns public.inventory_reorder_points
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := coalesce(p_business_date, private.manila_today());
  v_minimum numeric(12, 3);
  v_cfg public.ingredient_replenishment_settings%rowtype;
  v_n integer := 0;
  v_mean numeric;
  v_stddev numeric;
  v_ss numeric := 0;
  v_rop numeric;
  v_effective numeric;
  v_inconsistent boolean := false;
  v_method text;
  v_reason text;
  v_row public.inventory_reorder_points%rowtype;
begin
  select minimum_stock into v_minimum from public.branch_inventory
  where branch_id = p_branch_id and ingredient_id = p_ingredient_id;
  if not found then raise exception 'Ingredient is not configured for this branch'; end if;

  select * into v_cfg from public.ingredient_replenishment_settings where ingredient_id = p_ingredient_id;
  if p_ingredient_id = 'prepared-batter' then
    v_reason := 'IN_HOUSE_ITEM';
  elsif v_cfg.ingredient_id is null then
    v_reason := 'NOT_CONFIGURED';
  else
    with operating_days as (
      select distinct (s.created_at at time zone 'Asia/Manila')::date as day
      from public.sales s
      where s.branch_id = p_branch_id
        and s.status in ('completed', 'voided')
        and (s.created_at at time zone 'Asia/Manila')::date < v_today
      order by day desc
      limit v_cfg.window_days
    ), daily as (
      select (coalesce(m.transaction_date, m.created_at) at time zone 'Asia/Manila')::date as day,
        sum(-m.movement) as used
      from public.inventory_movements m
      where m.branch_id = p_branch_id and m.ingredient_id = p_ingredient_id
        and m.type in ('sales_consumption', 'usage', 'void_reversal')
        and (coalesce(m.transaction_date, m.created_at) at time zone 'Asia/Manila')::date in (select day from operating_days)
      group by 1
    )
    select count(*), avg(greatest(coalesce(d.used, 0), 0)), stddev_samp(greatest(coalesce(d.used, 0), 0))
    into v_n, v_mean, v_stddev
    from operating_days o left join daily d using (day);

    if v_n < v_cfg.min_history_days then
      v_reason := 'COLD_START';
    end if;
  end if;

  if v_reason is null then
    v_method := 'DYNAMIC_ROP';
    v_ss := v_cfg.service_level_z * coalesce(v_stddev, 0) * sqrt(v_cfg.lead_time_days);
    v_rop := v_mean * v_cfg.lead_time_days + v_ss;
    if v_cfg.shelf_life_days is not null then
      v_inconsistent := v_cfg.shelf_life_days < v_cfg.lead_time_days;
      v_rop := least(v_rop, v_mean * v_cfg.shelf_life_days);
      -- The safety stock never exceeds the capped reorder point.
      v_ss := least(v_ss, v_rop);
    end if;
    v_effective := greatest(v_rop, v_minimum);
  else
    v_method := 'OWNER_MINIMUM';
    v_effective := v_minimum;
    v_ss := 0;
  end if;

  insert into public.inventory_reorder_points as r (
    branch_id, ingredient_id, method, method_reason, threshold_source, window_days, operating_days_used,
    average_daily_usage, usage_stddev, lead_time_days, service_level_z, shelf_life_days, safety_stock,
    reorder_point, owner_minimum, effective_rop, config_inconsistent, business_date, computed_at
  ) values (
    p_branch_id, p_ingredient_id, v_method, v_reason,
    case when v_method = 'DYNAMIC_ROP' and v_rop > v_minimum then 'DYNAMIC_ROP' else 'OWNER_MINIMUM' end,
    v_cfg.window_days, coalesce(v_n, 0),
    round(v_mean, 4), round(v_stddev, 4), v_cfg.lead_time_days, v_cfg.service_level_z, v_cfg.shelf_life_days,
    round(v_ss, 3), round(v_rop, 3), v_minimum, round(v_effective, 3), v_inconsistent, v_today, now()
  )
  on conflict (branch_id, ingredient_id) do update set
    method = excluded.method, method_reason = excluded.method_reason, threshold_source = excluded.threshold_source,
    window_days = excluded.window_days, operating_days_used = excluded.operating_days_used,
    average_daily_usage = excluded.average_daily_usage, usage_stddev = excluded.usage_stddev,
    lead_time_days = excluded.lead_time_days, service_level_z = excluded.service_level_z,
    shelf_life_days = excluded.shelf_life_days, safety_stock = excluded.safety_stock,
    reorder_point = excluded.reorder_point, owner_minimum = excluded.owner_minimum,
    effective_rop = excluded.effective_rop, config_inconsistent = excluded.config_inconsistent,
    business_date = excluded.business_date, computed_at = excluded.computed_at,
    algorithm_version = excluded.algorithm_version
  returning * into v_row;
  return v_row;
end;
$$;

-- CHECK_LOW_STOCK (§3.5) ---------------------------------------------------------
create or replace function private.check_low_stock(
  p_branch_id uuid,
  p_ingredient_id text,
  p_force_recompute boolean default false
)
returns public.inventory_reorder_points
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock numeric(12, 3);
  v_minimum numeric(12, 3);
  v_point public.inventory_reorder_points%rowtype;
  v_severity text;
begin
  select quantity, minimum_stock into v_stock, v_minimum from public.branch_inventory
  where branch_id = p_branch_id and ingredient_id = p_ingredient_id;
  if not found then return null; end if;

  select * into v_point from public.inventory_reorder_points
  where branch_id = p_branch_id and ingredient_id = p_ingredient_id;
  if p_force_recompute or v_point.branch_id is null
     or v_point.business_date < private.manila_today()
     or v_point.owner_minimum is distinct from v_minimum then
    v_point := private.compute_reorder_point(p_branch_id, p_ingredient_id);
  end if;

  if v_stock <= v_point.effective_rop then
    v_severity := case when v_stock <= 0 or v_stock <= v_point.safety_stock then 'CRITICAL' else 'LOW_STOCK' end;
    insert into public.inventory_stock_alerts (
      branch_id, ingredient_id, severity, expected_stock, effective_rop, safety_stock, threshold_source, method_reason
    ) values (
      p_branch_id, p_ingredient_id, v_severity, v_stock, v_point.effective_rop, v_point.safety_stock,
      v_point.threshold_source, v_point.method_reason
    )
    on conflict (branch_id, ingredient_id) where status = 'open' do update set
      severity = excluded.severity, expected_stock = excluded.expected_stock,
      effective_rop = excluded.effective_rop, safety_stock = excluded.safety_stock,
      threshold_source = excluded.threshold_source, method_reason = excluded.method_reason,
      updated_at = now();
  else
    update public.inventory_stock_alerts
    set status = 'resolved', resolved_at = now(), updated_at = now(), expected_stock = v_stock
    where branch_id = p_branch_id and ingredient_id = p_ingredient_id and status = 'open';
  end if;
  return v_point;
end;
$$;

-- Runs after every stock or minimum change ----------------------------------------
create or replace function private.branch_inventory_check_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.minimum_stock is distinct from old.minimum_stock then
    insert into public.audit_logs (user_id, branch_id, action, description)
    values ((select auth.uid()), new.branch_id, 'replenishment.minimum_stock_updated',
      format('%s minimum stock %s -> %s', new.ingredient_id, trim_scale(old.minimum_stock), trim_scale(new.minimum_stock)));
  end if;
  perform private.check_low_stock(new.branch_id, new.ingredient_id);
  return null;
end;
$$;

drop trigger if exists branch_inventory_check_low_stock on public.branch_inventory;
create trigger branch_inventory_check_low_stock
after insert or update of quantity, minimum_stock on public.branch_inventory
for each row execute function private.branch_inventory_check_low_stock();

-- Owner setting changes: audit and recompute every branch (AC-ROP-05-02) ---------
create or replace function private.replenishment_settings_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_branch uuid;
begin
  insert into public.audit_logs (user_id, branch_id, action, description)
  values ((select auth.uid()), null, 'replenishment.settings_updated',
    format('%s: lead time %s d, z %s, window %s days, min history %s days, shelf life %s',
      new.ingredient_id, trim_scale(new.lead_time_days), trim_scale(new.service_level_z), new.window_days,
      new.min_history_days, coalesce(trim_scale(new.shelf_life_days)::text || ' d', 'not set')));
  for v_branch in select branch_id from public.branch_inventory where ingredient_id = new.ingredient_id loop
    perform private.check_low_stock(v_branch, new.ingredient_id, true);
  end loop;
  return null;
end;
$$;

create or replace function private.touch_replenishment_settings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists ingredient_replenishment_settings_touch on public.ingredient_replenishment_settings;
create trigger ingredient_replenishment_settings_touch
before insert or update on public.ingredient_replenishment_settings
for each row execute function private.touch_replenishment_settings();

drop trigger if exists ingredient_replenishment_settings_changed on public.ingredient_replenishment_settings;
create trigger ingredient_replenishment_settings_changed
after insert or update on public.ingredient_replenishment_settings
for each row execute function private.replenishment_settings_changed();

-- Apps: bring today's reorder points up to date and return them --------------------
create or replace function public.refresh_reorder_points(p_branch_id uuid default null)
returns setof public.inventory_reorder_points
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item record;
begin
  if p_branch_id is not null and not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  for v_item in
    select bi.branch_id, bi.ingredient_id
    from public.branch_inventory bi
    left join public.inventory_reorder_points r using (branch_id, ingredient_id)
    where (p_branch_id is null or bi.branch_id = p_branch_id)
      and public.can_access_branch(bi.branch_id)
      and (r.branch_id is null or r.business_date < private.manila_today())
    order by bi.branch_id, bi.ingredient_id
    for update of bi
  loop
    perform private.check_low_stock(v_item.branch_id, v_item.ingredient_id);
  end loop;
  return query
    select r.* from public.inventory_reorder_points r
    where (p_branch_id is null or r.branch_id = p_branch_id) and public.can_access_branch(r.branch_id)
    order by r.branch_id, r.ingredient_id;
end;
$$;

revoke all on function private.compute_reorder_point(uuid, text, date) from public, anon, authenticated;
revoke all on function private.check_low_stock(uuid, text, boolean) from public, anon, authenticated;
revoke all on function private.branch_inventory_check_low_stock() from public, anon, authenticated;
revoke all on function private.replenishment_settings_changed() from public, anon, authenticated;
revoke all on function private.touch_replenishment_settings() from public, anon, authenticated;
revoke all on function private.manila_today() from public, anon, authenticated;
revoke all on function public.refresh_reorder_points(uuid) from public, anon;
grant execute on function public.refresh_reorder_points(uuid) to authenticated;

-- Existing rows: compute today's reorder points and open alerts.
do $$
declare
  v_item record;
begin
  for v_item in select branch_id, ingredient_id from public.branch_inventory order by 1, 2 loop
    perform private.check_low_stock(v_item.branch_id, v_item.ingredient_id, true);
  end loop;
end;
$$;
