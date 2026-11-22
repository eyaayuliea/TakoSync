-- A1: branch-scoped FEFO lot allocation with a min-heap priority queue
-- (Algorithm Architecture Specification §2.2–2.4 and §3.2–3.4; US-FEFO-01).
--
-- Before this, every stock decrease took from lots in
-- `order by expiration_date nulls last, received_date, created_at`. It also used
-- expired lots and recorded nothing about which lots were used.
-- Now every decrease goes through private.fefo_allocate. That function:
--   - uses only lots of the same branch and item that are `active`, have quantity
--     left and have not expired. A lot can be used until the end of its expiration
--     date in Asia/Manila. A lot with no expiration date never expires and is used
--     last;
--   - picks lots from a binary min-heap keyed by (expiration_date, received_date,
--     created_at, id). Building the heap is O(N) and each pick is O(log N);
--   - never takes a lot below zero, and reports a shortfall instead of failing;
--   - returns a certificate. It is stored once per movement in
--     inventory_fefo_certificates, in the same transaction as the stock change.
--     A retried request returns the stored movement (existing idempotency keys),
--     so it also returns the same certificate.
-- Waste, spoilage and owner adjustments can also take from expired lots. Spoiled
-- stock is normally the expired lot, and the spec says expired lots must be
-- recorded as waste.
--
-- The branch_inventory quantity stays the authoritative balance and is still
-- refused below zero. Lots are the expiry detail under it: adjustments and old
-- data can leave less in lots than on the balance. Any part a sale takes that no
-- usable lot covers shows as the certificate's shortfall.

-- Lot status: only active lots are allocated --------------------------------------
alter table public.ingredient_batches
  add column if not exists status text not null default 'active';
alter table public.ingredient_batches
  drop constraint if exists ingredient_batches_status_check;
alter table public.ingredient_batches
  add constraint ingredient_batches_status_check
  check (status in ('active', 'quarantined', 'damaged', 'reserved'));
-- The owner can hold a lot back (existing owner-only update policy).
grant update (status) on public.ingredient_batches to authenticated;

-- Owner-configurable lot expiry windows (§2.4): yellow within 48 h, red within 24 h.
alter table public.owner_inventory_settings
  add column if not exists lot_warning_hours integer not null default 48,
  add column if not exists lot_critical_hours integer not null default 24;
alter table public.owner_inventory_settings
  drop constraint if exists owner_inventory_settings_lot_hours_check;
alter table public.owner_inventory_settings
  add constraint owner_inventory_settings_lot_hours_check
  check (lot_warning_hours between 1 and 720 and lot_critical_hours between 1 and lot_warning_hours);

-- Allocation certificates (AC-FEFO-01-10) -----------------------------------------
create table if not exists public.inventory_fefo_certificates (
  movement_id uuid primary key references public.inventory_movements(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  ingredient_id text not null references public.ingredients(id),
  requested_quantity numeric(12, 3) not null check (requested_quantity > 0),
  allocated_quantity numeric(12, 3) not null check (allocated_quantity >= 0),
  shortfall_quantity numeric(12, 3) not null check (shortfall_quantity >= 0),
  status text not null check (status in ('COMPLETED', 'PARTIAL', 'INSUFFICIENT_STOCK')),
  included_expired boolean not null default false,
  -- [{batch_id, batch_reference, expiration_date, quantity, remaining_after}] in allocation order
  allocations jsonb not null default '[]'::jsonb check (jsonb_typeof(allocations) = 'array'),
  allocated_at timestamptz not null default now(),
  algorithm_version text not null default 'fefo-minheap-v1',
  check (allocated_quantity + shortfall_quantity = requested_quantity)
);
create index if not exists inventory_fefo_certificates_branch_idx
  on public.inventory_fefo_certificates (branch_id, allocated_at desc);

alter table public.inventory_fefo_certificates enable row level security;
drop policy if exists inventory_fefo_certificates_read_branch on public.inventory_fefo_certificates;
create policy inventory_fefo_certificates_read_branch on public.inventory_fefo_certificates
for select to authenticated using (public.can_access_branch(branch_id));
revoke all on public.inventory_fefo_certificates from anon, authenticated;
grant select on public.inventory_fefo_certificates to authenticated;

-- Certificates are immutable once written.
create or replace function private.reject_fefo_certificate_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'FEFO allocation certificates cannot be changed or deleted';
end;
$$;
drop trigger if exists inventory_fefo_certificates_immutable on public.inventory_fefo_certificates;
create trigger inventory_fefo_certificates_immutable
before update or delete on public.inventory_fefo_certificates
for each row when (pg_trigger_depth() < 1)
execute function private.reject_fefo_certificate_change();

-- The heap entry. Comparing two entries compares the fields in order, which is the
-- FEFO key. `infinity` stands for "no expiration date" so those lots sort last.
drop type if exists private.fefo_heap_entry cascade;
create type private.fefo_heap_entry as (
  expiration_key date,
  received_date date,
  created_at timestamptz,
  id uuid,
  available numeric(12, 3)
);

-- Instant a lot stops being usable: the end of its expiration date in Manila.
create or replace function private.lot_expires_at(p_expiration_date date)
returns timestamptz
language sql
immutable
as $$
  select case when p_expiration_date is null then null
    else ((p_expiration_date + 1)::timestamp at time zone 'Asia/Manila') end;
$$;

-- FEFO_ALLOCATE (§3.3). Locks, allocates and decrements lots. The caller must
-- already hold the branch_inventory row lock for the item, so allocations for one
-- item are serialized.
create or replace function private.fefo_allocate(
  p_branch_id uuid,
  p_ingredient_id text,
  p_quantity numeric,
  p_now timestamptz default now(),
  p_include_expired boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_heap private.fefo_heap_entry[] := '{}';
  v_top private.fefo_heap_entry;
  v_tmp private.fefo_heap_entry;
  v_size integer;
  v_index integer;
  v_child integer;
  v_start integer;
  v_remaining numeric(12, 3);
  v_take numeric(12, 3);
  v_allocated numeric(12, 3);
  v_allocations jsonb := '[]'::jsonb;
  v_lot public.ingredient_batches%rowtype;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception using errcode = '22023', message = 'The quantity to allocate must be greater than zero.';
  end if;

  -- Eligible lots, locked in id order so concurrent callers never deadlock.
  select coalesce(array_agg(row(
      coalesce(b.expiration_date, 'infinity'::date), b.received_date, b.created_at, b.id, b.quantity_remaining
    )::private.fefo_heap_entry order by b.id), '{}')
  into v_heap
  from (
    select * from public.ingredient_batches
    where branch_id = p_branch_id and ingredient_id = p_ingredient_id
      and status = 'active' and quantity_remaining > 0
      and (p_include_expired or expiration_date is null or p_now < private.lot_expires_at(expiration_date))
    order by id
    for update
  ) b;

  -- Build the min-heap bottom-up: O(N).
  v_size := coalesce(array_length(v_heap, 1), 0);
  for v_start in reverse (v_size / 2)..1 loop
    v_index := v_start;
    loop
      v_child := v_index * 2;
      exit when v_child > v_size;
      if v_child < v_size and v_heap[v_child + 1] < v_heap[v_child] then v_child := v_child + 1; end if;
      exit when not (v_heap[v_child] < v_heap[v_index]);
      v_tmp := v_heap[v_index]; v_heap[v_index] := v_heap[v_child]; v_heap[v_child] := v_tmp;
      v_index := v_child;
    end loop;
  end loop;

  v_remaining := p_quantity;
  while v_remaining > 0 and v_size > 0 loop
    -- HEAP_POP_MIN: O(log N).
    v_top := v_heap[1];
    v_heap[1] := v_heap[v_size];
    v_size := v_size - 1;
    v_index := 1;
    loop
      v_child := v_index * 2;
      exit when v_child > v_size;
      if v_child < v_size and v_heap[v_child + 1] < v_heap[v_child] then v_child := v_child + 1; end if;
      exit when not (v_heap[v_child] < v_heap[v_index]);
      v_tmp := v_heap[v_index]; v_heap[v_index] := v_heap[v_child]; v_heap[v_child] := v_tmp;
      v_index := v_child;
    end loop;

    v_take := least(v_remaining, v_top.available);
    if v_take > 0 then
      update public.ingredient_batches
      set quantity_remaining = quantity_remaining - v_take
      where id = v_top.id
      returning * into v_lot;
      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'batch_id', v_lot.id,
        'batch_reference', v_lot.batch_reference,
        'expiration_date', v_lot.expiration_date,
        'quantity', v_take,
        'remaining_after', v_lot.quantity_remaining
      ));
      v_remaining := v_remaining - v_take;
    end if;
    -- The popped lot is now empty or it covered the rest, so nothing is pushed back.
  end loop;

  v_allocated := p_quantity - v_remaining;
  return jsonb_build_object(
    'branch_id', p_branch_id,
    'ingredient_id', p_ingredient_id,
    'requested_quantity', p_quantity,
    'allocated_quantity', v_allocated,
    'shortfall_quantity', v_remaining,
    'status', case when v_remaining = 0 then 'COMPLETED' when v_allocated > 0 then 'PARTIAL' else 'INSUFFICIENT_STOCK' end,
    'included_expired', p_include_expired,
    'allocations', v_allocations,
    'allocated_at', p_now
  );
end;
$$;

revoke all on function private.fefo_allocate(uuid, text, numeric, timestamptz, boolean) from public, anon, authenticated;
revoke all on function private.lot_expires_at(date) from public, anon, authenticated;
revoke all on function private.reject_fefo_certificate_change() from public, anon, authenticated;

-- CLASSIFY_EXPIRY (§2.4) for dashboards and alerts.
create or replace function public.classify_lot_expiry(
  p_expiration_date date,
  p_now timestamptz default now(),
  p_warning_hours integer default 48,
  p_critical_hours integer default 24
)
returns text
language sql
stable
as $$
  select case
    when p_expiration_date is null then 'NO_EXPIRY'
    when private.lot_expires_at(p_expiration_date) <= p_now then 'EXPIRED'
    when private.lot_expires_at(p_expiration_date) - p_now <= make_interval(hours => least(p_critical_hours, p_warning_hours)) then 'RED'
    when private.lot_expires_at(p_expiration_date) - p_now <= make_interval(hours => p_warning_hours) then 'YELLOW'
    else 'GREEN'
  end;
$$;
grant execute on function public.classify_lot_expiry(date, timestamptz, integer, integer) to authenticated;

-- record_inventory_transactions: every decrease now goes through FEFO ---------------
CREATE OR REPLACE FUNCTION public.record_inventory_transactions(p_branch_id uuid, p_transactions jsonb)
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
        nullif(v_entry ->> 'expiration_date', '')::date,
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

revoke all on function public.record_inventory_transactions(uuid, jsonb) from public, anon, authenticated;
