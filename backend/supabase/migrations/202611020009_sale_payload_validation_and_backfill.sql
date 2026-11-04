-- Close NULL-validation gaps, canonicalize numeric scales, and safely backfill
-- only same-branch historical sale movements. This migration is forward-only.

create or replace function public.backfill_historical_sale_movements()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  with candidates as (
    select movement.id as movement_id, sale.id as sale_id, movement.ingredient_id
    from public.inventory_movements movement
    join public.sales sale
      on movement.notes = 'sale:' || sale.id::text
     and movement.branch_id = sale.branch_id
    where movement.sale_id is null
      and movement.type = 'sales_consumption'::public.inventory_transaction_type
  ), unique_candidates as (
    select candidate.movement_id, candidate.sale_id, candidate.ingredient_id
    from candidates candidate
    where not exists (
      select 1
      from candidates duplicate
      where duplicate.sale_id = candidate.sale_id
        and duplicate.ingredient_id = candidate.ingredient_id
        and duplicate.movement_id <> candidate.movement_id
    )
  )
  update public.inventory_movements movement
  set sale_id = candidate.sale_id
  from unique_candidates candidate
  where movement.id = candidate.movement_id
    and not exists (
      select 1
      from public.inventory_movements existing
      where existing.sale_id = candidate.sale_id
        and existing.ingredient_id = candidate.ingredient_id
        and existing.type = 'sales_consumption'::public.inventory_transaction_type
        and existing.id <> movement.id
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.backfill_historical_sale_movements() from public, anon, authenticated;

select public.backfill_historical_sale_movements();

create or replace function public.compute_sale_payload_hash(
  p_branch_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_addons jsonb default '[]'::jsonb
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_entry jsonb;
  v_quantity numeric;
  v_unit_price numeric;
begin
  if p_branch_id is null or p_payment_method is null or p_total_amount is null then
    raise exception 'Sale payload is missing required transaction fields';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array'
    or coalesce(jsonb_array_length(p_items), 0) = 0 then
    raise exception 'Sale items must be a non-empty array';
  end if;
  if p_addons is null then
    p_addons := '[]'::jsonb;
  elsif jsonb_typeof(p_addons) <> 'array' then
    raise exception 'Sale add-ons must be an array';
  end if;

  for v_entry in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_entry ->> 'quantity')::numeric;
    v_unit_price := (v_entry ->> 'unit_price')::numeric;
    if nullif(btrim(v_entry ->> 'variant_id'), '') is null
      or v_quantity is null or v_unit_price is null then
      raise exception 'Each sale item requires a variant, quantity, and price';
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_addons)
  loop
    v_quantity := coalesce((v_entry ->> 'quantity')::numeric, 1);
    v_unit_price := (v_entry ->> 'unit_price')::numeric;
    if nullif(btrim(v_entry ->> 'addon_id'), '') is null
      or v_quantity is null or v_unit_price is null then
      raise exception 'Each add-on requires an add-on ID, quantity, and price';
    end if;
  end loop;

  return md5(
    jsonb_build_object(
      'branch_id', p_branch_id::text,
      'payment_method', lower(trim(p_payment_method)),
      'total_amount', round(p_total_amount::numeric, 2),
      'items', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'variant_id', item->>'variant_id',
            'quantity', round((item->>'quantity')::numeric, 3),
            'unit_price', round((item->>'unit_price')::numeric, 2)
          ) order by item->>'variant_id',
            round((item->>'quantity')::numeric, 3),
            round((item->>'unit_price')::numeric, 2)
        ), '[]'::jsonb)
        from jsonb_array_elements(p_items) as item
      ),
      'addons', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'addon_id', addon->>'addon_id',
            'quantity', round(coalesce((addon->>'quantity')::numeric, 1), 3),
            'unit_price', round((addon->>'unit_price')::numeric, 2)
          ) order by addon->>'addon_id',
            round(coalesce((addon->>'quantity')::numeric, 1), 3),
            round((addon->>'unit_price')::numeric, 2)
        ), '[]'::jsonb)
        from jsonb_array_elements(p_addons) as addon
      )
    )::text
  );
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
  v_addon_quantity numeric;
  v_unit_price numeric;
  v_addon_unit_price numeric;
  v_expected_total numeric := 0;
  v_existing_item_count integer;
  v_existing_addon_count integer;
  v_payload_hash text;
  v_existing_payload_hash text;
begin
  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if nullif(btrim(p_transaction_reference), '') is null then raise exception 'A transaction reference is required'; end if;
  if nullif(btrim(p_payment_method), '') is null then raise exception 'A payment method is required'; end if;
  if p_total_amount is null or p_total_amount < 0 then raise exception 'A valid sale total is required'; end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array' or coalesce(jsonb_array_length(p_items), 0) = 0 then raise exception 'At least one sale item is required'; end if;
  if p_addons is null then
    p_addons := '[]'::jsonb;
  elsif jsonb_typeof(p_addons) <> 'array' then
    raise exception 'Sale add-ons must be an array';
  end if;

  v_payload_hash := public.compute_sale_payload_hash(p_branch_id, p_payment_method, p_total_amount, p_items, p_addons);
  perform pg_advisory_xact_lock(hashtextextended(btrim(p_transaction_reference), 0));

  select * into v_sale from public.sales
  where transaction_reference = btrim(p_transaction_reference) for update;
  if found then
    if v_sale.branch_id <> p_branch_id then raise exception 'Transaction reference belongs to another branch'; end if;
    select public.compute_sale_payload_hash(
      v_sale.branch_id, v_sale.payment_method, v_sale.total_amount,
      coalesce((select jsonb_agg(jsonb_build_object(
        'variant_id', si.product_variant_id, 'quantity', si.quantity, 'unit_price', si.unit_price
      ) order by si.product_variant_id) from public.sale_items si where si.sale_id = v_sale.id), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object(
        'addon_id', sa.addon_id, 'quantity', sa.quantity, 'unit_price', sa.unit_price
      ) order by sa.addon_id) from public.sale_addons sa where sa.sale_id = v_sale.id), '[]'::jsonb)
    ) into v_existing_payload_hash;
    if v_existing_payload_hash <> v_payload_hash then
      raise exception 'Transaction reference was already used with a different sale payload';
    end if;
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
    if v_quantity is null or v_quantity <= 0 or v_quantity <> trunc(v_quantity) then raise exception 'Sale quantities must be positive whole numbers'; end if;
    select variant.* into v_variant from public.product_variants variant
    join public.products product on product.id = variant.product_id
    join public.branch_product_visibility visibility on visibility.product_variant_id = variant.id
      and visibility.branch_id = p_branch_id and visibility.is_visible
    where variant.id = (v_item ->> 'variant_id')::uuid and variant.active and variant.is_available and product.is_available
    for update of variant;
    if not found then raise exception 'Product variant is unavailable for this branch'; end if;
    if v_variant.piece_count is null then raise exception 'Product variant has no configured piece count'; end if;
    if v_unit_price <> v_variant.price then raise exception 'Sale price does not match the current menu price'; end if;
    select count(*) into v_existing_item_count from jsonb_array_elements(p_items) existing_item
      where existing_item ->> 'variant_id' = v_variant.id::text;
    if v_existing_item_count > 1 then raise exception 'A sale variant may appear only once'; end if;
    v_expected_total := v_expected_total + round(v_quantity * v_variant.price, 2);
  end loop;

  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    v_addon_quantity := coalesce((v_addon ->> 'quantity')::numeric, 1);
    v_addon_unit_price := round((v_addon ->> 'unit_price')::numeric, 2);
    if v_addon_quantity is null or v_addon_quantity <= 0 or v_addon_quantity <> trunc(v_addon_quantity) then
      raise exception 'Add-on quantities must be positive whole numbers';
    end if;
    select * into v_addon_record from public.menu_addons
      where id = (v_addon ->> 'addon_id')::uuid and active for update;
    if not found then raise exception 'Add-on is unavailable'; end if;
    if v_addon_unit_price <> v_addon_record.price then raise exception 'Add-on price does not match the current menu price'; end if;
    select count(*) into v_existing_addon_count from jsonb_array_elements(p_addons) existing_addon
      where existing_addon ->> 'addon_id' = v_addon_record.id::text;
    if v_existing_addon_count > 1 then raise exception 'An add-on may appear only once'; end if;
    v_expected_total := v_expected_total + round(v_addon_quantity * v_addon_record.price, 2);
  end loop;
  if round(p_total_amount, 2) <> round(v_expected_total, 2) then raise exception 'Sale total does not match the current menu catalog'; end if;

  insert into public.sales (transaction_reference, branch_id, staff_id, total_amount, payment_method, status, inventory_processing_status, payload_hash)
  values (btrim(p_transaction_reference), p_branch_id, v_profile.id, v_expected_total, btrim(p_payment_method), 'pending', 'pending', v_payload_hash)
  returning * into v_sale;
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select variant.price, variant.product_id into v_unit_price, v_product_id from public.product_variants variant where variant.id = (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    insert into public.sale_items (sale_id, product_id, product_variant_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_product_id, (v_item ->> 'variant_id')::uuid, v_quantity, v_unit_price, round(v_quantity * v_unit_price, 2));
  end loop;
  for v_addon in select value from jsonb_array_elements(p_addons)
  loop
    select * into v_addon_record from public.menu_addons where id = (v_addon ->> 'addon_id')::uuid;
    v_addon_quantity := coalesce((v_addon ->> 'quantity')::numeric, 1);
    insert into public.sale_addons (sale_id, addon_id, quantity, unit_price, subtotal)
    values (v_sale.id, v_addon_record.id, v_addon_quantity, v_addon_record.price, round(v_addon_quantity * v_addon_record.price, 2));
  end loop;
  perform public.process_sale_inventory(v_sale.id);
  select * into v_sale from public.sales where id = v_sale.id;
  return v_sale;
end;
$$;

revoke all on function public.compute_sale_payload_hash(uuid, text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.compute_sale_payload_hash(uuid, text, numeric, jsonb, jsonb) to authenticated;
revoke all on function public.submit_sale(text, uuid, text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.submit_sale(text, uuid, text, numeric, jsonb, jsonb) to authenticated;
