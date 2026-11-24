-- ST-07 automatic void (owner decision of 2026-11-24): a void no longer needs
-- owner approval. Staff void a completed sale of the current business day with
-- a required reason; the sale becomes Voided at once, is excluded from sales
-- totals, and one Void Reversal entry per consumed ingredient puts the stock
-- back. The void is still recorded in sale_void_requests (who, when, why) so the
-- owner sees every void in the Void Report and the review screens.
--
--   * void_sale(sale, reason, request id) replaces request_sale_void.
--   * The record is saved as approved with decided_by = the staff member and
--     decision_reason = 'Automatic void (no owner approval required)'.
--   * Requests that were still Pending before this change stay Pending; the
--     owner can still approve or reject them (decide_sale_void is kept), and
--     staff voiding such a sale completes the pending request instead.
--   * The stock return is one private function used by both paths.
begin;

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
    raise exception 'A sale can only be voided through the Void action';
  end if;
  return new;
end;
$$;

-- 1. The stock return shared by both paths ---------------------------------------------

create or replace function private.apply_sale_void(
  p_sale_id uuid,
  p_request_reference text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sale public.sales%rowtype;
  v_line record;
  v_inventory public.branch_inventory%rowtype;
  v_batch public.ingredient_batches%rowtype;
  v_remaining numeric(12, 3);
  v_to_batch numeric(12, 3);
  v_after numeric(12, 3);
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'The sale was not found';
  end if;
  if v_sale.status = 'voided' then
    raise exception 'This sale is already voided.';
  end if;
  if v_sale.status <> 'completed' then
    raise exception 'Only a completed sale can be voided.';
  end if;
  if coalesce(v_sale.inventory_processing_status, '') <> 'completed' then
    raise exception 'Finish inventory processing for this sale before voiding it.';
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
      v_sale.branch_id, v_line.ingredient_id, p_actor_id,
      'void_reversal'::public.inventory_transaction_type, v_sale.id,
      v_line.quantity, v_line.unit, v_line.quantity,
      v_inventory.quantity, v_after, now(),
      format('Void of sale %s', v_sale.transaction_reference),
      'void:' || p_request_reference
    );
  end loop;

  update public.sales set status = 'voided' where id = v_sale.id;

  delete from private.sale_void_authorizations
  where backend_pid = pg_backend_pid() and transaction_id = txid_current() and sale_id = v_sale.id;

end;
$$;

revoke all on function private.apply_sale_void(uuid, text, uuid) from public, anon, authenticated;
alter function private.apply_sale_void(uuid, text, uuid) owner to postgres;

-- 2. Staff void a sale at once ------------------------------------------------------------

drop function if exists public.request_sale_void(uuid, text, uuid);

create or replace function public.void_sale(
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
    raise exception using errcode = '42501', message = 'Only branch staff can void a sale';
  end if;
  if p_sale_id is null or p_client_request_id is null then
    raise exception 'A sale and request id are required';
  end if;

  -- A retried submission returns the void it already recorded.
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
    raise exception 'Finish inventory processing for this sale before voiding it.';
  end if;
  if (v_sale.created_at at time zone 'Asia/Manila')::date <> v_today then
    raise exception 'Only sales from the current business day can be voided.';
  end if;

  -- A request left Pending by the earlier approval flow is completed by this void.
  select * into v_request from public.sale_void_requests
  where sale_id = v_sale.id and status = 'pending'
  for update;
  if not found then
    insert into public.sale_void_requests (
      reference, client_request_id, sale_id, branch_id, requested_by, reason, status,
      decided_by, decided_at, decision_reason
    ) values (
      format(
        'VOID-%s-%s',
        to_char(clock_timestamp() at time zone 'Asia/Manila', 'YYYYMMDD'),
        lpad(nextval('public.sale_void_request_reference_seq')::text, 4, '0')
      ),
      p_client_request_id, v_sale.id, v_sale.branch_id, v_profile.id, v_reason, 'approved',
      v_profile.id, now(), 'Automatic void (no owner approval required)'
    ) returning * into v_request;
  else
    update public.sale_void_requests
    set status = 'approved', decided_by = v_profile.id, decided_at = now(),
        decision_reason = 'Automatic void (no owner approval required)'
    where id = v_request.id
    returning * into v_request;
  end if;

  perform private.apply_sale_void(v_sale.id, v_request.reference, v_profile.id);

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    v_profile.id, v_sale.branch_id, 'sale.voided',
    format('Sale %s voided by staff (%s): %s', v_sale.transaction_reference, v_request.reference, v_reason)
  );

  return v_request;
end;
$$;

-- 3. Owner decision on requests that were already pending --------------------------------

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

  select * into v_sale from public.sales where id = v_request.sale_id;
  perform private.apply_sale_void(v_request.sale_id, v_request.reference, v_profile.id);

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

revoke all on function public.void_sale(uuid, text, uuid) from public, anon;
grant execute on function public.void_sale(uuid, text, uuid) to authenticated;
alter function public.void_sale(uuid, text, uuid) owner to postgres;

revoke all on function public.decide_sale_void(uuid, text, text) from public, anon;
grant execute on function public.decide_sale_void(uuid, text, text) to authenticated;
alter function public.decide_sale_void(uuid, text, text) owner to postgres;

revoke all on function public.guard_sale_void_status() from public, anon, authenticated;
alter function public.guard_sale_void_status() owner to postgres;

comment on table public.sale_void_requests is
  'ST-07: every void of a sale (requested_by = the staff member, requested_at, reason). Since 202611240005 a void is automatic: the row is saved as approved with decided_by = requested_by. Rows from the earlier approval flow may be pending or rejected, with the owner as decided_by.';

-- 4. S2 API gate ---------------------------------------------------------------------------

delete from public.api_endpoint_permissions where endpoint = 'rpc/request_sale_void';
select private.declare_endpoint('rpc/void_sale', array['SALE_CREATE'], '{}', 'Staff void a sale of the current business day at once, with a reason (ST-07).');

notify pgrst, 'reload schema';
commit;
