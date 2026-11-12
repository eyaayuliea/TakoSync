alter table public.daily_stock_checks
  add column if not exists request_id uuid,
  add column if not exists request_payload_hash text;

create unique index if not exists daily_stock_checks_request_id_uidx
  on public.daily_stock_checks (request_id)
  where request_id is not null;

drop function if exists public.submit_daily_stock_check(uuid, date, text, jsonb);

create or replace function public.submit_daily_stock_check(
  p_branch_id uuid,
  p_request_id uuid,
  p_check_date date,
  p_remarks text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_check public.daily_stock_checks%rowtype;
  v_line jsonb;
  v_inventory public.branch_inventory%rowtype;
  v_ingredient public.ingredients%rowtype;
  v_expected numeric(12, 3);
  v_physical numeric(12, 3);
  v_revision bigint;
  v_difference numeric(12, 3);
  v_discrepancies integer := 0;
  v_count integer := 0;
  v_reference text;
  v_payload_hash text;
  v_line_results jsonb := '[]'::jsonb;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then
    raise exception using errcode = '42501', message = 'An active user profile is required';
  end if;
  if not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if p_request_id is null then
    raise exception 'A daily count request ID is required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  v_payload_hash := encode(
    extensions.digest(
      convert_to(jsonb_build_object(
        'branch_id', p_branch_id,
        'check_date', coalesce(p_check_date, current_date),
        'remarks', coalesce(p_remarks, ''),
        'lines', p_lines
      )::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select * into v_check
  from public.daily_stock_checks
  where request_id = p_request_id;
  if found then
    if v_check.branch_id <> p_branch_id
      or v_check.submitted_by <> v_profile.id
      or v_check.request_payload_hash <> v_payload_hash then
      raise exception using
        errcode = '22023',
        message = 'The daily count request ID is already associated with a different submission';
    end if;
    select count(*)::integer,
      count(*) filter (where difference <> 0)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'ingredient_id', ingredient_id,
        'recorded_quantity', recorded_quantity,
        'physical_quantity', physical_quantity,
        'difference', difference,
        'unit', unit,
        'inventory_revision', inventory_revision
      ) order by created_at, id), '[]'::jsonb)
    into v_count, v_discrepancies, v_line_results
    from public.daily_stock_count_lines
    where daily_stock_check_id = v_check.id;
    return jsonb_build_object(
      'id', v_check.id,
      'reference', v_check.reference,
      'status', v_check.status,
      'counted', v_count,
      'discrepancies', v_discrepancies,
      'check_date', v_check.check_date,
      'lines', v_line_results
    );
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one count line is required';
  end if;

  v_reference := 'IC-' || to_char(coalesce(p_check_date, current_date), 'YYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into public.daily_stock_checks (
    reference, branch_id, submitted_by, check_date, remarks, status, request_id, request_payload_hash
  ) values (
    v_reference, p_branch_id, v_profile.id, coalesce(p_check_date, current_date),
    coalesce(p_remarks, ''), 'submitted', p_request_id, v_payload_hash
  ) returning * into v_check;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or v_line ->> 'ingredient_id' is null
      or v_line ->> 'recorded_quantity' is null
      or v_line ->> 'physical_quantity' is null
      or v_line ->> 'inventory_revision' is null then
      raise exception 'Each count line requires ingredient, pinned quantity, physical quantity, and inventory revision';
    end if;
    v_expected := (v_line ->> 'recorded_quantity')::numeric;
    v_physical := (v_line ->> 'physical_quantity')::numeric;
    v_revision := (v_line ->> 'inventory_revision')::bigint;
    if v_expected < 0 or v_physical < 0 or v_revision < 0 then
      raise exception 'Count quantities and inventory revisions must be zero or greater';
    end if;

    select * into v_inventory
    from public.branch_inventory
    where branch_id = p_branch_id and ingredient_id = v_line ->> 'ingredient_id'
    for update;
    if not found then
      raise exception 'Ingredient is not configured for this branch';
    end if;
    if v_inventory.quantity <> v_expected or v_inventory.inventory_revision <> v_revision then
      raise exception 'Inventory changed after this count began; restart the count before submitting';
    end if;

    select * into v_ingredient
    from public.ingredients
    where id = v_inventory.ingredient_id and active;
    if not found then
      raise exception 'Ingredient is not active';
    end if;
    if round(v_expected, v_ingredient.quantity_precision) <> v_expected
      or round(v_physical, v_ingredient.quantity_precision) <> v_physical then
      raise exception 'Count quantities do not match the ingredient precision';
    end if;
    v_difference := round(v_physical - v_expected, v_ingredient.quantity_precision);
    if v_difference <> 0 then v_discrepancies := v_discrepancies + 1; end if;

    insert into public.daily_stock_count_lines (
      daily_stock_check_id, ingredient_id, recorded_quantity, physical_quantity, difference, unit,
      inventory_revision
    ) values (
      v_check.id, v_inventory.ingredient_id, v_expected, v_physical, v_difference,
      v_ingredient.unit, v_revision
    );
    v_line_results := v_line_results || jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_inventory.ingredient_id,
      'recorded_quantity', v_expected,
      'physical_quantity', v_physical,
      'difference', v_difference,
      'unit', v_ingredient.unit,
      'inventory_revision', v_revision
    ));
    v_count := v_count + 1;
  end loop;

  if v_discrepancies > 0 then
    update public.daily_stock_checks
    set status = 'pending_owner_review'
    where id = v_check.id
    returning * into v_check;
  end if;
  return jsonb_build_object(
    'id', v_check.id,
    'reference', v_check.reference,
    'status', v_check.status,
    'counted', v_count,
    'discrepancies', v_discrepancies,
    'check_date', v_check.check_date,
    'lines', v_line_results
  );
end;
$$;

revoke all on function public.submit_daily_stock_check(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.submit_daily_stock_check(uuid, uuid, date, text, jsonb) to authenticated;
