-- Per-item expiry rules (owner decision of 2026-11-25, from the team's catalog
-- sheet, "Thresholds" tab):
--   * each item has its own shelf life (days) and near-expiration window (days);
--   * expiration date used = the printed date when one is entered, otherwise
--     date received + shelf life;
--   * Near Expiration = the lot expires today or within the item's window (the
--     owner's general setting is used when the item has none);
--   * an item without a shelf life is not date-tracked.
--
-- Starting values come from the sheet, which marks them as suggestions; the
-- owner edits them in Configuration. Dashi is left out until it becomes dashi
-- powder. Lots already in stock keep the date they have (or none): the rule
-- applies to stock received from now on.
begin;

alter table public.ingredients
  add column if not exists shelf_life_days integer,
  add column if not exists near_expiration_days integer;

alter table public.ingredients drop constraint if exists ingredients_shelf_life_days_check;
alter table public.ingredients drop constraint if exists ingredients_near_expiration_days_check;
alter table public.ingredients
  add constraint ingredients_shelf_life_days_check check (shelf_life_days is null or shelf_life_days between 1 and 3650),
  add constraint ingredients_near_expiration_days_check check (near_expiration_days is null or near_expiration_days between 0 and 365);

comment on column public.ingredients.shelf_life_days is
  'Days an unopened item keeps. When no printed date is entered, a new lot expires on date received + this. Null = the item never expires and is not date-tracked.';
comment on column public.ingredients.near_expiration_days is
  'A lot is Near Expiration when it expires today or within this many days. Null = the owner''s general setting (owner_inventory_settings.near_expiration_days). 0 = only on the day it is due.';

-- Starting values from the sheet. An item with a shelf life is date-tracked.
update public.ingredients i
set shelf_life_days = v.shelf_life_days,
    near_expiration_days = v.near_expiration_days,
    expiration_tracking = true,
    updated_at = now()
from (values
  ('flour', 180, 14), ('baking-powder', 365, 30), ('bonito-flakes', 180, 14), ('octopus', 180, 14),
  ('crab-sticks', 45, 7), ('eggs', 28, 14), ('cheese-cubes', 90, 7), ('soy-sauce', 730, 30),
  ('sauces', 365, 14), ('japanese-mayonnaise', 180, 14), ('bacon-bits', 14, 3), ('cabbage', 5, 2),
  ('prepared-batter', 1, 0)
) as v(id, shelf_life_days, near_expiration_days)
where i.id = v.id and i.shelf_life_days is null and i.near_expiration_days is null;

-- Salt, packaging and picks never expire.
update public.ingredients set expiration_tracking = false, updated_at = now()
where id in ('salt', 'packaging', 'takoyaki-picks') and expiration_tracking;

-- Every new lot gets its expiry date: the entered one, or date received + shelf life.
-- (Same function as before; only the lot's expiration date changed.)
create or replace function public.record_inventory_transactions(p_branch_id uuid, p_transactions jsonb)
 RETURNS SETOF inventory_movements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_reference text;
  v_batch_reference text;
  v_sale_id uuid;
  v_certificate jsonb;
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
    if v_after < 0 then
      raise exception using
        errcode = '22023',
        message = format(
          'Insufficient stock for %s: required %s %s, available %s %s, shortage %s %s',
          v_ingredient.name, trim_scale(abs(v_movement)), v_ingredient.unit,
          trim_scale(v_inventory.quantity), v_ingredient.unit,
          trim_scale(abs(v_after)), v_ingredient.unit
        );
    end if;

    update public.branch_inventory
    set quantity = v_after, updated_at = now()
    where id = v_inventory.id;

    v_batch := null;
    v_batch_reference := null;
    v_certificate := null;
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
        -- The printed date when one was entered; otherwise date received + the item's shelf life.
        coalesce(
          nullif(v_entry ->> 'expiration_date', '')::date,
          case when v_ingredient.shelf_life_days is not null
            then coalesce((v_entry ->> 'transaction_date')::date, current_date) + v_ingredient.shelf_life_days
          end
        ),
        abs(v_quantity), abs(v_quantity)
      ) returning * into v_batch;
    elsif v_movement < 0 then
      v_certificate := private.fefo_allocate(
        p_branch_id, v_inventory.ingredient_id, abs(v_movement), now(),
        v_type in ('waste'::public.inventory_transaction_type, 'spoilage'::public.inventory_transaction_type,
                   'adjustment'::public.inventory_transaction_type)
      );
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

    if v_certificate is not null then
      insert into public.inventory_fefo_certificates (
        movement_id, branch_id, ingredient_id, requested_quantity, allocated_quantity,
        shortfall_quantity, status, included_expired, allocations, allocated_at
      ) values (
        v_transaction.id, p_branch_id, v_inventory.ingredient_id,
        (v_certificate ->> 'requested_quantity')::numeric,
        (v_certificate ->> 'allocated_quantity')::numeric,
        (v_certificate ->> 'shortfall_quantity')::numeric,
        v_certificate ->> 'status',
        (v_certificate ->> 'included_expired')::boolean,
        v_certificate -> 'allocations',
        (v_certificate ->> 'allocated_at')::timestamptz
      );
    end if;
    return next v_transaction;
  end loop;
end;
$function$;

-- Stock-In applies the same rule before its own checks, so a line without a
-- typed date is accepted for an item that has a shelf life. (Same function as
-- before; only this default was added.)
create or replace function public.record_stock_in(p_branch_id uuid, p_request_id uuid, p_header jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_profile public.profiles%rowtype;
  v_receipt public.stock_in_receipts%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  v_supplier text;
  v_purchased date;
  v_received date;
  v_line jsonb;
  v_index integer;
  v_ingredient public.ingredients%rowtype;
  v_package public.ingredient_package_sizes%rowtype;
  v_quantity numeric;
  v_unit text;
  v_factor numeric;
  v_base numeric(12, 3);
  v_expiration date;
  v_movement public.inventory_movements%rowtype;
  v_seen text[] := array[]::text[];
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid()) and active;
  if not found or v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'Only branch staff can record a Stock-In';
  end if;
  if p_branch_id is null or not public.can_access_branch(p_branch_id) or v_profile.branch_id is distinct from p_branch_id then
    raise exception using errcode = '42501', message = 'This branch is not your assigned branch.';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A request id is required';
  end if;

  -- ST-09 c10: a retried submission returns the receipt it already saved.
  select * into v_receipt from public.stock_in_receipts
  where recorded_by = v_profile.id and request_id = p_request_id;
  if not found then
    if p_header is null or jsonb_typeof(p_header) <> 'object' then
      raise exception using errcode = '22023', message = 'The Stock-In details are missing.';
    end if;
    if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
      raise exception using errcode = '22023', message = 'Add at least one item to the Stock-In.';
    end if;
    if jsonb_array_length(p_lines) > 50 then
      raise exception using errcode = '22023', message = 'A Stock-In can have at most 50 items.';
    end if;

    v_supplier := nullif(btrim(coalesce(p_header ->> 'supplier_reference', '')), '');
    if v_supplier is not null and length(v_supplier) > 200 then
      raise exception using errcode = '22023', message = 'The supplier or reference must be 200 characters or fewer.';
    end if;
    begin
      v_purchased := nullif(p_header ->> 'date_purchased', '')::date;
      v_received := nullif(p_header ->> 'date_received', '')::date;
    exception when others then
      raise exception using errcode = '22023', message = 'Enter valid dates for the Stock-In.';
    end;
    if v_purchased is null then
      raise exception using errcode = '22023', message = 'Select the date purchased.';
    end if;
    if v_received is null then
      raise exception using errcode = '22023', message = 'Select the date received.';
    end if;
    if v_received > v_today then
      raise exception using errcode = '22023', message = 'The date received cannot be in the future.';
    end if;
    if v_purchased > v_received then
      raise exception using errcode = '22023', message = 'The date purchased cannot be later than the date received.';
    end if;

    insert into public.stock_in_receipts (reference, request_id, branch_id, supplier_reference, date_purchased, date_received, recorded_by)
    values (
      format('STOCKIN-%s-%s', to_char(v_today, 'YYYYMMDD'), lpad(nextval('public.stock_in_receipt_reference_seq')::text, 4, '0')),
      p_request_id, p_branch_id, v_supplier, v_purchased, v_received, v_profile.id
    ) returning * into v_receipt;

    for v_line, v_index in
      select entry.value, entry.ordinality::integer
      from jsonb_array_elements(p_lines) with ordinality as entry(value, ordinality)
    loop
      if jsonb_typeof(v_line) <> 'object' or nullif(btrim(coalesce(v_line ->> 'ingredient_id', '')), '') is null then
        raise exception using errcode = '22023', message = format('Item %s: select the ingredient being received.', v_index);
      end if;
      select i.* into v_ingredient from public.ingredients i
      join public.branch_inventory bi on bi.ingredient_id = i.id and bi.branch_id = p_branch_id
      where i.id = v_line ->> 'ingredient_id' and i.active;
      if not found then
        raise exception using errcode = '22023', message = format('Item %s: this ingredient is not available for your branch.', v_index);
      end if;
      if v_ingredient.id = any (v_seen) then
        raise exception using errcode = '22023', message = format('%s is listed more than once. Combine it into one line.', v_ingredient.name);
      end if;
      v_seen := v_seen || v_ingredient.id;

      begin
        v_quantity := (v_line ->> 'quantity')::numeric;
      exception when others then
        v_quantity := null;
      end;
      if v_quantity is null or v_quantity <= 0 then
        raise exception using errcode = '22023', message = format('%s: the quantity must be a number greater than 0.', v_ingredient.name);
      end if;

      -- ST-09 c4: the purchase unit ("pack" = one package) is converted to the base unit.
      v_unit := lower(btrim(coalesce(v_line ->> 'unit', '')));
      if v_unit in ('', 'base', lower(v_ingredient.unit)) then
        v_unit := v_ingredient.unit;
        v_base := round(v_quantity, 3);
      elsif v_unit = 'pack' then
        select * into v_package from public.ingredient_package_sizes where ingredient_id = v_ingredient.id;
        v_factor := case when found then private.unit_conversion_factor(v_package.package_unit, v_ingredient.unit) end;
        if v_factor is null or v_package.package_quantity is null or v_package.package_quantity <= 0 then
          raise exception using errcode = '22023',
            message = format('%s has no purchase-unit conversion. Enter the quantity in %s.', v_ingredient.name, v_ingredient.unit);
        end if;
        v_base := round(v_quantity * v_package.package_quantity * v_factor, 3);
      else
        raise exception using errcode = '22023',
          message = format('%s: choose %s or the purchase unit.', v_ingredient.name, v_ingredient.unit);
      end if;
      if v_base <= 0 then
        raise exception using errcode = '22023', message = format('%s: the quantity is too small to record.', v_ingredient.name);
      end if;

      -- ST-09 c3: expiring items need a date that is not before the date received.
      begin
        v_expiration := nullif(v_line ->> 'expiration_date', '')::date;
      exception when others then
        raise exception using errcode = '22023', message = format('%s: enter a valid expiration date.', v_ingredient.name);
      end;
      -- No printed date entered: the item's shelf life gives the date (date received + shelf life).
      if v_expiration is null and v_ingredient.shelf_life_days is not null then
        v_expiration := v_received + v_ingredient.shelf_life_days;
      end if;
      if v_ingredient.expiration_tracking and v_expiration is null then
        raise exception using errcode = '22023',
          message = format('%s: select the expiration date. It is tracked for expiry.', v_ingredient.name);
      end if;
      if v_expiration is not null and v_expiration < v_received then
        raise exception using errcode = '22023',
          message = format('%s: the expiration date cannot be earlier than the date received.', v_ingredient.name);
      end if;

      select * into v_movement from public.record_inventory_transactions(p_branch_id, jsonb_build_array(jsonb_build_object(
        'ingredient_id', v_ingredient.id,
        'type', 'stock_in',
        'quantity', v_base,
        'transaction_date', v_received::text,
        'reason', 'Stock-In',
        'notes', v_receipt.reference || coalesce(' · ' || v_supplier, ''),
        'batch_reference', null,
        'expiration_date', v_expiration::text
      )));

      insert into public.stock_in_receipt_lines (
        receipt_id, branch_id, line_index, ingredient_id, entered_quantity, entered_unit,
        base_quantity, base_unit, expiration_date, movement_id
      ) values (
        v_receipt.id, p_branch_id, v_index, v_ingredient.id, round(v_quantity, 3),
        case when v_unit = 'pack' then 'pack' else v_ingredient.unit end,
        v_base, v_ingredient.unit, v_expiration, v_movement.id
      );
    end loop;

    insert into public.audit_logs (user_id, branch_id, action, description)
    values (
      v_profile.id, p_branch_id, 'inventory.stock_in',
      format('Stock-In %s: %s item(s), received %s%s', v_receipt.reference, jsonb_array_length(p_lines), v_received,
        coalesce(', ' || v_supplier, ''))
    );
  end if;

  return jsonb_build_object(
    'receipt', to_jsonb(v_receipt),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_index', l.line_index, 'ingredient_id', l.ingredient_id, 'ingredient_name', i.name,
        'entered_quantity', l.entered_quantity, 'entered_unit', l.entered_unit,
        'base_quantity', l.base_quantity, 'base_unit', l.base_unit, 'expiration_date', l.expiration_date,
        'movement_reference', m.reference, 'before_quantity', m.before_quantity, 'after_quantity', m.after_quantity
      ) order by l.line_index)
      from public.stock_in_receipt_lines l
      join public.ingredients i on i.id = l.ingredient_id
      join public.inventory_movements m on m.id = l.movement_id
      where l.receipt_id = v_receipt.id
    ), '[]'::jsonb)
  );
end;
$function$;

notify pgrst, 'reload schema';
commit;
