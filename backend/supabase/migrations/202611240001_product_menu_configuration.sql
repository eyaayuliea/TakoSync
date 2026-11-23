-- OW-21 Product and Menu Configuration.
--
--   * c1, c2: products get a flavor and a portion type (Regular or Combo + Cheese).
--     Existing products are filled in from their names; names, prices and past
--     sales are not changed.
--   * c5: product_addons links optional add-ons to products. A product without
--     links keeps offering every active add-on, as before.
--   * c10: owner_inventory_settings.bulk_order_threshold (default 5): an order
--     with at least this many products is a Bulk Order (BR-S6, decision #8).
begin;

alter table public.products add column if not exists flavor text;
alter table public.products add column if not exists portion_type text;
alter table public.products drop constraint if exists products_portion_type_check;
alter table public.products add constraint products_portion_type_check
  check (portion_type is null or portion_type in ('Regular', 'Combo + Cheese'));

update public.products
set portion_type = case when product_name ~* '/\s*cheese\s*$' then 'Combo + Cheese' else 'Regular' end
where portion_type is null;
update public.products
set flavor = nullif(btrim(regexp_replace(regexp_replace(product_name, '\s*/\s*cheese\s*$', '', 'i'), '\s+takoyaki\s*$', '', 'i')), '')
where flavor is null;

comment on column public.products.flavor is 'OW-21 c2: the flavor, e.g. Octobits.';
comment on column public.products.portion_type is 'OW-21 c2: Regular or Combo + Cheese.';

create table if not exists public.product_addons (
  product_id uuid not null references public.products(id) on delete cascade,
  addon_id uuid not null references public.menu_addons(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (product_id, addon_id)
);
comment on table public.product_addons is
  'OW-21 c5: optional add-ons offered with a product. A product without rows offers every active add-on.';

alter table public.product_addons enable row level security;
drop policy if exists product_addons_read_active_users on public.product_addons;
create policy product_addons_read_active_users on public.product_addons
for select to authenticated
using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.active));
drop policy if exists product_addons_owner_manage on public.product_addons;
create policy product_addons_owner_manage on public.product_addons
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
revoke all on table public.product_addons from public, anon, authenticated;
grant select, insert, delete on table public.product_addons to authenticated;

alter table public.owner_inventory_settings add column if not exists bulk_order_threshold integer not null default 5;
alter table public.owner_inventory_settings drop constraint if exists owner_inventory_settings_bulk_order_threshold_check;
alter table public.owner_inventory_settings add constraint owner_inventory_settings_bulk_order_threshold_check
  check (bulk_order_threshold between 1 and 999);
comment on column public.owner_inventory_settings.bulk_order_threshold is
  'OW-21 c10: the number of products from which an order is a Bulk Order (default 5).';

-- S2 API gate: the same permissions as products and menu add-ons.
select private.declare_endpoint('table/product_addons', array['SALES_VIEW_BRANCH'], array['CATALOG_CONFIG'], 'Add-ons offered with each product (OW-21 c5).');

notify pgrst, 'reload schema';
commit;
