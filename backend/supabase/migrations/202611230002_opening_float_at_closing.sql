-- ST-06 c7 (User Story sheet, current version): at the end of the business day
-- staff enter the closing cash count and the opening float together.
--
-- This undoes 202611220016, which asked for the float at the start of the day:
--   * record_daily_closing(branch, opening float, closing count, request id) is
--     restored; the 3-argument version that read a separately recorded float
--     is dropped.
--   * record_opening_float and daily_opening_floats are dropped. Each closing
--     already stores its own opening_float, so no closing loses data. A float
--     recorded for a day that was never closed is discarded; the closing form
--     asks for it again.
begin;

drop function if exists public.record_opening_float(uuid, numeric, uuid);
drop function if exists public.record_daily_closing(uuid, numeric, uuid);
delete from public.api_endpoint_permissions
where endpoint in ('rpc/record_opening_float', 'table/daily_opening_floats');
drop table if exists public.daily_opening_floats;
drop sequence if exists public.daily_opening_float_reference_seq;

create or replace function public.record_daily_closing(
  p_branch_id uuid,
  p_opening_float numeric,
  p_closing_cash_count numeric,
  p_client_request_id uuid
)
returns public.daily_closings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_closing public.daily_closings%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  v_recorded numeric(12, 2);
  v_voided numeric(12, 2);
  v_count integer;
  v_opening numeric(12, 2);
  v_counted numeric(12, 2);
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid()) and active;
  if not found or v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'Only branch staff can record the daily closing';
  end if;
  if p_client_request_id is null then
    raise exception 'A request id is required';
  end if;

  -- A retried submission returns the closing it already saved.
  select * into v_closing from public.daily_closings
  where recorded_by = v_profile.id and client_request_id = p_client_request_id;
  if found then
    return v_closing;
  end if;

  if p_branch_id is null or not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'This branch is not your assigned branch.';
  end if;
  if p_opening_float is null or p_closing_cash_count is null then
    raise exception 'Enter the opening float and the closing cash count.';
  end if;
  if p_opening_float < 0 or p_closing_cash_count < 0 then
    raise exception 'Cash amounts cannot be negative.';
  end if;
  if p_opening_float > 9999999999.99 or p_closing_cash_count > 9999999999.99 then
    raise exception 'Cash amounts are too large.';
  end if;
  if p_opening_float <> round(p_opening_float, 2) or p_closing_cash_count <> round(p_closing_cash_count, 2) then
    raise exception 'Cash amounts can have at most two decimal places.';
  end if;
  v_opening := p_opening_float;
  v_counted := p_closing_cash_count;

  -- Serialize closings for the same branch and day.
  perform pg_advisory_xact_lock(hashtext('daily_closing:' || p_branch_id::text || ':' || v_today::text));
  if exists (select 1 from public.daily_closings where branch_id = p_branch_id and business_date = v_today) then
    raise exception 'The closing for this business day has already been recorded.';
  end if;

  -- Cash sales of the branch on this business day (Manila time, midnight
  -- cut-off). Voided sales are counted separately and subtracted.
  select
    coalesce(sum(total_amount) filter (where status in ('completed', 'voided')), 0),
    coalesce(sum(total_amount) filter (where status = 'voided'), 0),
    count(*) filter (where status = 'completed')
  into v_recorded, v_voided, v_count
  from public.sales
  where branch_id = p_branch_id
    and lower(btrim(payment_method)) = 'cash'
    and (created_at at time zone 'Asia/Manila')::date = v_today;

  insert into public.daily_closings (
    reference, client_request_id, branch_id, business_date, opening_float, closing_cash_count,
    recorded_cash_sales, voided_cash_sales, expected_cash, over_short, cash_transaction_count, recorded_by
  ) values (
    format(
      'CLOSE-%s-%s',
      to_char(v_today, 'YYYYMMDD'),
      lpad(nextval('public.daily_closing_reference_seq')::text, 4, '0')
    ),
    p_client_request_id, p_branch_id, v_today, v_opening, v_counted,
    v_recorded, v_voided, v_opening + v_recorded - v_voided,
    v_counted - (v_opening + v_recorded - v_voided), v_count, v_profile.id
  ) returning * into v_closing;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    v_profile.id, p_branch_id, 'sales.daily_closing',
    format('Daily closing %s for %s: float %s, counted %s, expected %s, over/short %s',
      v_closing.reference, v_today, v_opening, v_counted, v_closing.expected_cash, v_closing.over_short)
  );

  return v_closing;
end;
$$;

revoke all on function public.record_daily_closing(uuid, numeric, numeric, uuid) from public, anon;
grant execute on function public.record_daily_closing(uuid, numeric, numeric, uuid) to authenticated;
alter function public.record_daily_closing(uuid, numeric, numeric, uuid) owner to postgres;

-- S2 API gate: rpc/record_daily_closing keeps its SALE_CREATE declaration.
select private.declare_endpoint('rpc/record_daily_closing', array['SALE_CREATE'], '{}', 'Staff record the opening float and closing cash count at the end of the business day (ST-06 c7–c10).');

notify pgrst, 'reload schema';
commit;
