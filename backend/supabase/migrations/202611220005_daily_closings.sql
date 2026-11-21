-- ST-06 c7–c10 Daily Closing, OW-11 / OM-11 Daily Closing Report (Charter Rev 8
-- BR-S8).
--
-- At the end of the business day staff record the opening float and the
-- closing cash count. The server works out the cash sales of that day for the
-- branch and stores the comparison:
--   expected cash = opening float + recorded cash sales − voided cash sales
--   over / short  = closing cash count − expected cash
-- One closing per branch and business day.
begin;

create sequence if not exists public.daily_closing_reference_seq;

create table if not exists public.daily_closings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  client_request_id uuid not null,
  branch_id uuid not null references public.branches(id),
  business_date date not null,
  opening_float numeric(12, 2) not null,
  closing_cash_count numeric(12, 2) not null,
  -- Snapshots taken when the closing is recorded.
  recorded_cash_sales numeric(12, 2) not null,
  voided_cash_sales numeric(12, 2) not null,
  expected_cash numeric(12, 2) not null,
  over_short numeric(12, 2) not null,
  cash_transaction_count integer not null,
  recorded_by uuid not null references public.profiles(id),
  recorded_at timestamptz not null default now(),
  constraint daily_closings_amounts_check
    check (opening_float >= 0 and closing_cash_count >= 0 and recorded_cash_sales >= 0 and voided_cash_sales >= 0),
  constraint daily_closings_expected_check
    check (expected_cash = opening_float + recorded_cash_sales - voided_cash_sales),
  constraint daily_closings_over_short_check
    check (over_short = closing_cash_count - expected_cash),
  -- ST-06 c10: a business day is closed once per branch.
  unique (branch_id, business_date),
  unique (recorded_by, client_request_id)
);

comment on table public.daily_closings is
  'ST-06 / OW-11 / OM-11: one end-of-day cash closing per branch and business date. Cash figures are snapshots taken when the closing was recorded.';

create index if not exists daily_closings_date_idx on public.daily_closings (business_date desc, branch_id);

alter table public.daily_closings enable row level security;

drop policy if exists daily_closings_read_accessible_branches on public.daily_closings;
create policy daily_closings_read_accessible_branches on public.daily_closings
for select to authenticated using (public.can_access_branch(branch_id));

revoke all on table public.daily_closings from public, anon, authenticated;
grant select on table public.daily_closings to authenticated;

-- ST-06 c7, c8, c10: staff record today's closing for their branch.
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

notify pgrst, 'reload schema';
commit;
