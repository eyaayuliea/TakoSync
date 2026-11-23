-- ST-07 Void Request, OM-15 / OW-26 Void and Reversal Review, OM-10 / OW-10
-- Void Report (User Story sheet of 2026-11-23, which supersedes the v6 sheet).
--
-- The void flow returns to "staff request, owner decides":
--   * Staff request a void of a completed sale of their branch from the current
--     business day, with a required reason. The request is Pending; the sale is
--     unchanged and still counts in the totals. One pending request per sale.
--   * The owner approves (the sale becomes Voided, is excluded from sales totals,
--     and one Void Reversal entry per consumed ingredient puts the stock back) or
--     rejects with a required reason (the sale stays Completed).
--
-- Replaces void_sale / review_sale_void from 202611220015. Rows recorded by that
-- interim flow already voided their sale, so they become approved requests
-- (the reviewing owner, when there was one, is kept as the decider).
begin;

-- 1. Statuses ---------------------------------------------------------------------

alter table public.sale_void_requests drop constraint if exists sale_void_requests_status_check;
alter table public.sale_void_requests drop constraint if exists sale_void_requests_decision_check;
alter table public.sale_void_requests drop constraint if exists sale_void_requests_rejection_reason_check;
drop index if exists public.sale_void_requests_one_void_idx;

update public.sale_void_requests
set status = 'approved',
    decided_by = coalesce(decided_by, requested_by),
    decided_at = coalesce(decided_at, requested_at),
    decision_reason = coalesce(decision_reason, 'Voided before owner approval was required')
where status in ('pending_review', 'reviewed', 'flagged');

alter table public.sale_void_requests alter column status set default 'pending';
alter table public.sale_void_requests
  add constraint sale_void_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  add constraint sale_void_requests_decision_check
    check (
      (status = 'pending' and decided_by is null and decided_at is null and decision_reason is null)
      or (status <> 'pending' and decided_by is not null and decided_at is not null)
    ),
  add constraint sale_void_requests_rejection_reason_check
    check (status <> 'rejected' or length(btrim(coalesce(decision_reason, ''))) between 1 and 500);

-- ST-07 c6: one pending request per sale; a sale is voided at most once.
create unique index if not exists sale_void_requests_one_pending_idx
  on public.sale_void_requests (sale_id) where status = 'pending';
create unique index if not exists sale_void_requests_one_approved_idx
  on public.sale_void_requests (sale_id) where status = 'approved';

comment on table public.sale_void_requests is
  'ST-07 / OW-26 / OM-15: staff requests to void a sale (requested_by, requested_at, reason) and the owner decision (status pending | approved | rejected; decided_by, decided_at, decision_reason = rejection reason). The sale is voided only when a request is approved.';

create or replace function public.guard_sale_void_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'voided' then
    new.status := 'voided';
    return new;
  end if;
  if new.status = 'voided' and not private.is_sale_void_authorized(new.id) then
    raise exception 'A sale can only be voided through an approved void request';
  end if;
  return new;
end;
$$;

-- 2. Staff request a void ----------------------------------------------------------------

drop function if exists public.void_sale(uuid, text, uuid);
drop function if exists public.review_sale_void(uuid, text, text);

create or replace function public.request_sale_void(
  p_sale_id uuid,
  p_reason text,
  p_client_request_id uuid
)
returns public.sale_void_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_sale public.sales%rowtype;
  v_request public.sale_void_requests%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;

  select * into v_profile from public.profiles
  where id = (select auth.uid()) and active;
  if not found or v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'Only branch staff can request a void';
  end if;
  if p_sale_id is null or p_client_request_id is null then
    raise exception 'A sale and request id are required';
  end if;

  -- A retried submission returns the request it already created.
  select * into v_request from public.sale_void_requests
  where requested_by = v_profile.id and client_request_id = p_client_request_id;
  if found then
    if v_request.sale_id <> p_sale_id then
      raise exception 'This request id was already used for a different sale';
    end if;
    return v_request;
  end if;

  if v_reason = '' then
    raise exception 'Enter the reason for voiding this sale.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'The void reason must be 500 characters or fewer.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found or not public.can_access_branch(v_sale.branch_id) then
    raise exception using errcode = '42501', message = 'This sale is not available for your assigned branch.';
  end if;
  if v_sale.status = 'voided' then
    raise exception 'This sale is already voided.';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'Only a completed sale can be voided.';
  end if;
  if coalesce(v_sale.inventory_processing_status, '') <> 'completed' then
    raise exception 'Finish inventory processing for this sale before requesting a void.';
  end if;
  if (v_sale.created_at at time zone 'Asia/Manila')::date <> v_today then
    raise exception 'Only sales from the current business day can be voided.';
  end if;
  if exists (
    select 1 from public.sale_void_requests
    where sale_id = v_sale.id and status = 'pending'
  ) then
    raise exception 'A void request for this sale is already pending.';
  end if;

  insert into public.sale_void_requests (
    reference, client_request_id, sale_id, branch_id, requested_by, reason, status
  ) values (
    format(
      'VOID-%s-%s',
      to_char(clock_timestamp() at time zone 'Asia/Manila', 'YYYYMMDD'),
      lpad(nextval('public.sale_void_request_reference_seq')::text, 4, '0')
    ),
    p_client_request_id, v_sale.id, v_sale.branch_id, v_profile.id, v_reason, 'pending'
  ) returning * into v_request;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    v_profile.id, v_sale.branch_id, 'sale.void_requested',
    format('Void request %s for sale %s: %s', v_request.reference, v_sale.transaction_reference, v_reason)
  );

  return v_request;
end;
$$;

-- 3. Owner decision ----------------------------------------------------------------------

create or replace function public.decide_sale_void(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.sale_void_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.sale_void_requests%rowtype;
  v_sale public.sales%rowtype;
  v_line record;
  v_inventory public.branch_inventory%rowtype;
  v_batch public.ingredient_batches%rowtype;
  v_remaining numeric(12, 3);
  v_to_batch numeric(12, 3);
  v_after numeric(12, 3);
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  if not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only the owner can decide void requests';
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

  select * into v_request from public.sale_void_requests where id = p_request_id for update;
  if not found then
    raise exception 'The void request was not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This request has already been %.', v_request.status;
  end if;

  if v_decision = 'reject' then
    -- OM-15 c8 / ST-07 c9: the sale stays Completed.
    update public.sale_void_requests
    set status = 'rejected', decided_by = v_profile.id, decided_at = now(), decision_reason = v_reason
    where id = v_request.id
    returning * into v_request;

    insert into public.audit_logs (user_id, branch_id, action, description)
    values (
      v_profile.id, v_request.branch_id, 'sale.void_rejected',
      format('Void request %s rejected: %s', v_request.reference, v_reason)
    );
    return v_request;
  end if;

  select * into v_sale from public.sales where id = v_request.sale_id for update;
  if v_sale.status <> 'completed' then
    raise exception 'Only a completed sale can be voided.';
  end if;
  if coalesce(v_sale.inventory_processing_status, '') <> 'completed' then
    raise exception 'Finish inventory processing for this sale before approving the void.';
  end if;

  insert into private.sale_void_authorizations (backend_pid, transaction_id, sale_id)
  values (pg_backend_pid(), txid_current(), v_sale.id);

  -- OM-15 c6 / OW-26 c6: put back exactly what the sale consumed, one Void
  -- Reversal per ingredient.
  for v_line in
    select ingredient_id, sum(quantity) as quantity, min(unit) as unit
    from public.inventory_movements
    where sale_id = v_sale.id
      and type = 'sales_consumption'::public.inventory_transaction_type
    group by ingredient_id
    order by ingredient_id
  loop
    select * into v_inventory from public.branch_inventory
    where branch_id = v_sale.branch_id and ingredient_id = v_line.ingredient_id
    for update;
    if not found then
      raise exception 'Ingredient % is no longer configured for this branch', v_line.ingredient_id;
    end if;
    v_after := v_inventory.quantity + v_line.quantity;

    update public.branch_inventory
    set quantity = v_after, updated_at = now()
    where id = v_inventory.id;

    -- Refill lots in first-expiry-first-out order, up to what each one received.
    v_remaining := v_line.quantity;
    for v_batch in
      select * from public.ingredient_batches
      where branch_id = v_sale.branch_id and ingredient_id = v_line.ingredient_id
        and quantity_remaining < quantity_received
      order by expiration_date nulls last, received_date, created_at
      for update
    loop
      exit when v_remaining <= 0;
      v_to_batch := least(v_batch.quantity_received - v_batch.quantity_remaining, v_remaining);
      update public.ingredient_batches
      set quantity_remaining = quantity_remaining + v_to_batch
      where id = v_batch.id;
      v_remaining := v_remaining - v_to_batch;
    end loop;

    insert into public.inventory_movements (
      reference, branch_id, ingredient_id, actor_id, type, sale_id, quantity, unit, movement,
      before_quantity, after_quantity, transaction_date, reason, notes
    ) values (
      'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
      v_sale.branch_id, v_line.ingredient_id, v_profile.id,
      'void_reversal'::public.inventory_transaction_type, v_sale.id,
      v_line.quantity, v_line.unit, v_line.quantity,
      v_inventory.quantity, v_after, now(),
      format('Void of sale %s', v_sale.transaction_reference),
      'void:' || v_request.reference
    );
  end loop;

  update public.sales set status = 'voided' where id = v_sale.id;

  delete from private.sale_void_authorizations
  where backend_pid = pg_backend_pid() and transaction_id = txid_current() and sale_id = v_sale.id;

  update public.sale_void_requests
  set status = 'approved', decided_by = v_profile.id, decided_at = now(), decision_reason = v_reason
  where id = v_request.id
  returning * into v_request;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    v_profile.id, v_request.branch_id, 'sale.voided',
    format('Sale %s voided by approving request %s', v_sale.transaction_reference, v_request.reference)
  );
  return v_request;
end;
$$;

revoke all on function public.request_sale_void(uuid, text, uuid) from public, anon;
grant execute on function public.request_sale_void(uuid, text, uuid) to authenticated;
alter function public.request_sale_void(uuid, text, uuid) owner to postgres;

revoke all on function public.decide_sale_void(uuid, text, text) from public, anon;
grant execute on function public.decide_sale_void(uuid, text, text) to authenticated;
alter function public.decide_sale_void(uuid, text, text) owner to postgres;

revoke all on function public.guard_sale_void_status() from public, anon, authenticated;
alter function public.guard_sale_void_status() owner to postgres;

-- 4. S2 API gate ---------------------------------------------------------------------------

delete from public.api_endpoint_permissions where endpoint in ('rpc/void_sale', 'rpc/review_sale_void');
select private.declare_endpoint('rpc/request_sale_void', array['SALE_CREATE'], '{}', 'Staff request a void of a sale of the current business day (ST-07).');
select private.declare_endpoint('rpc/decide_sale_void', array['ADJUSTMENT_AUTHORIZE'], '{}', 'Owner approves or rejects a void request (OW-26, OM-15).');

notify pgrst, 'reload schema';
commit;
