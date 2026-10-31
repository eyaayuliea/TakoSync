create table public.owner_inventory_settings (
  id boolean primary key default true check (id),
  near_expiration_days integer not null default 7
    check (near_expiration_days between 1 and 365),
  updated_at timestamptz not null default now()
);

insert into public.owner_inventory_settings (id, near_expiration_days)
values (true, 7)
on conflict (id) do nothing;

create trigger owner_inventory_settings_touch_updated_at
before update on public.owner_inventory_settings
for each row execute function public.touch_updated_at();

alter table public.owner_inventory_settings enable row level security;

create policy owner_inventory_settings_owner_manage on public.owner_inventory_settings
for all to authenticated
using (public.is_active_owner())
with check (public.is_active_owner());

create policy branch_inventory_owner_update on public.branch_inventory
for update to authenticated
using (public.is_active_owner())
with check (public.is_active_owner());

create policy ingredient_batches_owner_update on public.ingredient_batches
for update to authenticated
using (public.is_active_owner())
with check (public.is_active_owner());

revoke all on public.owner_inventory_settings from anon, authenticated;
grant select, insert, update on public.owner_inventory_settings to authenticated;
revoke update on public.branch_inventory, public.ingredient_batches from authenticated;
grant update (minimum_stock) on public.branch_inventory to authenticated;
grant update (expiration_date) on public.ingredient_batches to authenticated;
