alter table public.branches
  add column if not exists address text not null default '';

alter table public.ingredients
  add column if not exists expiration_tracking boolean not null default false;

alter type public.inventory_transaction_type add value if not exists 'sales_consumption';
alter type public.inventory_transaction_type add value if not exists 'transfer_in';
alter type public.inventory_transaction_type add value if not exists 'transfer_out';

update public.ingredients
set expiration_tracking = true
where id in ('octopus', 'eggs', 'sauces', 'japanese-mayonnaise', 'spring-onions', 'other-toppings');

insert into public.ingredients (id, category_id, name, unit, quantity_precision, expiration_tracking)
values
  ('seaweed', 'dry-goods', 'Seaweed', 'g', 0, false),
  ('other-toppings', 'condiments', 'Other Toppings', 'pcs', 0, false)
on conflict (id) do update
set category_id = excluded.category_id,
    name = excluded.name,
    unit = excluded.unit,
    quantity_precision = excluded.quantity_precision,
    expiration_tracking = excluded.expiration_tracking,
    active = true;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  product_name text not null unique,
  description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  quantity_required numeric(12, 3) not null check (quantity_required > 0),
  unit_of_measure text not null,
  unique (product_id, ingredient_id)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  transaction_reference text not null unique,
  branch_id uuid not null references public.branches(id),
  staff_id uuid not null references public.profiles(id),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  payment_method text not null check (length(btrim(payment_method)) > 0),
  status text not null check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  unique (sale_id, product_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  action text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists recipes_ingredient_idx on public.recipes (ingredient_id);
create index if not exists sales_branch_created_idx on public.sales (branch_id, created_at desc);
create index if not exists sales_staff_idx on public.sales (staff_id);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_idx on public.sale_items (product_id);
create index if not exists audit_logs_branch_created_idx on public.audit_logs (branch_id, created_at desc);
create index if not exists audit_logs_user_created_idx on public.audit_logs (user_id, created_at desc);

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

alter table public.products enable row level security;
alter table public.recipes enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.audit_logs enable row level security;

create policy products_read_active_users on public.products
for select to authenticated using (exists (
  select 1 from public.profiles
  where id = (select auth.uid()) and active
));
create policy products_owner_manage on public.products
for all to authenticated using (public.is_active_owner())
with check (public.is_active_owner());

create policy recipes_read_active_users on public.recipes
for select to authenticated using (exists (
  select 1 from public.profiles
  where id = (select auth.uid()) and active
));
create policy recipes_owner_manage on public.recipes
for all to authenticated using (public.is_active_owner())
with check (public.is_active_owner());

create policy sales_read_accessible_branches on public.sales
for select to authenticated using (public.can_access_branch(branch_id));
create policy sale_items_read_accessible_branches on public.sale_items
for select to authenticated using (exists (
  select 1 from public.sales
  where id = sale_id and public.can_access_branch(branch_id)
));
create policy audit_logs_owner_read on public.audit_logs
for select to authenticated using (public.is_active_owner());

revoke all on public.products, public.recipes, public.sales,
  public.sale_items, public.audit_logs from anon, authenticated;
grant select, insert, update, delete on public.products, public.recipes to authenticated;
grant select on public.sales, public.sale_items, public.audit_logs to authenticated;

create or replace function public.audit_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    new.actor_id,
    new.branch_id,
    'inventory.' || new.type::text,
    format('%s %s %s; reference %s', new.type::text, new.quantity, new.unit, new.reference)
  );
  return new;
end;
$$;

create trigger inventory_movements_audit
after insert on public.inventory_movements
for each row execute function public.audit_inventory_transaction();

create or replace function public.reject_unimplemented_inventory_movements()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.type in ('sales_consumption', 'transfer_in', 'transfer_out') then
    raise exception 'This movement type requires an atomic sales or transfer workflow that is not available yet';
  end if;
  return new;
end;
$$;

create trigger inventory_movements_reject_unimplemented
before insert on public.inventory_movements
for each row execute function public.reject_unimplemented_inventory_movements();

create or replace function public.audit_daily_stock_check()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    new.submitted_by,
    new.branch_id,
    'inventory.daily_stock_check_submitted',
    format('Stock check %s submitted with status %s', new.reference, new.status)
  );
  return new;
end;
$$;

create trigger daily_stock_checks_audit
after insert on public.daily_stock_checks
for each row execute function public.audit_daily_stock_check();

create or replace function public.audit_profile_access_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is not distinct from old.role
    and new.branch_id is not distinct from old.branch_id
    and new.active is not distinct from old.active then
    return new;
  end if;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    auth.uid(),
    new.branch_id,
    'profile.access_changed',
    format('Profile %s role=%s branch=%s active=%s', new.id, new.role, new.branch_id, new.active)
  );
  return new;
end;
$$;

create trigger profiles_access_change_audit
after update of role, branch_id, active on public.profiles
for each row execute function public.audit_profile_access_change();

revoke all on function public.audit_inventory_transaction() from public, anon, authenticated;
revoke all on function public.audit_daily_stock_check() from public, anon, authenticated;
revoke all on function public.audit_profile_access_change() from public, anon, authenticated;
revoke all on function public.reject_unimplemented_inventory_movements() from public, anon, authenticated;