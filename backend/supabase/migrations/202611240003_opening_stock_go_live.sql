-- OW-28 c5–c8 Opening stock and go-live.
--
--   * opening_stock_entries: the starting quantity of each item per branch,
--     entered once (unique per branch and item). Entering it posts the
--     difference from the current balance through the inventory ledger
--     (record_inventory_transactions): a Stock-In "Opening stock" when higher,
--     an owner adjustment "Opening stock" when lower, nothing when equal.
--   * business_go_live: setting the go-live date locks the opening stock. After
--     that, record_opening_stock refuses, and a direct change of a branch
--     quantity outside the ledger functions is refused: stock changes only
--     through recorded transactions.
-- Items without an opening entry keep their current balance; nothing is
-- recorded for them automatically.
begin;

create table if not exists public.opening_stock_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  quantity numeric(12, 3) not null check (quantity >= 0),
  unit text not null,
  previous_quantity numeric(12, 3) not null,
  inventory_movement_id uuid references public.inventory_movements(id),
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  unique (branch_id, ingredient_id)
);
comment on table public.opening_stock_entries is 'OW-28 c5, c6: the opening stock of each item per branch, entered once.';

create table if not exists public.business_go_live (
  id boolean primary key default true check (id),
  go_live_date date not null,
  locked_by uuid not null references public.profiles(id),
  locked_at timestamptz not null default now()
);
comment on table public.business_go_live is 'OW-28 c7, c8: the go-live date; once set, the opening stock is locked.';

alter table public.opening_stock_entries enable row level security;
alter table public.business_go_live enable row level security;
drop policy if exists opening_stock_entries_read on public.opening_stock_entries;
create policy opening_stock_entries_read on public.opening_stock_entries
for select to authenticated using (public.can_access_branch(branch_id));
drop policy if exists business_go_live_read on public.business_go_live;
create policy business_go_live_read on public.business_go_live
for select to authenticated
using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.active));
revoke all on table public.opening_stock_entries, public.business_go_live from public, anon, authenticated;
grant select on table public.opening_stock_entries, public.business_go_live to authenticated;

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

create or replace function public.set_business_go_live(p_go_live_date date)
returns public.business_go_live
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner public.profiles%rowtype;
  v_row public.business_go_live%rowtype;
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  select * into v_owner from public.profiles where id = (select auth.uid()) and active and role = 'owner';
  if not found then
    raise exception using errcode = '42501', message = 'Only the owner can set the go-live date';
  end if;
  if p_go_live_date is null then raise exception 'Choose the go-live date.'; end if;
  if p_go_live_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'The go-live date cannot be in the future.';
  end if;
  select * into v_row from public.business_go_live where id;
  if found then
    raise exception 'The opening stock is already locked since go-live on %.', to_char(v_row.go_live_date, 'DD Mon YYYY');
  end if;
  insert into public.business_go_live (go_live_date, locked_by) values (p_go_live_date, v_owner.id) returning * into v_row;
  insert into public.audit_logs (user_id, branch_id, action, description)
  values (v_owner.id, null, 'inventory.go_live', format('Go-live on %s: opening stock locked', p_go_live_date));
  return v_row;
end;
$$;

-- After go-live, a branch quantity changes only inside the ledger functions
-- (they run as their owner); a direct update by a signed-in user is refused.
create or replace function private.branch_inventory_quantity_after_go_live()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.quantity is distinct from old.quantity
    and current_user = 'authenticated'
    and exists (select 1 from public.business_go_live where id) then
    raise exception using errcode = '42501',
      message = 'After go-live, stock changes only through recorded transactions.';
  end if;
  return new;
end;
$$;
drop trigger if exists branch_inventory_quantity_after_go_live on public.branch_inventory;
create trigger branch_inventory_quantity_after_go_live
before update of quantity on public.branch_inventory
for each row execute function private.branch_inventory_quantity_after_go_live();

revoke all on function public.record_opening_stock(uuid, text, numeric) from public, anon;
grant execute on function public.record_opening_stock(uuid, text, numeric) to authenticated;
alter function public.record_opening_stock(uuid, text, numeric) owner to postgres;
revoke all on function public.set_business_go_live(date) from public, anon;
grant execute on function public.set_business_go_live(date) to authenticated;
alter function public.set_business_go_live(date) owner to postgres;

select private.declare_endpoint('rpc/record_opening_stock', array['ADJUSTMENT_AUTHORIZE'], '{}', 'Owner enters the opening stock of an item per branch (OW-28 c5, c6).');
select private.declare_endpoint('rpc/set_business_go_live', array['CATALOG_CONFIG'], '{}', 'Owner sets the go-live date and locks the opening stock (OW-28 c7).');
select private.declare_endpoint('table/opening_stock_entries', array['INV_VIEW_BRANCH'], '{}', 'Opening stock entries.');
select private.declare_endpoint('table/business_go_live', array['INV_VIEW_BRANCH'], '{}', 'Go-live date.');

notify pgrst, 'reload schema';
commit;
