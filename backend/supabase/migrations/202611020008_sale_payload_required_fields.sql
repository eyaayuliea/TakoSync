-- Reject structurally incomplete sale payloads before canonical hashing.
-- This closes PostgreSQL NULL-comparison gaps for omitted prices while keeping
-- the canonical representation introduced by the previous migration.
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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale items must be a non-empty array';
  end if;
  if jsonb_typeof(p_addons) <> 'array' then
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
            'quantity', (item->>'quantity')::numeric,
            'unit_price', round((item->>'unit_price')::numeric, 2)
          ) order by item->>'variant_id', (item->>'quantity')::numeric,
            round((item->>'unit_price')::numeric, 2)
        ), '[]'::jsonb)
        from jsonb_array_elements(p_items) as item
      ),
      'addons', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'addon_id', addon->>'addon_id',
            'quantity', coalesce((addon->>'quantity')::numeric, 1),
            'unit_price', round((addon->>'unit_price')::numeric, 2)
          ) order by addon->>'addon_id', (addon->>'quantity')::numeric,
            round((addon->>'unit_price')::numeric, 2)
        ), '[]'::jsonb)
        from jsonb_array_elements(p_addons) as addon
      )
    )::text
  );
end;
$$;

revoke all on function public.compute_sale_payload_hash(uuid, text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.compute_sale_payload_hash(uuid, text, numeric, jsonb, jsonb) to authenticated;
