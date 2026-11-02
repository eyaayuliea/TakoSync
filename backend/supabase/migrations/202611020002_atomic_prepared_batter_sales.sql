-- Keep raw batter consumption in preparation batches. Sales consume the
-- configured quantity of prepared-batter stock for the configured yield.
alter table public.shared_recipes
  add column if not exists prepared_quantity numeric(18, 6) not null default 5
    check (prepared_quantity > 0),
  add column if not exists prepared_unit text not null default 'bottle';

alter table public.shared_recipe_versions
  add column if not exists prepared_quantity numeric(18, 6) not null default 5
    check (prepared_quantity > 0),
  add column if not exists prepared_unit text not null default 'bottle';

alter table public.shared_recipes
  drop constraint if exists shared_recipes_prepared_unit_fkey;
alter table public.shared_recipes
  add constraint shared_recipes_prepared_unit_fkey
  foreign key (prepared_unit) references public.units_of_measure(code);

alter table public.shared_recipe_versions
  drop constraint if exists shared_recipe_versions_prepared_unit_fkey;
alter table public.shared_recipe_versions
  add constraint shared_recipe_versions_prepared_unit_fkey
  foreign key (prepared_unit) references public.units_of_measure(code);

alter table public.batter_preparation_batches
  add column if not exists prepared_quantity numeric(18, 6) not null default 5
    check (prepared_quantity > 0),
  add column if not exists prepared_unit text not null default 'bottle',
  add column if not exists estimated_yield_pieces numeric(12, 3) not null default 125
    check (estimated_yield_pieces > 0);
alter table public.batter_preparation_batches
  drop constraint if exists batter_preparation_batches_bottle_count_check;
alter table public.batter_preparation_batches
  drop constraint if exists batter_preparation_batches_bottle_volume_ml_check,
  drop constraint if exists batter_preparation_batches_expected_min_pieces_check,
  drop constraint if exists batter_preparation_batches_expected_max_pieces_check;
alter table public.batter_preparation_batches
  add constraint batter_preparation_batches_bottle_count_check
  check (bottle_count = prepared_quantity and prepared_quantity = trunc(prepared_quantity));
alter table public.batter_preparation_batches
  drop constraint if exists batter_preparation_batches_prepared_unit_fkey;
alter table public.batter_preparation_batches
  add constraint batter_preparation_batches_prepared_unit_fkey
  foreign key (prepared_unit) references public.units_of_measure(code);

drop index if exists public.inventory_movements_sale_consumption_ref_idx;
do $$
begin
  if exists (
    select 1
    from public.inventory_movements
    where type = 'sales_consumption'
      and notes like 'sale:%'
    group by branch_id, notes, ingredient_id, type
    having count(*) > 1
  ) then
    raise exception 'Duplicate sale consumption movements exist; reconcile them before applying this migration';
  end if;
end;
$$;
create unique index inventory_movements_sale_consumption_ref_idx
  on public.inventory_movements (branch_id, notes, ingredient_id, type)
  where type = 'sales_consumption' and notes like 'sale:%';

update public.shared_recipe_versions version
set prepared_quantity = recipe.prepared_quantity,
    prepared_unit = recipe.prepared_unit
from public.shared_recipes recipe
where version.shared_recipe_id = recipe.id
  and version.version = recipe.version;

do $$
declare
  invalid_line record;
begin
  select shared_line.ingredient_id, ingredient.unit
    into invalid_line
  from public.shared_recipes recipe
  join public.shared_recipe_ingredients shared_line
    on shared_line.shared_recipe_id = recipe.id
   and shared_line.automatic_consumption_enabled
  left join public.ingredients ingredient on ingredient.id = shared_line.ingredient_id
  where recipe.recipe_code = 'shared-batter'
    and (ingredient.id is null or not ingredient.active
      or shared_line.unit_of_measure <> ingredient.unit)
  limit 1;
  if found then
    if invalid_line.unit is null then
      raise exception 'Shared batter recipe ingredient % is missing or inactive', invalid_line.ingredient_id;
    end if;
    raise exception 'Shared batter recipe unit for ingredient % does not match inventory unit %',
      invalid_line.ingredient_id, invalid_line.unit;
  end if;
end;
$$;

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
  v_recipe public.shared_recipes%rowtype;
  v_prepared_ingredient public.ingredients%rowtype;
  v_line record;
  v_preparation_lines jsonb := '[]'::jsonb;
  v_inserted integer;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if nullif(btrim(p_batch_reference), '') is null then raise exception 'A batch reference is required'; end if;

  select * into v_recipe
  from public.shared_recipes
  where recipe_code = 'shared-batter'
    and active and automatic_consumption_enabled
  for update;
  if not found then raise exception 'An active shared batter recipe is required'; end if;
  if v_recipe.prepared_quantity <= 0 or v_recipe.estimated_yield_pieces <= 0 then
    raise exception 'Shared batter recipe has an invalid prepared quantity or yield';
  end if;

  select * into v_prepared_ingredient
  from public.ingredients
  where id = 'prepared-batter' and active;
  if not found then raise exception 'Prepared batter inventory item is not configured'; end if;

  if v_prepared_ingredient.unit <> v_recipe.prepared_unit then
    raise exception 'Prepared batter unit % does not match inventory unit %',
      v_recipe.prepared_unit, v_prepared_ingredient.unit;
  end if;
  if v_recipe.prepared_quantity <> trunc(v_recipe.prepared_quantity) then
    raise exception 'Prepared quantity must match the whole-unit inventory precision';
  end if;

  if exists (
    select 1
    from public.shared_recipe_ingredients shared_line
    left join public.ingredients ingredient on ingredient.id = shared_line.ingredient_id
    where shared_line.shared_recipe_id = v_recipe.id
      and shared_line.automatic_consumption_enabled
      and (ingredient.id is null or not ingredient.active)
  ) then
    raise exception 'Shared batter recipe contains a missing or inactive ingredient';
  end if;

  insert into public.batter_preparation_batches (
    batch_reference, branch_id, prepared_by, bottle_count,
    prepared_quantity, prepared_unit, estimated_yield_pieces
  ) values (
    btrim(p_batch_reference), p_branch_id, v_profile.id,
    v_recipe.prepared_quantity, v_recipe.prepared_quantity, v_recipe.prepared_unit,
    v_recipe.estimated_yield_pieces
  )
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
  if v_inserted = 0 then return v_batch; end if;

  for v_line in
    select shared_line.ingredient_id, shared_line.quantity_required,
      shared_line.unit_of_measure, ingredient.unit
    from public.shared_recipe_ingredients shared_line
    join public.ingredients ingredient on ingredient.id = shared_line.ingredient_id
      and ingredient.active
    where shared_line.shared_recipe_id = v_recipe.id
      and shared_line.automatic_consumption_enabled
      and shared_line.ingredient_id <> 'prepared-batter'
  loop
    if v_line.unit_of_measure <> v_line.unit then
      raise exception 'Batter recipe unit for ingredient % does not match inventory unit',
        v_line.ingredient_id;
    end if;
    v_preparation_lines := v_preparation_lines || jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_line.ingredient_id,
      'type', 'usage',
      'quantity', v_line.quantity_required,
      'reason', 'Batter preparation',
      'notes', v_batch.batch_reference
    ));
  end loop;
  v_preparation_lines := v_preparation_lines || jsonb_build_array(jsonb_build_object(
    'ingredient_id', 'prepared-batter', 'type', 'stock_in',
    'quantity', v_recipe.prepared_quantity, 'batch_reference', v_batch.batch_reference,
    'reason', 'Batter preparation',
    'notes', format('Prepared quantity %s %s; configured yield %s pieces',
      v_recipe.prepared_quantity, v_recipe.prepared_unit, v_recipe.estimated_yield_pieces)
  ));
  perform public.record_inventory_transactions(p_branch_id, v_preparation_lines);
  return v_batch;
end;
$$;

revoke all on function public.prepare_batter_batch(uuid, text) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text) to authenticated;

insert into public.shared_recipe_ingredients (
  shared_recipe_id, ingredient_id, quantity_required, unit_of_measure,
  automatic_consumption_enabled
)
select id, 'prepared-batter', prepared_quantity, prepared_unit, true
from public.shared_recipes
where recipe_code = 'shared-batter'
on conflict (shared_recipe_id, ingredient_id) do update
set quantity_required = excluded.quantity_required,
    unit_of_measure = excluded.unit_of_measure,
    automatic_consumption_enabled = excluded.automatic_consumption_enabled;

update public.shared_recipe_versions version
set prepared_quantity = recipe.prepared_quantity,
    prepared_unit = recipe.prepared_unit
from public.shared_recipes recipe
where version.shared_recipe_id = recipe.id
  and version.version = recipe.version;

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
  v_inventory_lines jsonb := '[]'::jsonb;
  v_prepared_ingredient public.ingredients%rowtype;
  v_error text;
begin
  begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then
    raise exception 'An active user profile is required';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;
  if not found then raise exception 'Sale was not found'; end if;
  if not (v_profile.role = 'owner' or public.can_access_branch(v_sale.branch_id)) then
    raise exception 'Sale processing access denied';
  end if;

  select * into v_prepared_ingredient
  from public.ingredients
  where id = 'prepared-batter' and active;
  if not found then raise exception 'Prepared batter inventory item is not configured'; end if;

  if exists (
    select 1
    from public.sale_items si
    join public.shared_recipe_products srp
      on srp.product_id = si.product_id and srp.active
    join public.shared_recipes sr
      on sr.id = srp.shared_recipe_id
     and sr.active and sr.automatic_consumption_enabled
    where si.sale_id = p_sale_id
    group by si.product_id
    having count(distinct sr.id) > 1
  ) then
    raise exception 'A sale product cannot use multiple active shared recipes';
  end if;

  if exists (
    select 1 from public.sale_inventory_processing
    where sale_id = p_sale_id and status = 'completed'
  ) then
    return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
  end if;

  insert into public.sale_inventory_processing (sale_id, status, attempt_count)
  values (p_sale_id, 'processing', 1)
  on conflict (sale_id) do update
  set status = 'processing',
      attempt_count = sale_inventory_processing.attempt_count + 1,
      failure_reason = null,
      updated_at = now();

  -- Shared batter recipes describe the raw ingredients used to make a batch.
  -- A sale consumes the prepared output instead, using the owner-configured
  -- prepared quantity divided by the configured piece yield.
  for v_line in
    with shared_usage as (
      select
        sr.id as recipe_id,
        sr.version as recipe_version,
        sr.prepared_quantity,
        sr.prepared_unit,
        sr.estimated_yield_pieces,
        sum(si.quantity * variant.piece_count) as applicable_pieces
      from public.sale_items si
      join public.product_variants variant on variant.id = si.product_variant_id
      join public.shared_recipe_products srp
        on srp.product_id = si.product_id and srp.active
      join public.shared_recipes sr
        on sr.id = srp.shared_recipe_id
       and sr.active and sr.automatic_consumption_enabled
      where si.sale_id = p_sale_id
      group by sr.id, sr.version,
        sr.prepared_quantity, sr.prepared_unit, sr.estimated_yield_pieces
    )
    select
      'prepared-batter'::text as ingredient_id,
      prepared_unit as unit_of_measure,
      recipe_id,
      recipe_version,
      applicable_pieces,
      prepared_quantity,
      prepared_quantity * applicable_pieces / estimated_yield_pieces as quantity_consumed,
      estimated_yield_pieces
    from shared_usage
  loop
    if v_line.unit_of_measure <> v_prepared_ingredient.unit then
      raise exception 'Prepared batter unit % does not match inventory unit %',
        v_line.unit_of_measure, v_prepared_ingredient.unit;
    end if;
    if v_line.estimated_yield_pieces is null or v_line.estimated_yield_pieces <= 0
      or v_line.prepared_quantity is null or v_line.prepared_quantity <= 0 then
      raise exception 'Shared batter recipe has an invalid prepared quantity or yield';
    end if;
    if v_line.quantity_consumed <= 0 then continue; end if;
    insert into public.sale_consumption_snapshots (
      sale_id, ingredient_id, quantity_consumed, unit_of_measure,
      applicable_pieces, recipe_type, recipe_id, recipe_version,
      recipe_quantity_required, estimated_yield_pieces
    ) values (
      p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
      v_line.unit_of_measure, v_line.applicable_pieces,
      'shared', v_line.recipe_id, v_line.recipe_version,
      v_line.prepared_quantity, v_line.estimated_yield_pieces
    );
  end loop;

  -- Reject mismatched product recipe units instead of silently skipping them.
  if exists (
    select 1
    from public.sale_items si
    join public.recipes recipe
      on recipe.product_id = si.product_id
     and recipe.automatic_consumption_enabled
    left join public.ingredients ingredient
      on ingredient.id = recipe.ingredient_id
    where si.sale_id = p_sale_id
      and (ingredient.id is null or not ingredient.active)
      and not (
        recipe.ingredient_id = 'prepared-batter'
        and exists (
          select 1
          from public.shared_recipe_products shared_product
          join public.shared_recipes shared_recipe
            on shared_recipe.id = shared_product.shared_recipe_id
           and shared_recipe.active
           and shared_recipe.automatic_consumption_enabled
          where shared_product.product_id = si.product_id
            and shared_product.active
        )
      )
  ) then
    raise exception 'A product recipe contains a missing or inactive ingredient';
  end if;

  if exists (
    select 1
    from public.sale_items si
    join public.recipes recipe
      on recipe.product_id = si.product_id
     and recipe.automatic_consumption_enabled
    left join public.ingredients ingredient
      on ingredient.id = recipe.ingredient_id
    where si.sale_id = p_sale_id
      and ingredient.active
      and recipe.unit_of_measure <> ingredient.unit
      and not (
        recipe.ingredient_id = 'prepared-batter'
        and exists (
        select 1
        from public.shared_recipe_products shared_product
        join public.shared_recipes shared_recipe
          on shared_recipe.id = shared_product.shared_recipe_id
         and shared_recipe.active
         and shared_recipe.automatic_consumption_enabled
        join public.shared_recipe_ingredients shared_line
          on shared_line.shared_recipe_id = shared_recipe.id
         and shared_line.ingredient_id = recipe.ingredient_id
         and shared_line.automatic_consumption_enabled
        where shared_product.product_id = si.product_id
          and shared_product.active
        )
      )
  ) then
    raise exception 'A product recipe unit does not match its inventory ingredient unit';
  end if;

  -- Product recipes remain authoritative for product-specific ingredients.
  -- Only an explicit prepared-batter line covered by a shared recipe is
  -- excluded; product-specific fillings remain authoritative.
  for v_line in
    select recipe.ingredient_id,
      ingredient.unit as unit_of_measure,
      recipe.id as recipe_id,
      recipe.quantity_required as recipe_quantity_required,
      sum(recipe.quantity_required * si.quantity) as quantity_consumed,
      sum(si.quantity * variant.piece_count) as applicable_pieces
    from public.sale_items si
    join public.product_variants variant on variant.id = si.product_variant_id
    join public.recipes recipe
      on recipe.product_id = si.product_id
     and recipe.automatic_consumption_enabled
    join public.ingredients ingredient
      on ingredient.id = recipe.ingredient_id and ingredient.active
    where si.sale_id = p_sale_id
      and not (
        recipe.ingredient_id = 'prepared-batter'
        and exists (
          select 1
          from public.shared_recipe_products shared_product
          join public.shared_recipes shared_recipe
            on shared_recipe.id = shared_product.shared_recipe_id
           and shared_recipe.active
           and shared_recipe.automatic_consumption_enabled
          where shared_product.product_id = si.product_id
            and shared_product.active
        )
      )

    group by recipe.ingredient_id, ingredient.unit, recipe.id,
      recipe.quantity_required
  loop
    if v_line.quantity_consumed <= 0 then continue; end if;
    insert into public.sale_consumption_snapshots (
      sale_id, ingredient_id, quantity_consumed, unit_of_measure,
      applicable_pieces, recipe_type, recipe_id, recipe_quantity_required
    ) values (
      p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
      v_line.unit_of_measure, v_line.applicable_pieces,
      'product', v_line.recipe_id, v_line.recipe_quantity_required
    );
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
    'ingredient_id', movement.ingredient_id,
    'type', 'sales_consumption',
    'quantity', movement.quantity_consumed,
    'reason', 'Sales consumption',
    'notes', 'sale:' || p_sale_id::text
  )), '[]'::jsonb)
  into v_inventory_lines
  from (
    select ingredient_id, sum(quantity_consumed) as quantity_consumed
    from public.sale_consumption_snapshots
    where sale_id = p_sale_id
    group by ingredient_id
    order by ingredient_id
  ) movement;

  -- One ledger call makes all movements atomic: a shortage in any line rolls
  -- back every movement and the caller receives the database exception.
  if jsonb_array_length(v_inventory_lines) > 0 then
    perform set_config('app.sales_processing', 'true', true);
    perform public.record_inventory_transactions(v_sale.branch_id, v_inventory_lines);
  end if;

  update public.sale_inventory_processing
  set status = 'completed', processed_at = now(), updated_at = now()
  where sale_id = p_sale_id;
  update public.sales
  set status = 'completed',
      inventory_processing_status = 'completed',
      inventory_processing_error = null,
      inventory_processed_at = now()
  where id = p_sale_id;

  return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_sale.id is null then
      raise;
    end if;
    insert into public.sale_inventory_processing (
      sale_id, status, failure_reason, attempt_count, updated_at
    ) values (
      v_sale.id, 'failed', v_error, 1, now()
    )
    on conflict (sale_id) do update
    set status = 'failed',
        failure_reason = excluded.failure_reason,
        updated_at = excluded.updated_at;
    update public.sales
    set inventory_processing_status = 'failed',
        inventory_processing_error = v_error
    where id = v_sale.id;
    return jsonb_build_object('status', 'failed', 'sale_id', v_sale.id, 'error', v_error);
  end;
end;
$$;

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
  v_addon_record public.menu_addons%rowtype;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_expected_total numeric := 0;
  v_existing_item_count integer;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if nullif(btrim(p_transaction_reference), '') is null then raise exception 'A transaction reference is required'; end if;
  if nullif(btrim(p_payment_method), '') is null then raise exception 'A payment method is required'; end if;
  if p_total_amount is null or p_total_amount < 0 then raise exception 'A valid sale total is required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one sale item is required'; end if;
  if jsonb_typeof(p_addons) <> 'array' then raise exception 'Sale add-ons must be an array'; end if;

  select * into v_sale from public.sales
  where transaction_reference = btrim(p_transaction_reference)
  for update;
  if found then
    if v_sale.branch_id <> p_branch_id then raise exception 'Transaction reference belongs to another branch'; end if;
    if v_sale.inventory_processing_status <> 'completed' then
      perform public.process_sale_inventory(v_sale.id);
      select * into v_sale from public.sales where id = v_sale.id;
    end if;
    return v_sale;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;
    v_unit_price := round((v_item ->> 'unit_price')::numeric, 2);
    if v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then
      raise exception 'Sale quantities must be positive whole numbers';
    end if;
    select variant.* into v_variant
    from public.product_variants variant
    join public.products product on product.id = variant.product_id
    join public.branch_product_visibility visibility
      on visibility.product_variant_id = variant.id
     and visibility.branch_id = p_branch_id and visibility.is_visible
    where variant.id = (v_item ->> 'variant_id')::uuid
      and variant.active and variant.is_available and product.is_available
    for update of variant;
    if not found then raise exception 'Product variant is unavailable for this branch'; end if;
    if v_variant.piece_count is null then raise exception 'Product variant has no configured piece count'; end if;
    if v_unit_price <> v_variant.price then raise exception 'Sale price does not match the current menu price'; end if;
    select count(*) into v_existing_item_count
    from jsonb_array_elements(p_items) existing_item
    where existing_item ->> 'variant_id' = v_variant.id::text;
    if v_existing_item_count > 1 then raise exception 'A sale variant may appear only once'; end if;
    v_expected_total := v_expected_total + round(v_quantity * v_variant.price, 2);
  end loop;

  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    select * into v_addon_record from public.menu_addons
    where id = (v_addon ->> 'addon_id')::uuid and active for update;
    if not found then raise exception 'Add-on is unavailable'; end if;
    v_expected_total := v_expected_total + v_addon_record.price;
  end loop;
  if round(p_total_amount, 2) <> round(v_expected_total, 2) then
    raise exception 'Sale total does not match the current menu catalog';
  end if;

  insert into public.sales (
    transaction_reference, branch_id, staff_id, total_amount, payment_method,
    status, inventory_processing_status
  ) values (
    btrim(p_transaction_reference), p_branch_id, v_profile.id, v_expected_total,
    btrim(p_payment_method), 'pending', 'pending'
  ) returning * into v_sale;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select variant.price, variant.product_id into v_unit_price, v_product_id
    from public.product_variants variant
    where variant.id = (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    insert into public.sale_items (sale_id, product_id, product_variant_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_product_id, (v_item ->> 'variant_id')::uuid,
      v_quantity, v_unit_price, round(v_quantity * v_unit_price, 2));
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
