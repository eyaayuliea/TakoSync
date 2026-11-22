-- ST-09 Stock-In as a header with lines (Requirements Engineering v6 ST-09 c1;
-- User Story ST-09 c1, c4).
--
--   * stock_in_receipts: the header: optional supplier or reference, date
--     purchased, date received, the employee account and server time.
--   * stock_in_receipt_lines: one line per ingredient: the quantity and unit as
--     entered, the quantity in the item's base unit, the expiration date, and
--     the ledger movement it created.
--   * record_stock_in(branch, request id, header, lines) saves everything in one
--     transaction. Each line is one Stock-In ledger movement and one lot (through
--     record_inventory_transactions). A line entered in the purchase unit (one
--     package, from ingredient_package_sizes) is converted to the base unit.
--     A retry with the same request id returns the receipt already saved.
begin;

create sequence if not exists public.stock_in_receipt_reference_seq;

create table if not exists public.stock_in_receipts (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  request_id uuid not null,
  branch_id uuid not null references public.branches(id),
  supplier_reference text,
  date_purchased date not null,
  date_received date not null,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  constraint stock_in_receipts_dates_check check (date_purchased <= date_received),
  constraint stock_in_receipts_supplier_check check (supplier_reference is null or length(supplier_reference) between 1 and 200),
  unique (recorded_by, request_id)
);

create table if not exists public.stock_in_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.stock_in_receipts(id),
  branch_id uuid not null references public.branches(id),
  line_index integer not null,
  ingredient_id text not null references public.ingredients(id),
  entered_quantity numeric(12, 3) not null,
  entered_unit text not null,
  base_quantity numeric(12, 3) not null,
  base_unit text not null,
  expiration_date date,
  movement_id uuid not null references public.inventory_movements(id),
  constraint stock_in_receipt_lines_quantity_check check (entered_quantity > 0 and base_quantity > 0),
  unique (receipt_id, line_index),
  unique (movement_id)
);

comment on table public.stock_in_receipts is
  'ST-09: Stock-In header (supplier or reference, date purchased, date received). Lines are in stock_in_receipt_lines.';
comment on table public.stock_in_receipt_lines is
  'ST-09: one received item per line, with the quantity and unit as entered, the base-unit quantity, and the ledger movement and lot it created.';

create index if not exists stock_in_receipts_branch_date_idx on public.stock_in_receipts (branch_id, date_received desc);
create index if not exists stock_in_receipt_lines_receipt_idx on public.stock_in_receipt_lines (receipt_id);

alter table public.stock_in_receipts enable row level security;
alter table public.stock_in_receipt_lines enable row level security;

drop policy if exists stock_in_receipts_read_accessible_branches on public.stock_in_receipts;
create policy stock_in_receipts_read_accessible_branches on public.stock_in_receipts
for select to authenticated using (public.can_access_branch(branch_id));
drop policy if exists stock_in_receipt_lines_read_accessible_branches on public.stock_in_receipt_lines;
create policy stock_in_receipt_lines_read_accessible_branches on public.stock_in_receipt_lines
for select to authenticated using (public.can_access_branch(branch_id));

revoke all on table public.stock_in_receipts, public.stock_in_receipt_lines from public, anon, authenticated;
grant select on table public.stock_in_receipts, public.stock_in_receipt_lines to authenticated;

-- Factor that turns a quantity in p_from into p_to, or null when they cannot be converted.
create or replace function private.unit_conversion_factor(p_from text, p_to text)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when lower(btrim(p_from)) = lower(btrim(p_to)) then 1
    when lower(btrim(p_from)) = 'ml' and lower(btrim(p_to)) = 'l' then 0.001
    when lower(btrim(p_from)) = 'l' and lower(btrim(p_to)) = 'ml' then 1000
    when lower(btrim(p_from)) = 'g' and lower(btrim(p_to)) = 'kg' then 0.001
    when lower(btrim(p_from)) = 'kg' and lower(btrim(p_to)) = 'g' then 1000
    else null
  end;
$$;
revoke all on function private.unit_conversion_factor(text, text) from public, anon, authenticated;

create or replace function public.record_stock_in(
  p_branch_id uuid,
  p_request_id uuid,
  p_header jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.record_stock_in(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_stock_in(uuid, uuid, jsonb, jsonb) to authenticated;
alter function public.record_stock_in(uuid, uuid, jsonb, jsonb) owner to postgres;

-- S2 API gate.
select private.declare_endpoint('rpc/record_stock_in', array['STOCKIN_RECORD'], '{}', 'Staff record a Stock-In header with lines (ST-09).');
select private.declare_endpoint('table/stock_in_receipts', array['HISTORY_VIEW_BRANCH'], '{}', 'Stock-In headers.');
select private.declare_endpoint('table/stock_in_receipt_lines', array['HISTORY_VIEW_BRANCH'], '{}', 'Stock-In lines.');

notify pgrst, 'reload schema';
commit;
