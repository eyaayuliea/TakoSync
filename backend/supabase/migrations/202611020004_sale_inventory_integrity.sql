alter table public.sales
  add column if not exists payload_hash text;

alter table public.inventory_movements
  add column if not exists sale_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_sale_id_fk'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_sale_id_fk
      FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_movements_sale_type_check'
  ) THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT inventory_movements_sale_type_check
      CHECK (sale_id IS NULL OR type = 'sales_consumption'::public.inventory_transaction_type);
  END IF;
END $$;

create index if not exists inventory_movements_sale_idx
  on public.inventory_movements (sale_id);

create unique index if not exists inventory_movements_sales_consumption_unique_idx
  on public.inventory_movements (sale_id, ingredient_id)
  where sale_id is not null and type = 'sales_consumption'::public.inventory_transaction_type;

create or replace function public.compute_sale_payload_hash(
  p_branch_id uuid,
  p_payment_method text,
  p_total_amount numeric,
  p_items jsonb,
  p_addons jsonb default '[]'::jsonb
)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with normalized_items as (
    select coalesce(
      jsonb_agg(item order by item->>'variant_id', item->>'quantity', item->>'unit_price'),
      '[]'::jsonb
    ) as items
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as item
  ),
  normalized_addons as (
    select coalesce(
      jsonb_agg(addon order by addon->>'addon_id', addon->>'quantity'),
      '[]'::jsonb
    ) as addons
    from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb)) as addon
  )
  select md5(
    jsonb_build_object(
      'branch_id', p_branch_id::text,
      'payment_method', lower(trim(p_payment_method)),
      'total_amount', round(p_total_amount::numeric, 2),
      'items', (select items from normalized_items),
      'addons', (select addons from normalized_addons)
    )::text
  );
$$;

create or replace function public.record_inventory_transactions(
  p_branch_id uuid,
  p_transactions jsonb
)
returns setof public.inventory_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_entry jsonb;
  v_inventory public.branch_inventory%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_batch public.ingredient_batches%rowtype;
  v_transaction public.inventory_movements%rowtype;
  v_type public.inventory_transaction_type;
  v_quantity numeric(12, 3);
  v_movement numeric(12, 3);
  v_after numeric(12, 3);
  v_remaining numeric(12, 3);
  v_from_batch numeric(12, 3);
  v_reference text;
  v_batch_reference text;
  v_sale_id uuid;
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
    v_sale_id := null;

    if v_entry ? 'sale_id' and nullif(v_entry ->> 'sale_id', '') is not null then
      v_sale_id := (v_entry ->> 'sale_id')::uuid;
      if v_type <> 'sales_consumption'::public.inventory_transaction_type then
        raise exception 'Only sales consumption entries may include a sale_id';
      end if;
      if not exists (
        select 1 from public.sales
        where id = v_sale_id and branch_id = p_branch_id
      ) then
        raise exception 'Sale is not attached to this branch';
      end if;
    end if;

    if v_quantity is null or v_quantity = 0 then
      raise exception 'Transaction quantity cannot be zero';
    end if;
    if v_profile.role = 'staff' and v_type = 'adjustment'::public.inventory_transaction_type then
      raise exception 'Only an owner may record an adjustment';
    end if;
    if v_type <> 'adjustment'::public.inventory_transaction_type and v_quantity < 0 then
      raise exception 'Transaction quantity must be positive';
    end if;

    select * into v_inventory from public.branch_inventory
    where branch_id = p_branch_id and ingredient_id = v_entry ->> 'ingredient_id'
    for update;
    if not found then raise exception 'Ingredient is not configured for this branch'; end if;
    select * into v_ingredient from public.ingredients where id = v_inventory.ingredient_id and active;
    if not found then raise exception 'Ingredient is inactive'; end if;

    if v_type = 'stock_in'::public.inventory_transaction_type then
      v_movement := abs(v_quantity);
    elsif v_type = 'adjustment'::public.inventory_transaction_type then
      if v_profile.role <> 'owner' then raise exception 'Only an owner may record an adjustment'; end if;
      v_movement := v_quantity;
    else
      v_movement := -abs(v_quantity);
    end if;

    v_after := v_inventory.quantity + v_movement;
    if v_after < 0 then raise exception 'Transaction exceeds available stock'; end if;

    update public.branch_inventory
    set quantity = v_after, updated_at = now()
    where id = v_inventory.id;

    v_batch := null;
    v_batch_reference := null;
    if v_type = 'stock_in'::public.inventory_transaction_type then
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
    insert into public.inventory_movements (
      reference, branch_id, ingredient_id, actor_id, type, sale_id, quantity, unit, movement,
      before_quantity, after_quantity, transaction_date, reason, notes, batch_id
    ) values (
      v_reference, p_branch_id, v_inventory.ingredient_id, v_profile.id, v_type,
      v_sale_id, abs(v_quantity), v_ingredient.unit, v_movement,
      v_inventory.quantity, v_after,
      coalesce((v_entry ->> 'transaction_date')::timestamptz, now()),
      coalesce(v_entry ->> 'reason', ''), coalesce(v_entry ->> 'notes', ''),
      v_batch.id
    ) returning * into v_transaction;
    return next v_transaction;
  end loop;
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

    if exists (
      select 1
      from public.inventory_movements
      where sale_id = p_sale_id
        and type = 'sales_consumption'::public.inventory_transaction_type
    ) then
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
    end if;

    if exists (
      select 1 from public.sale_inventory_processing
      where sale_id = p_sale_id and status = 'completed'
    ) then
      return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
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

    insert into public.sale_inventory_processing (sale_id, status, attempt_count)
    values (p_sale_id, 'processing', 1)
    on conflict (sale_id) do update
    set status = 'processing',
        attempt_count = public.sale_inventory_processing.attempt_count + 1,
        failure_reason = null,
        updated_at = now();

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
      )
      on conflict (sale_id, ingredient_id, recipe_type, recipe_id)
      do update set
        quantity_consumed = excluded.quantity_consumed,
        unit_of_measure = excluded.unit_of_measure,
        applicable_pieces = excluded.applicable_pieces,
        recipe_version = excluded.recipe_version,
        recipe_quantity_required = excluded.recipe_quantity_required,
        estimated_yield_pieces = excluded.estimated_yield_pieces,
        created_at = public.sale_consumption_snapshots.created_at;
    end loop;

    if exists (
      select 1
      from public.sale_items si
      join public.recipes recipe on recipe.product_id = si.product_id
       and recipe.automatic_consumption_enabled
      left join public.ingredients ingredient on ingredient.id = recipe.ingredient_id
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
      join public.recipes recipe on recipe.product_id = si.product_id
       and recipe.automatic_consumption_enabled
      left join public.ingredients ingredient on ingredient.id = recipe.ingredient_id
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
      group by recipe.ingredient_id, ingredient.unit, recipe.id, recipe.quantity_required
    loop
      if v_line.quantity_consumed <= 0 then continue; end if;
      insert into public.sale_consumption_snapshots (
        sale_id, ingredient_id, quantity_consumed, unit_of_measure,
        applicable_pieces, recipe_type, recipe_id, recipe_quantity_required
      ) values (
        p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
        v_line.unit_of_measure, v_line.applicable_pieces,
        'product', v_line.recipe_id, v_line.recipe_quantity_required
      )
      on conflict (sale_id, ingredient_id, recipe_type, recipe_id)
      do update set
        quantity_consumed = excluded.quantity_consumed,
        unit_of_measure = excluded.unit_of_measure,
        applicable_pieces = excluded.applicable_pieces,
        recipe_quantity_required = excluded.recipe_quantity_required,
        created_at = public.sale_consumption_snapshots.created_at;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', movement.ingredient_id,
      'type', 'sales_consumption',
      'quantity', movement.quantity_consumed,
      'sale_id', p_sale_id,
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
    set status = 'completed',
        inventory_processing_status = 'failed',
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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'At least one sale item is required'; end if;
  if jsonb_typeof(p_addons) <> 'array' then raise exception 'Sale add-ons must be an array'; end if;

  v_payload_hash := public.compute_sale_payload_hash(
    p_branch_id,
    p_payment_method,
    p_total_amount,
    p_items,
    p_addons
  );

  perform pg_advisory_xact_lock(hashtextextended(btrim(p_transaction_reference), 0));

  select * into v_sale from public.sales
  where transaction_reference = btrim(p_transaction_reference)
  for update;
  if found then
    if v_sale.branch_id <> p_branch_id then
      raise exception 'Transaction reference belongs to another branch';
    end if;

    if v_sale.payload_hash is null then
      select compute_sale_payload_hash(
        v_sale.branch_id,
        v_sale.payment_method,
        v_sale.total_amount,
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'variant_id', si.product_variant_id,
            'quantity', si.quantity,
            'unit_price', si.unit_price
          ) order by si.product_variant_id)
          from public.sale_items si
          where si.sale_id = v_sale.id
        ), '[]'::jsonb),
        coalesce((
          select jsonb_agg(jsonb_build_object(
            'addon_id', sa.addon_id,
            'quantity', sa.quantity
          ) order by sa.addon_id)
          from public.sale_addons sa
          where sa.sale_id = v_sale.id
        ), '[]'::jsonb)
      ) into v_existing_payload_hash;
    else
      v_existing_payload_hash := v_sale.payload_hash;
    end if;

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
    status, inventory_processing_status, payload_hash
  ) values (
    btrim(p_transaction_reference), p_branch_id, v_profile.id, v_expected_total,
    btrim(p_payment_method), 'pending', 'pending', v_payload_hash
  ) returning * into v_sale;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select variant.price, variant.product_id into v_unit_price, v_product_id
    from public.product_variants variant
    where variant.id = (v_item ->> 'variant_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::numeric;
    insert into public.sale_items (sale_id, product_id, product_variant_id, quantity, unit_price, subtotal)
    values (
      v_sale.id,
      v_product_id,
      (v_item ->> 'variant_id')::uuid,
      v_quantity,
      v_unit_price,
      round(v_quantity * v_unit_price, 2)
    );
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
