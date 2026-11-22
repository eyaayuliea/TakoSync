-- ST-06 c7–c10 (Requirements Engineering v6 ST-06 c3, UR-21): the opening float is
-- recorded once at the start of the business day, before the branch's first
-- sale, separately from the closing cash count at the end of the day.
--
--   * public.daily_opening_floats: one float per branch and business date, saved
--     with the employee account and server time.
--   * record_opening_float(branch, amount, request id): staff, today only, once.
--   * record_daily_closing(branch, closing count, request id) now reads the float
--     recorded for the day and no longer accepts it as an argument. A day cannot
--     be closed until its float is recorded.
--
-- The app asks for the float before the first sale. The server still accepts a
-- float after sales exist, so a day that started without one can be closed.
begin;

create sequence if not exists public.daily_opening_float_reference_seq;

create table if not exists public.daily_opening_floats (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  client_request_id uuid not null,
  branch_id uuid not null references public.branches(id),
  business_date date not null,
  amount numeric(12, 2) not null,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  constraint daily_opening_floats_amount_check check (amount >= 0),
  -- ST-06 c10: one opening float per branch and business day.
  unique (branch_id, business_date),
  unique (recorded_by, client_request_id)
);

comment on table public.daily_opening_floats is
  'ST-06 c7: the opening float recorded once per branch at the start of the business day, with the employee account and server time.';

-- Closings recorded before this change carried their float; keep it as the day''s float.
insert into public.daily_opening_floats (reference, client_request_id, branch_id, business_date, amount, recorded_by, recorded_at)
select 'FLOAT-' || to_char(c.business_date, 'YYYYMMDD') || '-' || lpad(nextval('public.daily_opening_float_reference_seq')::text, 4, '0'),
  gen_random_uuid(), c.branch_id, c.business_date, c.opening_float, c.recorded_by, c.recorded_at
from public.daily_closings c
on conflict (branch_id, business_date) do nothing;

alter table public.daily_opening_floats enable row level security;

drop policy if exists daily_opening_floats_read_accessible_branches on public.daily_opening_floats;
create policy daily_opening_floats_read_accessible_branches on public.daily_opening_floats
for select to authenticated using (public.can_access_branch(branch_id));

revoke all on table public.daily_opening_floats from public, anon, authenticated;
grant select on table public.daily_opening_floats to authenticated;

create or replace function public.record_opening_float(
  p_branch_id uuid,
  p_amount numeric,
  p_client_request_id uuid
)
returns public.daily_opening_floats
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_float public.daily_opening_floats%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid()) and active;
  if not found or v_profile.role <> 'staff' then
    raise exception using errcode = '42501', message = 'Only branch staff can record the opening float';
  end if;
  if p_client_request_id is null then
    raise exception 'A request id is required';
  end if;

  -- A retried submission returns the float it already saved.
  select * into v_float from public.daily_opening_floats
  where recorded_by = v_profile.id and client_request_id = p_client_request_id;
  if found then
    return v_float;
  end if;

  if p_branch_id is null or not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'This branch is not your assigned branch.';
  end if;
  if p_amount is null then
    raise exception 'Enter the opening float.';
  end if;
  if p_amount < 0 then
    raise exception 'Cash amounts cannot be negative.';
  end if;
  if p_amount > 9999999999.99 then
    raise exception 'Cash amounts are too large.';
  end if;
  if p_amount <> round(p_amount, 2) then
    raise exception 'Cash amounts can have at most two decimal places.';
  end if;

  perform pg_advisory_xact_lock(hashtext('daily_opening_float:' || p_branch_id::text || ':' || v_today::text));
  if exists (select 1 from public.daily_opening_floats where branch_id = p_branch_id and business_date = v_today) then
    raise exception 'The opening float for this business day has already been recorded.';
  end if;
  if exists (select 1 from public.daily_closings where branch_id = p_branch_id and business_date = v_today) then
    raise exception 'The closing for this business day has already been recorded.';
  end if;

  insert into public.daily_opening_floats (reference, client_request_id, branch_id, business_date, amount, recorded_by)
  values (
    format('FLOAT-%s-%s', to_char(v_today, 'YYYYMMDD'),
      lpad(nextval('public.daily_opening_float_reference_seq')::text, 4, '0')),
    p_client_request_id, p_branch_id, v_today, p_amount, v_profile.id
  ) returning * into v_float;

  insert into public.audit_logs (user_id, branch_id, action, description)
  values (
    v_profile.id, p_branch_id, 'sales.opening_float',
    format('Opening float %s for %s: %s', v_float.reference, v_today, v_float.amount)
  );

  return v_float;
end;
$$;

drop function if exists public.record_daily_closing(uuid, numeric, numeric, uuid);

create or replace function public.record_daily_closing(
  p_branch_id uuid,
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
  if p_closing_cash_count is null then
    raise exception 'Enter the closing cash count.';
  end if;
  if p_closing_cash_count < 0 then
    raise exception 'Cash amounts cannot be negative.';
  end if;
  if p_closing_cash_count > 9999999999.99 then
    raise exception 'Cash amounts are too large.';
  end if;
  if p_closing_cash_count <> round(p_closing_cash_count, 2) then
    raise exception 'Cash amounts can have at most two decimal places.';
  end if;
  v_counted := p_closing_cash_count;

  -- Serialize closings for the same branch and day.
  perform pg_advisory_xact_lock(hashtext('daily_closing:' || p_branch_id::text || ':' || v_today::text));
  if exists (select 1 from public.daily_closings where branch_id = p_branch_id and business_date = v_today) then
    raise exception 'The closing for this business day has already been recorded.';
  end if;

  -- ST-06 c7, c9: the float recorded at the start of the day.
  select amount into v_opening from public.daily_opening_floats
  where branch_id = p_branch_id and business_date = v_today;
  if not found then
    raise exception 'Record the opening float for this business day before the closing.';
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
    format('CLOSE-%s-%s', to_char(v_today, 'YYYYMMDD'),
      lpad(nextval('public.daily_closing_reference_seq')::text, 4, '0')),
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

revoke all on function public.record_opening_float(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_opening_float(uuid, numeric, uuid) to authenticated;
alter function public.record_opening_float(uuid, numeric, uuid) owner to postgres;

revoke all on function public.record_daily_closing(uuid, numeric, uuid) from public, anon;
grant execute on function public.record_daily_closing(uuid, numeric, uuid) to authenticated;
alter function public.record_daily_closing(uuid, numeric, uuid) owner to postgres;

-- S2 API gate (rpc/record_daily_closing keeps its declaration).
select private.declare_endpoint('rpc/record_opening_float', array['SALE_CREATE'], '{}', 'Staff record the opening float at the start of the business day (ST-06 c7).');
select private.declare_endpoint('table/daily_opening_floats', array['SALES_VIEW_BRANCH'], '{}', 'Opening float per branch and business day.');

notify pgrst, 'reload schema';
commit;
