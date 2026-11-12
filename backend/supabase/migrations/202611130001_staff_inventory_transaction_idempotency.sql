alter table public.inventory_movements
  add column if not exists request_id uuid,
  add column if not exists request_line_index integer,
  add column if not exists request_payload_hash text;

alter table public.inventory_movements
  add constraint inventory_movements_request_metadata_check
  check (
    (request_id is null and request_line_index is null and request_payload_hash is null)
    or (
      request_id is not null
      and request_line_index is not null
      and request_line_index > 0
      and request_payload_hash is not null
      and request_payload_hash ~ '^[0-9a-f]{64}$'
    )
  );

create unique index inventory_movements_request_line_idx
  on public.inventory_movements (branch_id, actor_id, request_id, request_line_index)
  where request_id is not null;

create or replace function public.record_inventory_transactions_idempotent(
  p_branch_id uuid,
  p_request_id uuid,
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
  v_line_index integer;
  v_quantity numeric;
  v_request_payload jsonb;
  v_payload_hash text;
  v_existing_count integer;
  v_matching_count integer;
  v_movement_ids uuid[] := array[]::uuid[];
  v_movement public.inventory_movements%rowtype;
  v_updated_count integer;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found or v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'An active Staff profile is required';
  end if;
  if not public.can_access_branch(p_branch_id)
    or v_profile.branch_id is distinct from p_branch_id then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'A request UUID is required';
  end if;
  if p_transactions is null then
    raise exception using errcode = '22023', message = 'A valid non-empty transaction list is required';
  end if;
  if jsonb_typeof(p_transactions) <> 'array' then
    raise exception using errcode = '22023', message = 'A valid non-empty transaction list is required';
  end if;
  if jsonb_array_length(p_transactions) = 0
    or jsonb_array_length(p_transactions) > 32767 then
    raise exception using errcode = '22023', message = 'A valid non-empty transaction list is required';
  end if;

  for v_entry, v_line_index in
    select entry.value, entry.ordinality::integer
    from jsonb_array_elements(p_transactions) with ordinality as entry(value, ordinality)
  loop
    if jsonb_typeof(v_entry) <> 'object'
      or jsonb_object_length(v_entry) <> 9
      or not (v_entry ?& array[
        'ingredient_id', 'type', 'quantity', 'unit', 'transaction_date',
        'reason', 'notes', 'batch_reference', 'expiration_date'
      ]) then
      raise exception using errcode = '22023', message = 'An inventory transaction has missing or unsupported fields';
    end if;
    if jsonb_typeof(v_entry -> 'ingredient_id') <> 'string'
      or nullif(btrim(v_entry ->> 'ingredient_id'), '') is null
      or jsonb_typeof(v_entry -> 'type') <> 'string'
      or (v_entry ->> 'type') not in ('stock_in', 'stock_out', 'usage', 'waste', 'spoilage')
      or jsonb_typeof(v_entry -> 'quantity') <> 'number'
      or jsonb_typeof(v_entry -> 'unit') <> 'string'
      or nullif(btrim(v_entry ->> 'unit'), '') is null
      or jsonb_typeof(v_entry -> 'transaction_date') <> 'string'
      or nullif(btrim(v_entry ->> 'transaction_date'), '') is null
      or jsonb_typeof(v_entry -> 'reason') <> 'string'
      or jsonb_typeof(v_entry -> 'notes') <> 'string'
      or jsonb_typeof(v_entry -> 'batch_reference') not in ('string', 'null')
      or jsonb_typeof(v_entry -> 'expiration_date') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'An inventory transaction contains invalid or incomplete values';
    end if;

    if nullif(regexp_replace(v_entry ->> 'reason', '[[:space:]]', '', 'g'), '') is null then
      raise exception using errcode = '22023', message = 'An inventory transaction reason is required';
    end if;
    if (v_entry ->> 'type') in ('waste', 'spoilage')
      and (v_entry ->> 'reason') not in ('Waste', 'Spillage', 'Spoilage', 'Other') then
      raise exception using
        errcode = '22023',
        message = 'Waste or spoilage reason must be Waste, Spillage, Spoilage, or Other';
    end if;

    v_quantity := (v_entry ->> 'quantity')::numeric;
    if v_quantity <= 0 then
      raise exception using errcode = '22023', message = 'Transaction quantity must be greater than zero';
    end if;
    perform (v_entry ->> 'transaction_date')::timestamptz;
    if jsonb_typeof(v_entry -> 'expiration_date') = 'string' then
      perform (v_entry ->> 'expiration_date')::date;
    end if;
    if (v_entry ->> 'type') <> 'stock_in'
      and (nullif(v_entry ->> 'batch_reference', '') is not null
        or jsonb_typeof(v_entry -> 'expiration_date') = 'string') then
      raise exception using errcode = '22023', message = 'Batch and expiration details are only valid for Stock-In';
    end if;

  end loop;

  v_request_payload := jsonb_build_object(
    'actor_id', v_profile.id,
    'branch_id', p_branch_id,
    'transactions', p_transactions
  );
  v_payload_hash := encode(
    extensions.digest(convert_to(v_request_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(hashtextextended(
    v_profile.id::text || ':' || p_branch_id::text || ':' || p_request_id::text,
    0
  ));

  select count(*), count(*) filter (where movement.request_payload_hash = v_payload_hash)
  into v_existing_count, v_matching_count
  from public.inventory_movements movement
  where movement.branch_id = p_branch_id
    and movement.actor_id = v_profile.id
    and movement.request_id = p_request_id;

  if v_existing_count > 0 then
    if v_matching_count <> v_existing_count then
      raise exception using
        errcode = '22023',
        message = 'This request UUID was already used with a different transaction payload';
    end if;
    if v_existing_count <> jsonb_array_length(p_transactions) then
      raise exception using
        errcode = '55000',
        message = 'The saved inventory request has incomplete movement records';
    end if;
    return query
      select movement.*
      from public.inventory_movements movement
      where movement.branch_id = p_branch_id
        and movement.actor_id = v_profile.id
        and movement.request_id = p_request_id
      order by movement.request_line_index;
    return;
  end if;

  for v_entry in select value from jsonb_array_elements(p_transactions)
  loop
    if not exists (
      select 1
      from public.branch_inventory inventory
      join public.ingredients ingredient
        on ingredient.id = inventory.ingredient_id and ingredient.active
      where inventory.branch_id = p_branch_id
        and inventory.ingredient_id = v_entry ->> 'ingredient_id'
        and ingredient.unit = v_entry ->> 'unit'
    ) then
      raise exception using errcode = '22023', message = 'Inventory item or unit is not configured for this branch';
    end if;
  end loop;

  for v_movement in
    select *
    from public.record_inventory_transactions(p_branch_id, p_transactions)
  loop
    v_movement_ids := array_append(v_movement_ids, v_movement.id);
  end loop;
  if cardinality(v_movement_ids) <> jsonb_array_length(p_transactions) then
    raise exception using errcode = '55000', message = 'The inventory transaction result was incomplete';
  end if;

  update public.inventory_movements movement
  set request_id = p_request_id,
      request_line_index = request_line.ordinality::integer,
      request_payload_hash = v_payload_hash
  from unnest(v_movement_ids) with ordinality as request_line(id, ordinality)
  where movement.id = request_line.id
    and movement.branch_id = p_branch_id
    and movement.actor_id = v_profile.id;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> cardinality(v_movement_ids) then
    raise exception using errcode = '55000', message = 'The inventory request could not be recorded completely';
  end if;

  return query
    select movement.*
    from public.inventory_movements movement
    where movement.branch_id = p_branch_id
      and movement.actor_id = v_profile.id
      and movement.request_id = p_request_id
    order by movement.request_line_index;
end;
$$;

revoke all on function public.record_inventory_transactions_idempotent(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.record_inventory_transactions_idempotent(uuid, uuid, jsonb)
  to authenticated;

revoke all on function public.record_inventory_transactions(uuid, jsonb)
  from public, anon, authenticated;
