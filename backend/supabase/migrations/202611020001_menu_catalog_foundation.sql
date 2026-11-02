create table if not exists public.units_of_measure (
  code text primary key,
  name text not null,
  dimension text not null
);

insert into public.units_of_measure (code, name, dimension) values
  ('g', 'Gram', 'mass'),
  ('kg', 'Kilogram', 'mass'),
  ('ml', 'Milliliter', 'volume'),
  ('L', 'Liter', 'volume'),
  ('pcs', 'Pieces', 'count'),
  ('bottle', 'Bottle', 'package'),
  ('pack', 'Pack', 'package'),
  ('tsp', 'Teaspoon', 'volume'),
  ('tbsp', 'Tablespoon', 'volume'),
  ('unknown', 'Unit pending confirmation', 'pending')
on conflict (code) do nothing;

create table if not exists public.unit_conversions (
  from_unit text not null references public.units_of_measure(code),
  to_unit text not null references public.units_of_measure(code),
  factor numeric(18, 9) not null check (factor > 0),
  primary key (from_unit, to_unit),
  check (from_unit <> to_unit)
);

create or replace function public.validate_unit_conversion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  from_dimension text;
  to_dimension text;
begin
  select dimension into from_dimension from public.units_of_measure where code = new.from_unit;
  select dimension into to_dimension from public.units_of_measure where code = new.to_unit;
  if from_dimension is null or to_dimension is null or from_dimension <> to_dimension then
    raise exception 'Unit conversion requires compatible measurement dimensions';
  end if;
  return new;
end;
$$;

drop trigger if exists unit_conversions_validate_dimensions on public.unit_conversions;
create trigger unit_conversions_validate_dimensions
before insert or update on public.unit_conversions
for each row execute function public.validate_unit_conversion();
revoke all on function public.validate_unit_conversion() from public, anon, authenticated;

insert into public.unit_conversions (from_unit, to_unit, factor) values
  ('kg', 'g', 1000),
  ('g', 'kg', 0.001),
  ('L', 'ml', 1000),
  ('ml', 'L', 0.001),
  ('tbsp', 'tsp', 3),
  ('tsp', 'tbsp', 0.333333333)
on conflict (from_unit, to_unit) do nothing;

insert into public.ingredient_categories (id, name) values
  ('prepared', 'Prepared Inventory')
on conflict (id) do nothing;

alter table public.ingredients
  add column if not exists automatic_consumption_enabled boolean not null default false;

create table if not exists public.ingredient_package_sizes (
  ingredient_id text primary key references public.ingredients(id) on delete cascade,
  package_quantity numeric(12, 3) not null check (package_quantity > 0),
  package_unit text not null references public.units_of_measure(code),
  package_label text not null default ''
);

alter table public.products
  add column if not exists category text not null default 'Other',
  add column if not exists internal_code text,
  add column if not exists display_name text,
  add column if not exists recipe_status text not null default 'incomplete';

alter table public.products
  drop constraint if exists products_recipe_status_check;
alter table public.products
  add constraint products_recipe_status_check
  check (recipe_status in ('complete', 'incomplete', 'pending_confirmation'));

create unique index if not exists products_internal_code_idx
  on public.products (internal_code)
  where internal_code is not null;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_code text not null,
  size_label text not null,
  price numeric(12, 2) not null check (price >= 0),
  active boolean not null default true,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_code)
);

alter table public.product_variants
  add column if not exists piece_count integer;

create table if not exists public.branch_product_visibility (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_variant_id uuid not null references public.product_variants(id) on delete cascade,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (branch_id, product_variant_id)
);

create table if not exists public.menu_addons (
  id uuid primary key default gen_random_uuid(),
  addon_code text not null unique,
  addon_name text not null unique,
  price numeric(12, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batter_preparation_batches (
  batch_reference text primary key,
  branch_id uuid not null references public.branches(id),
  prepared_by uuid not null references public.profiles(id),
  bottle_count integer not null default 5 check (bottle_count = 5),
  bottle_volume_ml numeric(12, 3) not null default 680 check (bottle_volume_ml = 680),
  expected_min_pieces integer not null default 100 check (expected_min_pieces = 100),
  expected_max_pieces integer not null default 125 check (expected_max_pieces = 125),
  created_at timestamptz not null default now()
);

alter table public.recipes
  add column if not exists automatic_consumption_enabled boolean not null default false;

create index if not exists product_variants_product_idx on public.product_variants (product_id);
create index if not exists branch_product_visibility_variant_idx on public.branch_product_visibility (product_variant_id);

drop trigger if exists product_variants_touch_updated_at on public.product_variants;
create trigger product_variants_touch_updated_at
before update on public.product_variants
for each row execute function public.touch_updated_at();

drop trigger if exists menu_addons_touch_updated_at on public.menu_addons;
create trigger menu_addons_touch_updated_at
before update on public.menu_addons
for each row execute function public.touch_updated_at();

create or replace function public.provision_branch_product_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.branch_product_visibility (branch_id, product_variant_id, is_visible)
  select new.id, variant.id, variant.is_available
  from public.product_variants variant
  where variant.active
  on conflict (branch_id, product_variant_id) do nothing;
  return new;
end;
$$;

drop trigger if exists branches_provision_product_visibility on public.branches;
create trigger branches_provision_product_visibility
after insert on public.branches
for each row execute function public.provision_branch_product_visibility();
revoke all on function public.provision_branch_product_visibility() from public, anon, authenticated;

create or replace function public.provision_variant_branch_visibility()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.active then
    insert into public.branch_product_visibility (branch_id, product_variant_id, is_visible)
    select branch.id, new.id, new.is_available
    from public.branches branch
    where branch.active
    on conflict (branch_id, product_variant_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists product_variants_provision_branch_visibility on public.product_variants;
create trigger product_variants_provision_branch_visibility
after insert on public.product_variants
for each row execute function public.provision_variant_branch_visibility();
revoke all on function public.provision_variant_branch_visibility() from public, anon, authenticated;

alter table public.units_of_measure enable row level security;
alter table public.unit_conversions enable row level security;
alter table public.ingredient_package_sizes enable row level security;
alter table public.product_variants enable row level security;
alter table public.branch_product_visibility enable row level security;
alter table public.menu_addons enable row level security;
alter table public.batter_preparation_batches enable row level security;

drop policy if exists units_read_active_users on public.units_of_measure;
create policy units_read_active_users on public.units_of_measure
for select to authenticated using (exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));

drop policy if exists unit_conversions_read_active_users on public.unit_conversions;
create policy unit_conversions_read_active_users on public.unit_conversions
for select to authenticated using (exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));

drop policy if exists package_sizes_read_active_users on public.ingredient_package_sizes;
create policy package_sizes_read_active_users on public.ingredient_package_sizes
for select to authenticated using (exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));

drop policy if exists package_sizes_owner_manage on public.ingredient_package_sizes;
create policy package_sizes_owner_manage on public.ingredient_package_sizes
for all to authenticated using (public.is_active_owner())
with check (public.is_active_owner());

drop policy if exists product_variants_read_active_users on public.product_variants;
create policy product_variants_read_active_users on public.product_variants
for select to authenticated using (
  public.is_active_owner()
  or exists (
    select 1
    from public.branch_product_visibility visibility
    where visibility.product_variant_id = product_variants.id
      and visibility.is_visible
      and public.can_access_branch(visibility.branch_id)
  )
);

drop policy if exists products_read_active_users on public.products;
create policy products_read_active_users on public.products
for select to authenticated using (
  public.is_active_owner()
  or exists (
    select 1
    from public.product_variants variant
    join public.branch_product_visibility visibility
      on visibility.product_variant_id = variant.id
    where variant.product_id = products.id
      and variant.active
      and variant.is_available
      and visibility.is_visible
      and public.can_access_branch(visibility.branch_id)
  )
);

drop policy if exists product_variants_owner_manage on public.product_variants;
create policy product_variants_owner_manage on public.product_variants
for all to authenticated using (public.is_active_owner())
with check (public.is_active_owner());

drop policy if exists branch_visibility_read_accessible on public.branch_product_visibility;
create policy branch_visibility_read_accessible on public.branch_product_visibility
for select to authenticated using (public.can_access_branch(branch_id));

drop policy if exists branch_visibility_owner_manage on public.branch_product_visibility;
create policy branch_visibility_owner_manage on public.branch_product_visibility
for all to authenticated using (public.is_active_owner())
with check (public.is_active_owner());

drop policy if exists menu_addons_read_active_users on public.menu_addons;
create policy menu_addons_read_active_users on public.menu_addons
for select to authenticated using (exists (
  select 1 from public.profiles where id = (select auth.uid()) and active
));

drop policy if exists menu_addons_owner_manage on public.menu_addons;
create policy menu_addons_owner_manage on public.menu_addons
for all to authenticated using (public.is_active_owner())
with check (public.is_active_owner());

drop policy if exists batter_batches_read_accessible on public.batter_preparation_batches;
create policy batter_batches_read_accessible on public.batter_preparation_batches
for select to authenticated using (public.can_access_branch(branch_id));

revoke all on public.units_of_measure, public.unit_conversions, public.ingredient_package_sizes,
  public.product_variants, public.branch_product_visibility, public.menu_addons,
  public.batter_preparation_batches from anon, authenticated;
grant select on public.units_of_measure, public.unit_conversions, public.ingredient_package_sizes,
  public.product_variants, public.branch_product_visibility, public.menu_addons,
  public.batter_preparation_batches to authenticated;
grant insert, update, delete on public.ingredient_package_sizes,
  public.product_variants, public.branch_product_visibility, public.menu_addons
  to authenticated;

create or replace function public.prepare_batter_batch(
  p_branch_id uuid,
  p_batch_reference text
)
returns public.batter_preparation_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_batch public.batter_preparation_batches%rowtype;
  v_inserted integer;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if nullif(btrim(p_batch_reference), '') is null then raise exception 'A batch reference is required'; end if;

  insert into public.batter_preparation_batches (batch_reference, branch_id, prepared_by)
  values (btrim(p_batch_reference), p_branch_id, v_profile.id)
  on conflict (batch_reference) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_batch
  from public.batter_preparation_batches
  where batch_reference = btrim(p_batch_reference)
  for update;
  if v_batch.branch_id <> p_branch_id then
    raise exception 'Batch reference belongs to another branch';
  end if;
  if v_batch.prepared_by <> v_profile.id and v_profile.role <> 'owner' then
    raise exception 'Batch reference already belongs to another staff member';
  end if;
  if v_inserted = 0 then
    return v_batch;
  end if;

  perform public.record_inventory_transactions(
    p_branch_id,
    jsonb_build_array(
      jsonb_build_object('ingredient_id', 'flour', 'type', 'usage', 'quantity', 0.625, 'reason', 'Batter preparation', 'notes', v_batch.batch_reference),
      jsonb_build_object('ingredient_id', 'dashi', 'type', 'usage', 'quantity', 2.4, 'reason', 'Batter preparation', 'notes', v_batch.batch_reference),
      jsonb_build_object('ingredient_id', 'eggs', 'type', 'usage', 'quantity', 5, 'reason', 'Batter preparation', 'notes', v_batch.batch_reference),
      jsonb_build_object('ingredient_id', 'soy-sauce', 'type', 'usage', 'quantity', 5, 'reason', 'Batter preparation', 'notes', v_batch.batch_reference),
      jsonb_build_object('ingredient_id', 'salt', 'type', 'usage', 'quantity', 2.5, 'reason', 'Batter preparation', 'notes', v_batch.batch_reference),
      jsonb_build_object('ingredient_id', 'baking-powder', 'type', 'usage', 'quantity', 2.5, 'reason', 'Batter preparation', 'notes', v_batch.batch_reference),
      jsonb_build_object('ingredient_id', 'prepared-batter', 'type', 'stock_in', 'quantity', 5, 'batch_reference', v_batch.batch_reference, 'reason', 'Batter preparation', 'notes', 'Five 680 ml bottles; 25 pieces maximum expected yield per bottle')
    )
  );
  return v_batch;
end;
$$;

revoke all on function public.prepare_batter_batch(uuid, text) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text) to authenticated;

insert into public.ingredients (id, category_id, name, unit, quantity_precision, automatic_consumption_enabled, active)
values
  ('dashi', 'dry-goods', 'Dashi', 'L', 3, false, true),
  ('soy-sauce', 'condiments', 'Soy Sauce', 'tbsp', 2, false, true),
  ('salt', 'dry-goods', 'Salt', 'tsp', 2, false, true),
  ('baking-powder', 'dry-goods', 'Baking Powder', 'tsp', 2, false, true),
  ('octobits', 'seafood', 'Octobits', 'pcs', 0, false, true),
  ('cheese-cubes', 'dairy-eggs', 'Cheese Cubes', 'pcs', 0, false, true),
  ('crab-sticks', 'seafood', 'Crab Sticks', 'pcs', 0, false, true),
  ('bacon-bits', 'dry-goods', 'Bacon Bits', 'unknown', 3, false, true),
  ('cabbage', 'produce', 'Cabbage (Chopped)', 'g', 0, false, true),
  ('japanese-white-sauce', 'condiments', 'Japanese White Sauce', 'L', 2, false, true),
  ('prepared-batter', 'prepared', 'Prepared Takoyaki Batter', 'bottle', 0, false, true),
  ('packaging', 'dry-goods', 'Packaging', 'pack', 0, false, true)
on conflict (id) do nothing;

insert into public.ingredient_package_sizes (ingredient_id, package_quantity, package_unit, package_label)
values
  ('prepared-batter', 680, 'ml', 'One bottle'),
  ('japanese-mayonnaise', 360, 'ml', 'One bottle'),
  ('sauces', 360, 'ml', 'One bottle'),
  ('bonito-flakes', 1, 'kg', 'One package'),
  ('packaging', 100, 'pcs', 'One pack')
on conflict (ingredient_id) do nothing;

do $$
declare
  expected record;
  by_code public.products%rowtype;
  by_name public.products%rowtype;
  by_id public.products%rowtype;
begin
  for expected in
    select *
    from (values
      ('10000000-0000-4000-8000-000000000001'::uuid, 'Octobits Takoyaki'::text, 'flavor_octobits'::text),
      ('10000000-0000-4000-8000-000000000002'::uuid, 'Cheese Takoyaki'::text, 'flavor_cheese'::text),
      ('10000000-0000-4000-8000-000000000003'::uuid, 'Crab Takoyaki'::text, 'flavor_crab'::text),
      ('10000000-0000-4000-8000-000000000004'::uuid, 'BaconBits Takoyaki'::text, 'flavor_bacon_bits'::text),
      ('10000000-0000-4000-8000-000000000005'::uuid, 'Octobits / Cheese'::text, 'combo_octobits_cheese_01'::text),
      ('10000000-0000-4000-8000-000000000006'::uuid, 'combo_octobits_cheese_02'::text, 'combo_octobits_cheese_02'::text),
      ('10000000-0000-4000-8000-000000000007'::uuid, 'Bacon / Cheese'::text, 'combo_bacon_cheese'::text),
      ('10000000-0000-4000-8000-000000000008'::uuid, 'Crab / Cheese'::text, 'combo_crab_cheese'::text)
    ) as products(id, product_name, internal_code)
  loop
    select * into by_code from public.products where internal_code = expected.internal_code;
    select * into by_name from public.products where product_name = expected.product_name;
    select * into by_id from public.products where id = expected.id;

    if found and by_id.product_name <> expected.product_name then
      raise exception 'Product UUID % is already assigned to %', expected.id, by_id.product_name;
    end if;
    if by_code.id is not null and by_code.product_name <> expected.product_name then
      raise exception 'Product internal_code % is already assigned to %', expected.internal_code, by_code.product_name;
    end if;
    if by_name.id is not null
      and by_name.internal_code is not null
      and by_name.internal_code <> expected.internal_code then
      raise exception 'Product name % has conflicting internal_code %', expected.product_name, by_name.internal_code;
    end if;
    if by_code.id is not null and by_name.id is not null and by_code.id <> by_name.id then
      raise exception 'Product identity is ambiguous for %', expected.internal_code;
    end if;
  end loop;
end;
$$;

update public.products product
set internal_code = mapping.internal_code
from (values
  ('Octobits Takoyaki', 'flavor_octobits'),
  ('Cheese Takoyaki', 'flavor_cheese'),
  ('Crab Takoyaki', 'flavor_crab'),
  ('BaconBits Takoyaki', 'flavor_bacon_bits'),
  ('Octobits / Cheese', 'combo_octobits_cheese_01'),
  ('Bacon / Cheese', 'combo_bacon_cheese'),
  ('Crab / Cheese', 'combo_crab_cheese')
) as mapping(product_name, internal_code)
where product.product_name = mapping.product_name
  and product.internal_code is null
  and not exists (
    select 1 from public.products conflict
    where conflict.internal_code = mapping.internal_code
  );

insert into public.products (id, product_name, display_name, internal_code, category, description, price, is_available, recipe_status)
values
  ('10000000-0000-4000-8000-000000000001', 'Octobits Takoyaki', 'Octobits Takoyaki', 'flavor_octobits', 'Flavors', 'Octobits takoyaki', 49, true, 'incomplete'),
  ('10000000-0000-4000-8000-000000000002', 'Cheese Takoyaki', 'Cheese Takoyaki', 'flavor_cheese', 'Flavors', 'Cheese takoyaki', 49, true, 'incomplete'),
  ('10000000-0000-4000-8000-000000000003', 'Crab Takoyaki', 'Crab Takoyaki', 'flavor_crab', 'Flavors', 'Crab takoyaki', 49, true, 'incomplete'),
  ('10000000-0000-4000-8000-000000000004', 'BaconBits Takoyaki', 'BaconBits Takoyaki', 'flavor_bacon_bits', 'Flavors', 'BaconBits takoyaki; recipe pending confirmation', 49, true, 'pending_confirmation'),
  ('10000000-0000-4000-8000-000000000005', 'Octobits / Cheese', 'Octobits / Cheese', 'combo_octobits_cheese_01', 'Combo', 'Octobits and cheese combo', 59, true, 'pending_confirmation'),
  ('10000000-0000-4000-8000-000000000006', 'combo_octobits_cheese_02', null, 'combo_octobits_cheese_02', 'Combo', 'Public display name pending owner confirmation', 59, false, 'pending_confirmation'),
  ('10000000-0000-4000-8000-000000000007', 'Bacon / Cheese', 'Bacon / Cheese', 'combo_bacon_cheese', 'Combo', 'Bacon and cheese combo; recipe pending confirmation', 59, true, 'pending_confirmation'),
  ('10000000-0000-4000-8000-000000000008', 'Crab / Cheese', 'Crab / Cheese', 'combo_crab_cheese', 'Combo', 'Crab and cheese combo', 59, true, 'pending_confirmation')
on conflict (product_name) do nothing;

insert into public.product_variants (id, product_id, variant_code, size_label, price, active, is_available)
select variant.id, product.id, variant.variant_code, variant.size_label, variant.price, true,
       product.is_available and product.internal_code <> 'combo_octobits_cheese_02'
from (values
  ('20000000-0000-4000-8000-000000000001'::uuid, 'flavor_octobits', '4pcs', '4 PCS', 49::numeric),
  ('20000000-0000-4000-8000-000000000002'::uuid, 'flavor_octobits', '8pcs', '8 PCS', 89::numeric),
  ('20000000-0000-4000-8000-000000000003'::uuid, 'flavor_octobits', '10plus1pcs', '10+1 PCS', 120::numeric),
  ('20000000-0000-4000-8000-000000000004'::uuid, 'flavor_cheese', '4pcs', '4 PCS', 49::numeric),
  ('20000000-0000-4000-8000-000000000005'::uuid, 'flavor_cheese', '8pcs', '8 PCS', 89::numeric),
  ('20000000-0000-4000-8000-000000000006'::uuid, 'flavor_cheese', '10plus1pcs', '10+1 PCS', 120::numeric),
  ('20000000-0000-4000-8000-000000000007'::uuid, 'flavor_crab', '4pcs', '4 PCS', 49::numeric),
  ('20000000-0000-4000-8000-000000000008'::uuid, 'flavor_crab', '8pcs', '8 PCS', 89::numeric),
  ('20000000-0000-4000-8000-000000000009'::uuid, 'flavor_crab', '10plus1pcs', '10+1 PCS', 120::numeric),
  ('20000000-0000-4000-8000-000000000010'::uuid, 'flavor_bacon_bits', '4pcs', '4 PCS', 49::numeric),
  ('20000000-0000-4000-8000-000000000011'::uuid, 'flavor_bacon_bits', '8pcs', '8 PCS', 89::numeric),
  ('20000000-0000-4000-8000-000000000012'::uuid, 'flavor_bacon_bits', '10plus1pcs', '10+1 PCS', 120::numeric),
  ('20000000-0000-4000-8000-000000000013'::uuid, 'combo_octobits_cheese_01', '4pcs', '4 PCS', 59::numeric),
  ('20000000-0000-4000-8000-000000000014'::uuid, 'combo_octobits_cheese_01', '8pcs', '8 PCS', 99::numeric),
  ('20000000-0000-4000-8000-000000000015'::uuid, 'combo_octobits_cheese_01', '10plus1pcs', '10+1 PCS', 139::numeric),
  ('20000000-0000-4000-8000-000000000016'::uuid, 'combo_octobits_cheese_02', '4pcs', '4 PCS', 59::numeric),
  ('20000000-0000-4000-8000-000000000017'::uuid, 'combo_octobits_cheese_02', '8pcs', '8 PCS', 99::numeric),
  ('20000000-0000-4000-8000-000000000018'::uuid, 'combo_octobits_cheese_02', '10plus1pcs', '10+1 PCS', 139::numeric),
  ('20000000-0000-4000-8000-000000000019'::uuid, 'combo_bacon_cheese', '4pcs', '4 PCS', 59::numeric),
  ('20000000-0000-4000-8000-000000000020'::uuid, 'combo_bacon_cheese', '8pcs', '8 PCS', 99::numeric),
  ('20000000-0000-4000-8000-000000000021'::uuid, 'combo_bacon_cheese', '10plus1pcs', '10+1 PCS', 139::numeric),
  ('20000000-0000-4000-8000-000000000022'::uuid, 'combo_crab_cheese', '4pcs', '4 PCS', 59::numeric),
  ('20000000-0000-4000-8000-000000000023'::uuid, 'combo_crab_cheese', '8pcs', '8 PCS', 99::numeric),
  ('20000000-0000-4000-8000-000000000024'::uuid, 'combo_crab_cheese', '10plus1pcs', '10+1 PCS', 139::numeric)
) as variant(id, internal_code, variant_code, size_label, price)
join public.products product on product.id = coalesce(
  (select internal_product.id from public.products internal_product
   where internal_product.internal_code = variant.internal_code
   limit 1),
  (select named_product.id from public.products named_product
   where named_product.product_name = case variant.internal_code
     when 'flavor_octobits' then 'Octobits Takoyaki'
     when 'flavor_cheese' then 'Cheese Takoyaki'
     when 'flavor_crab' then 'Crab Takoyaki'
     when 'flavor_bacon_bits' then 'BaconBits Takoyaki'
     when 'combo_octobits_cheese_01' then 'Octobits / Cheese'
     when 'combo_bacon_cheese' then 'Bacon / Cheese'
     when 'combo_crab_cheese' then 'Crab / Cheese'
     else null
   end
   limit 1)
)
on conflict do nothing;

update public.product_variants
set piece_count = case variant_code
  when '4pcs' then 4
  when '8pcs' then 8
  when '10plus1pcs' then 11
  else piece_count
end
where variant_code in ('4pcs', '8pcs', '10plus1pcs')
  and piece_count is null;

do $$
declare
  expected record;
  actual public.product_variants%rowtype;
begin
  for expected in
    select product.id, sizes.variant_code, sizes.price
    from public.products product
    cross join (values
      ('4pcs'::text, 49::numeric),
      ('8pcs'::text, 89::numeric),
      ('10plus1pcs'::text, 120::numeric)
    ) sizes(variant_code, price)
    where product.internal_code in ('flavor_octobits', 'flavor_cheese', 'flavor_crab', 'flavor_bacon_bits')
  loop
    select * into actual
    from public.product_variants
    where product_id = expected.id and variant_code = expected.variant_code;
    if not found or actual.price <> expected.price then
      raise exception 'Required regular variant is missing or has an unexpected price for product %', expected.id;
    end if;
  end loop;

  for expected in
    select product.id, sizes.variant_code, sizes.price
    from public.products product
    cross join (values
      ('4pcs'::text, 59::numeric),
      ('8pcs'::text, 99::numeric),
      ('10plus1pcs'::text, 139::numeric)
    ) sizes(variant_code, price)
    where product.internal_code in ('combo_octobits_cheese_01', 'combo_octobits_cheese_02', 'combo_bacon_cheese', 'combo_crab_cheese')
  loop
    select * into actual
    from public.product_variants
    where product_id = expected.id and variant_code = expected.variant_code;
    if not found or actual.price <> expected.price then
      raise exception 'Required combo variant is missing or has an unexpected price for product %', expected.id;
    end if;
  end loop;
end;
$$;

insert into public.menu_addons (id, addon_code, addon_name, price, active)
values
  ('30000000-0000-4000-8000-000000000001', 'japanese-white-sauce', 'Japanese white sauce', 10, true),
  ('30000000-0000-4000-8000-000000000002', 'takoyaki-sauce', 'Takoyaki sauce', 15, true),
  ('30000000-0000-4000-8000-000000000003', 'flakes', 'Flakes', 10, true)
on conflict do nothing;

insert into public.branch_product_visibility (branch_id, product_variant_id, is_visible)
select branch.id, variant.id, variant.is_available
from public.branches branch
cross join public.product_variants variant
where branch.active
on conflict (branch_id, product_variant_id) do nothing;

insert into public.recipes (product_id, ingredient_id, quantity_required, unit_of_measure, automatic_consumption_enabled)
select product.id, recipe.ingredient_id, recipe.quantity_required, recipe.unit_of_measure, false
from public.products product
join (values
  ('flavor_octobits', 'octobits', 4::numeric, 'pcs'),
  ('flavor_cheese', 'cheese-cubes', 4::numeric, 'pcs'),
  ('flavor_crab', 'crab-sticks', 4::numeric, 'pcs')
) recipe(internal_code, ingredient_id, quantity_required, unit_of_measure)
on recipe.internal_code = product.internal_code
on conflict (product_id, ingredient_id) do nothing;

insert into public.recipes (product_id, ingredient_id, quantity_required, unit_of_measure, automatic_consumption_enabled)
select product.id, 'prepared-batter', 1, 'bottle', false
from public.products product
where product.internal_code in ('flavor_octobits', 'flavor_cheese', 'flavor_crab')
on conflict (product_id, ingredient_id) do nothing;

alter table public.sale_items
  add column if not exists product_variant_id uuid references public.product_variants(id);

alter table public.sale_items
  drop constraint if exists sale_items_sale_id_product_id_key;

create unique index if not exists sale_items_sale_variant_idx
  on public.sale_items (sale_id, product_variant_id)
  where product_variant_id is not null;

alter table public.sales
  add column if not exists inventory_processing_status text not null default 'pending',
  add column if not exists inventory_processing_error text,
  add column if not exists inventory_processed_at timestamptz;

alter table public.sales
  drop constraint if exists sales_inventory_processing_status_check;
alter table public.sales
  add constraint sales_inventory_processing_status_check
  check (inventory_processing_status in ('pending', 'processing', 'completed', 'failed'));

create table if not exists public.shared_recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_code text not null unique,
  name text not null,
  estimated_yield_pieces numeric(12, 3) not null check (estimated_yield_pieces > 0),
  active boolean not null default false,
  automatic_consumption_enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shared_recipe_ingredients (
  shared_recipe_id uuid not null references public.shared_recipes(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  quantity_required numeric(18, 6) not null check (quantity_required > 0),
  unit_of_measure text not null,
  automatic_consumption_enabled boolean not null default true,
  primary key (shared_recipe_id, ingredient_id)
);

create table if not exists public.shared_recipe_products (
  shared_recipe_id uuid not null references public.shared_recipes(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  active boolean not null default true,
  primary key (shared_recipe_id, product_id)
);

create table if not exists public.sale_consumption_snapshots (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  quantity_consumed numeric(18, 6) not null check (quantity_consumed > 0),
  unit_of_measure text not null,
  applicable_pieces numeric(12, 3) not null check (applicable_pieces > 0),
  recipe_type text not null check (recipe_type in ('shared', 'product')),
  recipe_id uuid,
  recipe_version integer,
  recipe_quantity_required numeric(18, 6),
  estimated_yield_pieces numeric(12, 3),
  created_at timestamptz not null default now(),
  unique (sale_id, ingredient_id, recipe_type, recipe_id)
);

create table if not exists public.shared_recipe_versions (
  shared_recipe_id uuid not null references public.shared_recipes(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  estimated_yield_pieces numeric(12, 3) not null check (estimated_yield_pieces > 0),
  active boolean not null,
  automatic_consumption_enabled boolean not null,
  created_at timestamptz not null default now(),
  primary key (shared_recipe_id, version)
);

create table if not exists public.shared_recipe_version_ingredients (
  shared_recipe_id uuid not null,
  version integer not null,
  ingredient_id text not null references public.ingredients(id),
  quantity_required numeric(18, 6) not null check (quantity_required > 0),
  unit_of_measure text not null,
  automatic_consumption_enabled boolean not null,
  primary key (shared_recipe_id, version, ingredient_id),
  foreign key (shared_recipe_id, version)
    references public.shared_recipe_versions(shared_recipe_id, version)
    on delete cascade
);

create table if not exists public.sale_inventory_processing (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  status text not null check (status in ('pending', 'processing', 'completed', 'failed')),
  failure_reason text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.shared_recipes (
  id, recipe_code, name, estimated_yield_pieces, active,
  automatic_consumption_enabled, version
) values (
  '30000000-0000-4000-8000-000000000001',
  'shared-batter',
  'Shared Takoyaki Batter',
  125,
  true,
  true,
  1
)
on conflict (id) do nothing;

insert into public.shared_recipe_ingredients (
  shared_recipe_id, ingredient_id, quantity_required, unit_of_measure,
  automatic_consumption_enabled
) values
  ('30000000-0000-4000-8000-000000000001', 'flour', 0.625, 'kg', true),
  ('30000000-0000-4000-8000-000000000001', 'dashi', 2.4, 'L', true),
  ('30000000-0000-4000-8000-000000000001', 'eggs', 5, 'pcs', true),
  ('30000000-0000-4000-8000-000000000001', 'soy-sauce', 5, 'tbsp', true),
  ('30000000-0000-4000-8000-000000000001', 'salt', 2.5, 'tsp', true),
  ('30000000-0000-4000-8000-000000000001', 'baking-powder', 2.5, 'tsp', true)
on conflict (shared_recipe_id, ingredient_id) do nothing;

insert into public.shared_recipe_versions (
  shared_recipe_id, version, name, estimated_yield_pieces,
  active, automatic_consumption_enabled
) values (
  '30000000-0000-4000-8000-000000000001', 1, 'Shared Takoyaki Batter',
  125, true, true
)
on conflict (shared_recipe_id, version) do nothing;

insert into public.shared_recipe_version_ingredients (
  shared_recipe_id, version, ingredient_id, quantity_required,
  unit_of_measure, automatic_consumption_enabled
)
select shared_recipe_id, 1, ingredient_id, quantity_required,
       unit_of_measure, automatic_consumption_enabled
from public.shared_recipe_ingredients
where shared_recipe_id = '30000000-0000-4000-8000-000000000001'
on conflict (shared_recipe_id, version, ingredient_id) do nothing;

insert into public.shared_recipe_products (shared_recipe_id, product_id, active)
select '30000000-0000-4000-8000-000000000001', id, true
from public.products
where is_available
  and id <> '10000000-0000-4000-8000-000000000006'
on conflict (shared_recipe_id, product_id) do nothing;

alter table public.shared_recipes enable row level security;
alter table public.shared_recipe_ingredients enable row level security;
alter table public.shared_recipe_products enable row level security;
alter table public.sale_consumption_snapshots enable row level security;
alter table public.sale_inventory_processing enable row level security;
alter table public.shared_recipe_versions enable row level security;
alter table public.shared_recipe_version_ingredients enable row level security;

drop policy if exists shared_recipes_owner_manage on public.shared_recipes;
create policy shared_recipes_owner_manage on public.shared_recipes
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
drop policy if exists shared_recipes_read_authenticated on public.shared_recipes;
create policy shared_recipes_read_authenticated on public.shared_recipes
for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and active));
drop policy if exists shared_recipe_ingredients_owner_manage on public.shared_recipe_ingredients;
create policy shared_recipe_ingredients_owner_manage on public.shared_recipe_ingredients
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
drop policy if exists shared_recipe_ingredients_read_authenticated on public.shared_recipe_ingredients;
create policy shared_recipe_ingredients_read_authenticated on public.shared_recipe_ingredients
for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and active));
drop policy if exists shared_recipe_products_owner_manage on public.shared_recipe_products;
create policy shared_recipe_products_owner_manage on public.shared_recipe_products
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
drop policy if exists shared_recipe_products_read_authenticated on public.shared_recipe_products;
create policy shared_recipe_products_read_authenticated on public.shared_recipe_products
for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and active));
drop policy if exists sale_consumption_owner_read on public.sale_consumption_snapshots;
create policy sale_consumption_owner_read on public.sale_consumption_snapshots
for select to authenticated using (public.is_active_owner());
drop policy if exists sale_consumption_branch_read on public.sale_consumption_snapshots;
create policy sale_consumption_branch_read on public.sale_consumption_snapshots
for select to authenticated using (exists (
  select 1 from public.sales sale
  where sale.id = sale_consumption_snapshots.sale_id
    and public.can_access_branch(sale.branch_id)
));
drop policy if exists sale_processing_owner_manage on public.sale_inventory_processing;
create policy sale_processing_owner_manage on public.sale_inventory_processing
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
drop policy if exists sale_processing_branch_read on public.sale_inventory_processing;
create policy sale_processing_branch_read on public.sale_inventory_processing
for select to authenticated using (exists (
  select 1 from public.sales sale
  where sale.id = sale_inventory_processing.sale_id
    and public.can_access_branch(sale.branch_id)
));
drop policy if exists shared_recipe_versions_owner_manage on public.shared_recipe_versions;
create policy shared_recipe_versions_owner_manage on public.shared_recipe_versions
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
drop policy if exists shared_recipe_versions_read_authenticated on public.shared_recipe_versions;
create policy shared_recipe_versions_read_authenticated on public.shared_recipe_versions
for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and active));
drop policy if exists shared_recipe_version_ingredients_owner_manage on public.shared_recipe_version_ingredients;
create policy shared_recipe_version_ingredients_owner_manage on public.shared_recipe_version_ingredients
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
drop policy if exists shared_recipe_version_ingredients_read_authenticated on public.shared_recipe_version_ingredients;
create policy shared_recipe_version_ingredients_read_authenticated on public.shared_recipe_version_ingredients
for select to authenticated using (exists (select 1 from public.profiles where id = (select auth.uid()) and active));

revoke all on public.shared_recipes, public.shared_recipe_ingredients, public.shared_recipe_products,
  public.sale_consumption_snapshots, public.sale_inventory_processing,
  public.shared_recipe_versions, public.shared_recipe_version_ingredients from anon, authenticated;
grant select on public.shared_recipes, public.shared_recipe_ingredients, public.shared_recipe_products,
  public.sale_consumption_snapshots, public.sale_inventory_processing,
  public.shared_recipe_versions, public.shared_recipe_version_ingredients to authenticated;
grant insert, update, delete on public.shared_recipes, public.shared_recipe_ingredients,
  public.shared_recipe_products, public.shared_recipe_versions,
  public.shared_recipe_version_ingredients to authenticated;

create table if not exists public.sale_addons (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  addon_id uuid not null references public.menu_addons(id),
  quantity numeric(12, 3) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  unique (sale_id, addon_id)
);

alter table public.sale_addons enable row level security;

drop policy if exists sale_addons_read_accessible_branches on public.sale_addons;
create policy sale_addons_read_accessible_branches on public.sale_addons
for select to authenticated using (exists (
  select 1
  from public.sales sale
  where sale.id = sale_addons.sale_id
    and public.can_access_branch(sale.branch_id)
));

revoke all on public.sale_addons from anon, authenticated;
grant select on public.sale_addons to authenticated;

create or replace function public.submit_sale(
  p_transaction_reference text,
  p_branch_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_addons jsonb default '[]'::jsonb
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_addon jsonb;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_addon_record public.menu_addons%rowtype;
  v_quantity numeric(12, 3);
  v_unit_price numeric(12, 2);
  v_subtotal numeric(12, 2);
  v_expected_total numeric(12, 2) := 0;
  v_inventory_lines jsonb := '[]'::jsonb;
  v_recipe record;
  v_recipe_quantity numeric(12, 3);
  v_existing_item_count integer;
  v_product_id uuid;
  v_existing_addon_count integer;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then
    raise exception 'An active user profile is required';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception 'Branch access denied';
  end if;
  if nullif(btrim(p_transaction_reference), '') is null then
    raise exception 'A transaction reference is required';
  end if;
  if nullif(btrim(p_payment_method), '') is null then
    raise exception 'A payment method is required';
  end if;
  if p_total_amount is null or p_total_amount < 0 then
    raise exception 'A valid sale total is required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one sale item is required';
  end if;
  if jsonb_typeof(p_addons) <> 'array' then
    raise exception 'Sale add-ons must be an array';
  end if;

  select * into v_sale
  from public.sales
  where transaction_reference = btrim(p_transaction_reference)
  for update;
  if found then
    if v_sale.branch_id <> p_branch_id then
      raise exception 'Transaction reference belongs to another branch';
    end if;
    if v_sale.status = 'completed' then
      return v_sale;
    end if;
    raise exception 'Transaction reference already exists with status %', v_sale.status;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(v_item ->> 'variant_id', '') is null
      or nullif(v_item ->> 'quantity', '') is null
      or nullif(v_item ->> 'unit_price', '') is null then
      raise exception 'Each sale item requires variant_id, quantity, and unit_price';
    end if;
    begin
      v_quantity := (v_item ->> 'quantity')::numeric;
      v_unit_price := round((v_item ->> 'unit_price')::numeric, 2);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Sale item quantity and price must be numeric';
    end;
    if v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Sale item quantities must be positive whole numbers';
    end if;
    if v_unit_price < 0 then
      raise exception 'Sale item price cannot be negative';
    end if;

    select variant.*
      into v_variant
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    join public.branch_product_visibility visibility
      on visibility.product_variant_id = variant.id
     and visibility.branch_id = p_branch_id
     and visibility.is_visible
    where variant.id = (v_item ->> 'variant_id')::uuid
      and variant.active
      and variant.is_available
      and product.is_available
    for update of variant;
    if not found then
      raise exception 'Product variant is unavailable for this branch';
    end if;
    select * into v_product
    from public.products
    where id = v_variant.product_id;
    if v_unit_price <> v_variant.price then
      raise exception 'Sale price does not match the current menu price';
    end if;

    select count(*) into v_existing_item_count
    from jsonb_array_elements(p_items) existing_item
    where existing_item ->> 'variant_id' = v_variant.id::text;
    if v_existing_item_count > 1 then
      raise exception 'A sale variant may appear only once';
    end if;

    v_subtotal := round(v_quantity * v_variant.price, 2);
    v_expected_total := v_expected_total + v_subtotal;

    for v_recipe in
      select recipe.ingredient_id, recipe.quantity_required, recipe.unit_of_measure,
             ingredient.unit as ingredient_unit
      from public.recipes recipe
      join public.ingredients ingredient on ingredient.id = recipe.ingredient_id
      where recipe.product_id = v_product.id
        and recipe.automatic_consumption_enabled
        and ingredient.active
        and ingredient.id not in (
          'flour', 'dashi', 'eggs', 'soy-sauce', 'salt', 'baking-powder',
          'sauces', 'japanese-mayonnaise', 'japanese-white-sauce',
          'bonito-flakes', 'packaging'
        )
    loop
      if v_recipe.unit_of_measure <> v_recipe.ingredient_unit then
        raise exception 'Sale recipe unit for ingredient % is not directly compatible',
          v_recipe.ingredient_id;
      end if;
      v_recipe_quantity := v_recipe.quantity_required * v_quantity;
      v_inventory_lines := v_inventory_lines || jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_recipe.ingredient_id,
        'type', 'usage',
        'quantity', v_recipe_quantity,
        'reason', 'Sales consumption',
        'notes', btrim(p_transaction_reference)
      ));
    end loop;
  end loop;

  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    if nullif(v_addon ->> 'addon_id', '') is null then
      raise exception 'Each sale add-on requires addon_id';
    end if;
    select * into v_addon_record
    from public.menu_addons
    where id = (v_addon ->> 'addon_id')::uuid
      and active
    for update;
    if not found then
      raise exception 'Add-on is unavailable';
    end if;
    select count(*) into v_existing_addon_count
    from jsonb_array_elements(p_addons) existing_addon
    where existing_addon ->> 'addon_id' = v_addon_record.id::text;
    if v_existing_addon_count > 1 then
      raise exception 'An add-on may appear only once';
    end if;
    v_expected_total := v_expected_total + v_addon_record.price;
  end loop;

  if round(p_total_amount, 2) <> v_expected_total then
    raise exception 'Sale total does not match the current menu catalog';
  end if;

  if jsonb_array_length(v_inventory_lines) > 0 then
    perform public.record_inventory_transactions(p_branch_id, v_inventory_lines);
  end if;

  insert into public.sales (
    transaction_reference, branch_id, staff_id, total_amount, payment_method, status
  ) values (
    btrim(p_transaction_reference), p_branch_id, v_profile.id,
    v_expected_total, btrim(p_payment_method), 'completed'
  )
  returning * into v_sale;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select variant.price, variant.product_id
      into v_unit_price, v_product_id
    from public.product_variants variant
    where variant.id = (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    insert into public.sale_items (
      sale_id, product_id, product_variant_id, quantity, unit_price, subtotal
    ) values (
      v_sale.id, v_product_id, (v_item ->> 'variant_id')::uuid,
      v_quantity, v_unit_price, round(v_quantity * v_unit_price, 2)
    );
  end loop;

  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    select * into v_addon_record
    from public.menu_addons
    where id = (v_addon ->> 'addon_id')::uuid;
    insert into public.sale_addons (sale_id, addon_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_addon_record.id, 1, v_addon_record.price, v_addon_record.price);
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.submit_sale(text, uuid, text, numeric, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_sale(text, uuid, text, numeric, jsonb, jsonb)
  to authenticated;

create or replace function public.inspect_sale_reconciliation(p_transaction_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_movement_count integer;
begin
  if not public.is_active_owner() then
    raise exception 'Only an active owner may inspect sale reconciliation';
  end if;
  select * into v_sale
  from public.sales
  where transaction_reference = btrim(p_transaction_reference);
  if not found then
    raise exception 'Sale transaction was not found';
  end if;
  select count(*) into v_movement_count
  from public.inventory_movements
  where notes = btrim(p_transaction_reference);
  return jsonb_build_object(
    'transaction_reference', v_sale.transaction_reference,
    'sale_id', v_sale.id,
    'branch_id', v_sale.branch_id,
    'status', v_sale.status,
    'inventory_movement_count', v_movement_count,
    'reconciliation_status', 'atomic_submission'
  );
end;
$$;

revoke all on function public.inspect_sale_reconciliation(text)
  from public, anon, authenticated;
grant execute on function public.inspect_sale_reconciliation(text)
  to authenticated;

create or replace function public.reject_unimplemented_inventory_movements()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.type in ('transfer_in', 'transfer_out')
    or (new.type = 'sales_consumption'
      and coalesce(current_setting('app.sales_processing', true), '') <> 'true') then
    raise exception 'This movement type requires an approved atomic workflow';
  end if;
  return new;
end;
$$;

create or replace function public.process_sale_inventory(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_profile public.profiles%rowtype;
  v_line record;
  v_inventory_lines jsonb;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found or not (v_profile.role = 'owner' or exists (
    select 1 from public.sales sale
    where sale.id = p_sale_id and public.can_access_branch(sale.branch_id)
  )) then
    raise exception 'Sale processing access denied';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale was not found'; end if;

  insert into public.sale_inventory_processing (sale_id, status, attempt_count)
  values (p_sale_id, 'processing', 1)
  on conflict (sale_id) do update
    set status = case
      when sale_inventory_processing.status = 'completed' then 'completed'
      else 'processing'
    end,
    attempt_count = sale_inventory_processing.attempt_count + 1,
    failure_reason = null,
    updated_at = now();

  if exists (
    select 1 from public.sale_inventory_processing
    where sale_id = p_sale_id and status = 'completed'
  ) then
    return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
  end if;

  begin
    perform set_config('app.sales_processing', 'true', true);

    for v_line in
      with shared_usage as (
        select sr.id as recipe_id, sr.version as recipe_version,
               sri.ingredient_id, ingredient.unit as unit_of_measure,
               sri.quantity_required as recipe_quantity_required,
               sr.estimated_yield_pieces,
               sum(si.quantity * variant.piece_count) as applicable_pieces,
               sum(
                 sri.quantity_required
                 * coalesce(conversion.factor, 1)
                 / sr.estimated_yield_pieces
                 * si.quantity * variant.piece_count
               ) as quantity_consumed
        from public.sale_items si
        join public.product_variants variant on variant.id = si.product_variant_id
        join public.shared_recipe_products srp on srp.product_id = si.product_id and srp.active
        join public.shared_recipes sr on sr.id = srp.shared_recipe_id
          and sr.active and sr.automatic_consumption_enabled
        join public.shared_recipe_ingredients sri on sri.shared_recipe_id = sr.id
          and sri.automatic_consumption_enabled
        join public.ingredients ingredient on ingredient.id = sri.ingredient_id and ingredient.active
        left join lateral (
          select factor from public.unit_conversions
          where from_unit = sri.unit_of_measure and to_unit = ingredient.unit
          union all
          select 1 / factor from public.unit_conversions
          where from_unit = ingredient.unit and to_unit = sri.unit_of_measure
          limit 1
        ) conversion on true
        where si.sale_id = p_sale_id
        group by sr.id, sr.version, sri.ingredient_id, ingredient.unit,
                 sri.quantity_required, sr.estimated_yield_pieces, conversion.factor
      )
      select * from shared_usage
    loop
      if v_line.quantity_consumed <= 0 then continue; end if;
      v_inventory_lines := jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_line.ingredient_id,
        'type', 'sales_consumption',
        'quantity', v_line.quantity_consumed,
        'reason', 'Sales consumption',
        'notes', v_sale.transaction_reference
      ));
      perform public.record_inventory_transactions(v_sale.branch_id, v_inventory_lines);
      insert into public.sale_consumption_snapshots (
        sale_id, ingredient_id, quantity_consumed, unit_of_measure,
        applicable_pieces, recipe_type, recipe_id, recipe_version,
        recipe_quantity_required, estimated_yield_pieces
      ) values (
        p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
        v_line.unit_of_measure, v_line.applicable_pieces,
        'shared', v_line.recipe_id, v_line.recipe_version,
        v_line.recipe_quantity_required, v_line.estimated_yield_pieces
      );
    end loop;

    for v_line in
      select recipe.id as recipe_id, recipe.ingredient_id,
             ingredient.unit as unit_of_measure,
             recipe.quantity_required as recipe_quantity_required,
             sum(recipe.quantity_required * si.quantity) as quantity_consumed,
             sum(si.quantity * variant.piece_count) as applicable_pieces
      from public.sale_items si
      join public.product_variants variant on variant.id = si.product_variant_id
      join public.recipes recipe on recipe.product_id = si.product_id
        and recipe.automatic_consumption_enabled
      join public.ingredients ingredient on ingredient.id = recipe.ingredient_id and ingredient.active
      where si.sale_id = p_sale_id
        and not exists (
          select 1
          from public.shared_recipe_products shared_product
          join public.shared_recipes shared_recipe on shared_recipe.id = shared_product.shared_recipe_id
            and shared_recipe.active and shared_recipe.automatic_consumption_enabled
          join public.shared_recipe_ingredients shared_line on shared_line.shared_recipe_id = shared_recipe.id
            and shared_line.ingredient_id = recipe.ingredient_id
          where shared_product.product_id = si.product_id and shared_product.active
        )
        and recipe.unit_of_measure = ingredient.unit
      group by recipe.id, recipe.ingredient_id, ingredient.unit
    loop
      if v_line.quantity_consumed <= 0 then continue; end if;
      v_inventory_lines := jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_line.ingredient_id,
        'type', 'sales_consumption',
        'quantity', v_line.quantity_consumed,
        'reason', 'Sales consumption',
        'notes', v_sale.transaction_reference
      ));
      perform public.record_inventory_transactions(v_sale.branch_id, v_inventory_lines);
      insert into public.sale_consumption_snapshots (
        sale_id, ingredient_id, quantity_consumed, unit_of_measure,
        applicable_pieces, recipe_type, recipe_id, recipe_version,
        recipe_quantity_required, estimated_yield_pieces
      ) values (
        p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
        v_line.unit_of_measure, v_line.applicable_pieces,
        'product', v_line.recipe_id, null,
        v_line.recipe_quantity_required, null
      );
    end loop;

    update public.sale_inventory_processing
    set status = 'completed', processed_at = now(), updated_at = now()
    where sale_id = p_sale_id;
    update public.sales
    set inventory_processing_status = 'completed',
        inventory_processing_error = null,
        inventory_processed_at = now()
    where id = p_sale_id;
    return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
  exception when others then
    update public.sale_inventory_processing
    set status = 'failed', failure_reason = sqlerrm, updated_at = now()
    where sale_id = p_sale_id;
    update public.sales
    set inventory_processing_status = 'failed',
        inventory_processing_error = sqlerrm
    where id = p_sale_id;
    return jsonb_build_object('status', 'failed', 'sale_id', p_sale_id, 'error', sqlerrm);
  end;
end;
$$;

revoke all on function public.process_sale_inventory(uuid) from public, anon;
grant execute on function public.process_sale_inventory(uuid) to authenticated;

create or replace function public.submit_sale(
  p_transaction_reference text,
  p_branch_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_addons jsonb default '[]'::jsonb
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_addon jsonb;
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_addon_record public.menu_addons%rowtype;
  v_quantity numeric;
  v_unit_price numeric;
  v_expected_total numeric := 0;
  v_existing_item_count integer;
begin
  select * into v_profile from public.profiles where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if nullif(btrim(p_transaction_reference), '') is null then raise exception 'A transaction reference is required'; end if;
  if nullif(btrim(p_payment_method), '') is null then raise exception 'A payment method is required'; end if;
  if p_total_amount is null or p_total_amount < 0 then raise exception 'A valid sale total is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one sale item is required'; end if;
  if jsonb_typeof(p_addons) <> 'array' then raise exception 'Sale add-ons must be an array'; end if;

  select * into v_sale from public.sales where transaction_reference = btrim(p_transaction_reference) for update;
  if found then
    if v_sale.branch_id <> p_branch_id then raise exception 'Transaction reference belongs to another branch'; end if;
    if v_sale.inventory_processing_status in ('pending', 'failed') then
      perform public.process_sale_inventory(v_sale.id);
      select * into v_sale from public.sales where id = v_sale.id;
    end if;
    return v_sale;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := round((v_item ->> 'unit_price')::numeric, 2);
    if v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then raise exception 'Sale quantities must be positive whole numbers'; end if;
    select variant.* into v_variant
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    join public.branch_product_visibility visibility on visibility.product_variant_id = variant.id
      and visibility.branch_id = p_branch_id and visibility.is_visible
    where variant.id = (v_item ->> 'variant_id')::uuid and variant.active and variant.is_available and product.is_available
    for update of variant;
    if not found then raise exception 'Product variant is unavailable for this branch'; end if;
    if v_variant.piece_count is null then raise exception 'Product variant has no configured piece count'; end if;
    if v_unit_price <> v_variant.price then raise exception 'Sale price does not match the current menu price'; end if;
    select count(*) into v_existing_item_count from jsonb_array_elements(p_items) existing_item where existing_item ->> 'variant_id' = v_variant.id::text;
    if v_existing_item_count > 1 then raise exception 'A sale variant may appear only once'; end if;
    v_expected_total := v_expected_total + round(v_quantity * v_variant.price, 2);
  end loop;

  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    select * into v_addon_record from public.menu_addons where id = (v_addon ->> 'addon_id')::uuid and active for update;
    if not found then raise exception 'Add-on is unavailable'; end if;
    v_expected_total := v_expected_total + v_addon_record.price;
  end loop;
  if round(p_total_amount, 2) <> round(v_expected_total, 2) then raise exception 'Sale total does not match the current menu catalog'; end if;

  insert into public.sales (
    transaction_reference, branch_id, staff_id, total_amount, payment_method, status, inventory_processing_status
  ) values (
    btrim(p_transaction_reference), p_branch_id, v_profile.id, v_expected_total, btrim(p_payment_method), 'completed', 'pending'
  ) returning * into v_sale;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select variant.price, variant.product_id into v_unit_price, v_product.id
    from public.product_variants variant where variant.id = (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    insert into public.sale_items (sale_id, product_id, product_variant_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_product.id, (v_item ->> 'variant_id')::uuid, v_quantity, v_unit_price, round(v_quantity * v_unit_price, 2));
  end loop;
  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    select * into v_addon_record from public.menu_addons where id = (v_addon ->> 'addon_id')::uuid;
    insert into public.sale_addons (sale_id, addon_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_addon_record.id, 1, v_addon_record.price, v_addon_record.price);
  end loop;

  perform public.process_sale_inventory(v_sale.id);
  select * into v_sale from public.sales where id = v_sale.id;
  return v_sale;
end;
$$;

revoke all on function public.submit_sale(text, uuid, text, numeric, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.submit_sale(text, uuid, text, numeric, jsonb, jsonb) to authenticated;
