-- Serialize retries and concurrent submissions for the same client reference
-- before the existence check and insert race.
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

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_transaction_reference), 0));

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
