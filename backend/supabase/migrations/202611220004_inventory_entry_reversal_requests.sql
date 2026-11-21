-- ST-13 Entry Reversal Request, OW-26 / OM-15 owner review (Charter Rev 8
-- BR-I10, BE-06).
--
-- Staff ask to reverse their own Stock-In, Batter Preparation, Waste, or
-- Spillage entry from the current business day, with a reason. The entry
-- stays unchanged until the owner decides. Approval posts one Entry Reversal
-- movement per original movement, linked to it; the original is never edited,
-- so it stays visible in the history. Rejection needs a reason.
begin;

-- 1. Entry Reversal movements, linked to the movement they reverse ------------

alter table public.inventory_movements
  add column if not exists reverses_movement_id uuid references public.inventory_movements(id);

alter table public.inventory_movements
  drop constraint if exists inventory_movements_entry_reversal_link_check;
alter table public.inventory_movements
  add constraint inventory_movements_entry_reversal_link_check
  check ((type = 'entry_reversal'::public.inventory_transaction_type) = (reverses_movement_id is not null));

-- A movement is reversed at most once.
create unique index if not exists inventory_movements_reverses_movement_unique_idx
  on public.inventory_movements (reverses_movement_id)
  where reverses_movement_id is not null;

create table if not exists private.inventory_reversal_authorizations (
  id bigint generated always as identity primary key,
  backend_pid integer not null,
  transaction_id bigint not null,
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on table private.inventory_reversal_authorizations
  from public, anon, authenticated, service_role;
grant insert, select, delete on table private.inventory_reversal_authorizations to postgres;

-- Keeps the sale and void clauses from 202611050009 and 202611220002.
create or replace function public.reject_unimplemented_inventory_movements()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.type in ('transfer_in', 'transfer_out')
    or (
      new.type = 'sales_consumption'
      and not exists (
        select 1
        from private.sales_processing_authorizations a
        where a.backend_pid = pg_backend_pid()
          and a.transaction_id = txid_current()
          and a.sale_id is not distinct from new.sale_id
      )
    )
    or (
      new.type = 'void_reversal'
      and (new.sale_id is null or not private.is_sale_void_authorized(new.sale_id))
    )
    or (
      new.type = 'entry_reversal'
      and not exists (
        select 1
        from private.inventory_reversal_authorizations a
        where a.backend_pid = pg_backend_pid()
          and a.transaction_id = txid_current()
      )
    ) then
    raise exception 'This movement type requires an approved atomic workflow';
  end if;

  return new;
end;
$function$;

-- 2. Reversal requests ---------------------------------------------------------

create sequence if not exists public.inventory_entry_reversal_reference_seq;

create table if not exists public.inventory_entry_reversal_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  client_request_id uuid not null,
  branch_id uuid not null references public.branches(id),
  -- 'movement': one Stock-In / Waste / Spillage / Spoilage movement.
  -- 'batter_batch': a whole batter preparation (its raw-ingredient usage and
  -- the five prepared bottles).
  entry_kind text not null,
  entry_key text not null,
  movement_id uuid references public.inventory_movements(id),
  batch_reference text references public.batter_preparation_batches(batch_reference),
  entry_type text not null,
  entry_reference text not null,
  item_name text not null,
  quantity numeric(12, 3) not null,
  unit text not null,
  entry_recorded_at timestamptz not null,
  requested_by uuid not null references public.profiles(id),
  reason text not null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_reason text,
  constraint inventory_entry_reversal_kind_check
    check (
      (entry_kind = 'movement' and movement_id is not null and batch_reference is null and entry_key = movement_id::text)
      or (entry_kind = 'batter_batch' and batch_reference is not null and movement_id is null and entry_key = batch_reference)
    ),
  constraint inventory_entry_reversal_type_check
    check (entry_type in ('stock_in', 'batter_preparation', 'waste', 'spillage', 'spoilage')),
  constraint inventory_entry_reversal_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint inventory_entry_reversal_reason_check
    check (length(btrim(reason)) between 1 and 500),
  constraint inventory_entry_reversal_decision_check
    check (
      (status = 'pending' and decided_by is null and decided_at is null and decision_reason is null)
      or (status <> 'pending' and decided_by is not null and decided_at is not null)
    ),
  constraint inventory_entry_reversal_rejection_reason_check
    check (status <> 'rejected' or length(btrim(coalesce(decision_reason, ''))) between 1 and 500),
  unique (requested_by, client_request_id)
);

comment on table public.inventory_entry_reversal_requests is
  'ST-13 / OW-26 / OM-15: staff requests to reverse a same-day entry and the owner decision. Item, quantity, and unit are snapshots for review.';

-- ST-13 c6: one pending request per entry; an entry is reversed at most once.
create unique index if not exists inventory_entry_reversal_one_pending_idx
  on public.inventory_entry_reversal_requests (entry_key) where status = 'pending';
create unique index if not exists inventory_entry_reversal_one_approved_idx
  on public.inventory_entry_reversal_requests (entry_key) where status = 'approved';
create index if not exists inventory_entry_reversal_branch_status_idx
  on public.inventory_entry_reversal_requests (branch_id, status, requested_at desc);

alter table public.inventory_entry_reversal_requests enable row level security;

drop policy if exists inventory_entry_reversal_read_accessible_branches on public.inventory_entry_reversal_requests;
create policy inventory_entry_reversal_read_accessible_branches on public.inventory_entry_reversal_requests
for select to authenticated using (public.can_access_branch(branch_id));

revoke all on table public.inventory_entry_reversal_requests from public, anon, authenticated;
grant select on table public.inventory_entry_reversal_requests to authenticated;

-- The movements one request reverses: the single movement, or every movement
-- a batter preparation wrote.
create or replace function private.entry_reversal_movements(
  p_branch_id uuid,
  p_entry_kind text,
  p_movement_id uuid,
  p_batch_reference text
)
returns setof public.inventory_movements
language sql
stable
set search_path = public, pg_temp
as $$
  select m.*
  from public.inventory_movements m
  where p_entry_kind = 'movement' and m.id = p_movement_id
  union all
  select m.*
  from public.inventory_movements m
  where p_entry_kind = 'batter_batch'
    and m.branch_id = p_branch_id
    and (
      (m.type = 'usage'::public.inventory_transaction_type
        and m.reason = 'Batter preparation'
        and m.notes = p_batch_reference)
      or (m.type = 'stock_in'::public.inventory_transaction_type
        and m.ingredient_id = 'prepared-batter'
        and m.batch_id in (
          select b.id from public.ingredient_batches b
          where b.branch_id = p_branch_id and b.batch_reference = p_batch_reference
        ))
    );
$$;
revoke all on function private.entry_reversal_movements(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;

-- A Stock-In (or the prepared bottles of a batch) can only be taken back while
-- nothing from its lot has been used; otherwise stock would no longer add up.
create or replace function private.entry_reversal_lot_used(
  p_branch_id uuid,
  p_entry_kind text,
  p_movement_id uuid,
  p_batch_reference text
)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from private.entry_reversal_movements(p_branch_id, p_entry_kind, p_movement_id, p_batch_reference) m
    join public.ingredient_batches b on b.id = m.batch_id
    where m.type = 'stock_in'::public.inventory_transaction_type
      and b.quantity_remaining < m.quantity
  );
$$;
revoke all on function private.entry_reversal_lot_used(uuid, text, uuid, text)
  from public, anon, authenticated, service_role;

-- ST-13 c1–c6, c9: staff request a reversal of their own same-day entry.
create or replace function public.request_inventory_entry_reversal(
  p_movement_id uuid,
  p_reason text,
  p_client_request_id uuid
)
returns public.inventory_entry_reversal_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_batch public.batter_preparation_batches%rowtype;
  v_request public.inventory_entry_reversal_requests%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  v_kind text;
  v_key text;
  v_batch_reference text;
  v_type text;
  v_item text;
  v_quantity numeric(12, 3);
  v_unit text;
  v_entry_reference text;
  v_recorded_at timestamptz;
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid()) and active;
  if not found or v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'Only branch staff can request a reversal';
  end if;
  if p_movement_id is null or p_client_request_id is null then
    raise exception 'An entry and request id are required';
  end if;

  -- A retried submission returns the request it already created.
  select * into v_request from public.inventory_entry_reversal_requests
  where requested_by = v_profile.id and client_request_id = p_client_request_id;
  if found then
    return v_request;
  end if;

  if v_reason = '' then
    raise exception 'Enter the reason for reversing this entry.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'The reversal reason must be 500 characters or fewer.';
  end if;

  select * into v_movement from public.inventory_movements where id = p_movement_id;
  if not found or not public.can_access_branch(v_movement.branch_id) then
    raise exception using errcode = '42501', message = 'This entry is not available for your assigned branch.';
  end if;

  -- Which entry does this movement belong to?
  if v_movement.type = 'usage'::public.inventory_transaction_type and v_movement.reason = 'Batter preparation' then
    v_batch_reference := v_movement.notes;
  elsif v_movement.type = 'stock_in'::public.inventory_transaction_type
    and v_movement.ingredient_id = 'prepared-batter' and v_movement.batch_id is not null then
    select b.batch_reference into v_batch_reference
    from public.ingredient_batches b where b.id = v_movement.batch_id;
  end if;
  if v_batch_reference is not null then
    select * into v_batch from public.batter_preparation_batches
    where batch_reference = v_batch_reference and branch_id = v_movement.branch_id;
    if not found then
      v_batch_reference := null;
    end if;
  end if;

  if v_batch_reference is not null then
    v_kind := 'batter_batch';
    v_key := v_batch.batch_reference;
    v_type := 'batter_preparation';
    v_item := 'Prepared batter';
    v_quantity := v_batch.bottle_count;
    v_unit := 'bottle';
    v_entry_reference := v_batch.batch_reference;
    v_recorded_at := v_batch.created_at;
    if v_batch.prepared_by <> v_profile.id then
      raise exception 'You can only reverse your own entries.';
    end if;
  elsif v_movement.type in (
    'stock_in'::public.inventory_transaction_type,
    'waste'::public.inventory_transaction_type,
    'spoilage'::public.inventory_transaction_type
  ) then
    v_kind := 'movement';
    v_key := v_movement.id::text;
    v_type := case
      when v_movement.type = 'stock_in'::public.inventory_transaction_type then 'stock_in'
      when v_movement.type = 'spoilage'::public.inventory_transaction_type then 'spoilage'
      when v_movement.reason ilike 'spillage%' then 'spillage'
      else 'waste'
    end;
    select name into v_item from public.ingredients where id = v_movement.ingredient_id;
    v_item := coalesce(v_item, v_movement.ingredient_id);
    v_quantity := v_movement.quantity;
    v_unit := v_movement.unit;
    v_entry_reference := v_movement.reference;
    v_recorded_at := v_movement.created_at;
    if v_movement.actor_id <> v_profile.id then
      raise exception 'You can only reverse your own entries.';
    end if;
  else
    raise exception 'Only Stock-In, Batter Preparation, Waste, and Spillage entries can be reversed.';
  end if;

  if (v_recorded_at at time zone 'Asia/Manila')::date <> v_today then
    raise exception 'Only entries from the current business day can be reversed.';
  end if;

  -- Serialize requests for the same entry.
  perform pg_advisory_xact_lock(hashtext('inventory_entry_reversal:' || v_key));

  if exists (
    select 1 from public.inventory_entry_reversal_requests
    where entry_key = v_key and status = 'approved'
  ) then
    raise exception 'This entry has already been reversed.';
  end if;
  if exists (
    select 1 from public.inventory_entry_reversal_requests
    where entry_key = v_key and status = 'pending'
  ) then
    raise exception 'A reversal request for this entry is already pending.';
  end if;
  if private.entry_reversal_lot_used(
    v_movement.branch_id, v_kind,
    case when v_kind = 'movement' then v_movement.id end,
    case when v_kind = 'batter_batch' then v_key end
  ) then
    raise exception 'Part of this entry has already been used, so it cannot be reversed. Ask the owner to record an authorized adjustment instead.';
  end if;

  insert into public.inventory_entry_reversal_requests (
    reference, client_request_id, branch_id, entry_kind, entry_key, movement_id, batch_reference,
    entry_type, entry_reference, item_name, quantity, unit, entry_recorded_at, requested_by, reason
  ) values (
    format(
      'REV-%s-%s',
      to_char(clock_timestamp() at time zone 'Asia/Manila', 'YYYYMMDD'),
      lpad(nextval('public.inventory_entry_reversal_reference_seq')::text, 4, '0')
    ),
    p_client_request_id, v_movement.branch_id, v_kind, v_key,
    case when v_kind = 'movement' then v_movement.id end,
    case when v_kind = 'batter_batch' then v_key end,
    v_type, v_entry_reference, v_item, v_quantity, v_unit, v_recorded_at, v_profile.id, v_reason
  ) returning * into v_request;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    v_profile.id, v_request.branch_id, 'inventory.reversal_requested',
    format('Reversal request %s for %s %s: %s', v_request.reference, v_type, v_entry_reference, v_reason)
  );

  return v_request;
end;
$$;

-- OW-26 c7 / OM-15 c7: the owner approves (posting Entry Reversal movements)
-- or rejects with a reason.
create or replace function public.decide_inventory_entry_reversal(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.inventory_entry_reversal_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.inventory_entry_reversal_requests%rowtype;
  v_original public.inventory_movements%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_batch public.ingredient_batches%rowtype;
  v_ingredient_name text;
  v_delta numeric(12, 3);
  v_after numeric(12, 3);
  v_remaining numeric(12, 3);
  v_step numeric(12, 3);
  v_count integer := 0;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  if not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only the owner can decide reversal requests';
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid());

  if v_decision not in ('approve', 'reject') then
    raise exception 'The decision must be approve or reject';
  end if;
  if v_decision = 'reject' and v_reason is null then
    raise exception 'Enter the reason for rejecting this request.';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'The reason must be 500 characters or fewer.';
  end if;

  select * into v_request from public.inventory_entry_reversal_requests where id = p_request_id for update;
  if not found then
    raise exception 'The reversal request was not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been %.', v_request.status;
  end if;

  if v_decision = 'reject' then
    update public.inventory_entry_reversal_requests
    set status = 'rejected', decided_by = v_profile.id, decided_at = now(), decision_reason = v_reason
    where id = v_request.id
    returning * into v_request;
    insert into public.audit_logs (user_id, branch_id, action, description)
    values (v_profile.id, v_request.branch_id, 'inventory.reversal_rejected',
      format('Reversal request %s rejected: %s', v_request.reference, v_reason));
    return v_request;
  end if;

  if private.entry_reversal_lot_used(v_request.branch_id, v_request.entry_kind, v_request.movement_id, v_request.batch_reference) then
    raise exception 'Part of this entry has already been used, so it cannot be reversed. Record an authorized adjustment instead.';
  end if;

  insert into private.inventory_reversal_authorizations (backend_pid, transaction_id, request_id)
  values (pg_backend_pid(), txid_current(), v_request.id);

  for v_original in
    select * from private.entry_reversal_movements(
      v_request.branch_id, v_request.entry_kind, v_request.movement_id, v_request.batch_reference)
    order by ingredient_id, created_at
  loop
    v_count := v_count + 1;
    v_delta := -v_original.movement;

    select * into v_inventory from public.branch_inventory
    where branch_id = v_original.branch_id and ingredient_id = v_original.ingredient_id
    for update;
    if not found then
      raise exception 'Ingredient % is no longer configured for this branch', v_original.ingredient_id;
    end if;
    v_after := v_inventory.quantity + v_delta;
    if v_after < 0 then
      select name into v_ingredient_name from public.ingredients where id = v_original.ingredient_id;
      raise exception 'Not enough % in stock to reverse this entry (% % needed, % % available).',
        coalesce(v_ingredient_name, v_original.ingredient_id),
        abs(v_delta), v_original.unit, v_inventory.quantity, v_original.unit;
    end if;

    update public.branch_inventory
    set quantity = v_after, updated_at = now()
    where id = v_inventory.id;

    v_remaining := abs(v_delta);
    if v_delta < 0 then
      -- Taking stock back out: the entry's own lot first, then first-expiry-first-out.
      for v_batch in
        select * from public.ingredient_batches
        where branch_id = v_original.branch_id and ingredient_id = v_original.ingredient_id
          and quantity_remaining > 0
        order by (id = v_original.batch_id) desc, expiration_date nulls last, received_date, created_at
        for update
      loop
        exit when v_remaining <= 0;
        v_step := least(v_batch.quantity_remaining, v_remaining);
        update public.ingredient_batches set quantity_remaining = quantity_remaining - v_step where id = v_batch.id;
        v_remaining := v_remaining - v_step;
      end loop;
    else
      -- Putting stock back: refill lots first-expiry-first-out up to what each received.
      for v_batch in
        select * from public.ingredient_batches
        where branch_id = v_original.branch_id and ingredient_id = v_original.ingredient_id
          and quantity_remaining < quantity_received
        order by expiration_date nulls last, received_date, created_at
        for update
      loop
        exit when v_remaining <= 0;
        v_step := least(v_batch.quantity_received - v_batch.quantity_remaining, v_remaining);
        update public.ingredient_batches set quantity_remaining = quantity_remaining + v_step where id = v_batch.id;
        v_remaining := v_remaining - v_step;
      end loop;
    end if;

    insert into public.inventory_movements (
      reference, branch_id, ingredient_id, actor_id, type, reverses_movement_id, quantity, unit, movement,
      before_quantity, after_quantity, transaction_date, reason, notes
    ) values (
      'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      v_original.branch_id, v_original.ingredient_id, v_profile.id,
      'entry_reversal'::public.inventory_transaction_type, v_original.id,
      abs(v_delta), v_original.unit, v_delta,
      v_inventory.quantity, v_after, now(),
      format('Reversal of %s', v_original.reference),
      'reversal:' || v_request.reference
    );
  end loop;

  if v_count = 0 then
    raise exception 'The entry to reverse was not found.';
  end if;

  delete from private.inventory_reversal_authorizations
  where backend_pid = pg_backend_pid() and transaction_id = txid_current() and request_id = v_request.id;

  update public.inventory_entry_reversal_requests
  set status = 'approved', decided_by = v_profile.id, decided_at = now(), decision_reason = v_reason
  where id = v_request.id
  returning * into v_request;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (v_profile.id, v_request.branch_id, 'inventory.entry_reversed',
    format('%s %s reversed by approving request %s', v_request.entry_type, v_request.entry_reference, v_request.reference));
  return v_request;
end;
$$;

revoke all on function public.request_inventory_entry_reversal(uuid, text, uuid) from public, anon;
grant execute on function public.request_inventory_entry_reversal(uuid, text, uuid) to authenticated;
alter function public.request_inventory_entry_reversal(uuid, text, uuid) owner to postgres;

revoke all on function public.decide_inventory_entry_reversal(uuid, text, text) from public, anon;
grant execute on function public.decide_inventory_entry_reversal(uuid, text, text) to authenticated;
alter function public.decide_inventory_entry_reversal(uuid, text, text) owner to postgres;

notify pgrst, 'reload schema';
commit;
