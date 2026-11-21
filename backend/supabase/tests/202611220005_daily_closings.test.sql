-- ST-06 c7–c10 / OW-11 / OM-11: daily closing. Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

create temporary table close_fixture on commit drop as
select
  '71000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '72000000-0000-4000-8000-000000000001'::uuid as staff_id,
  '72000000-0000-4000-8000-000000000002'::uuid as other_branch_staff_id,
  '73000000-0000-4000-8000-000000000001'::uuid as staff_session_id,
  '73000000-0000-4000-8000-000000000002'::uuid as other_session_id,
  '74000000-0000-4000-8000-000000000001'::uuid as client_request_id;
grant select on close_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data)
select staff_id, 'authenticated', 'authenticated', 'close-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Close Staff"}'::jsonb from close_fixture
union all
select other_branch_staff_id, 'authenticated', 'authenticated', 'close-other@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Close Other"}'::jsonb from close_fixture
union all
select owner_id, 'authenticated', 'authenticated', 'close-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Close Owner"}'::jsonb from close_fixture;

update public.profiles set role = 'staff', employee_id = 'EMP-2026-900103', branch_id = '00000000-0000-4000-8000-000000000001'::uuid, active = true, must_change_password = false
where id = (select staff_id from close_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900104', branch_id = '00000000-0000-4000-8000-000000000002'::uuid, active = true, must_change_password = false
where id = (select other_branch_staff_id from close_fixture);
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = (select owner_id from close_fixture);

insert into auth.sessions (id, user_id, created_at, updated_at)
select staff_session_id, staff_id, now(), now() from close_fixture
union all select other_session_id, other_branch_staff_id, now(), now() from close_fixture;

-- Branch 1 today: two completed cash sales (₱300 + ₱200), one voided cash
-- sale (₱50), one QR sale (₱999, not cash), and yesterday's cash sale (₱700).
-- The void guard covers status updates only, so the fixture can insert the
-- voided sale directly.
insert into public.sales (transaction_reference, branch_id, staff_id, total_amount, payment_method, status, created_at)
select 'CLOSE-T1', '00000000-0000-4000-8000-000000000001'::uuid, staff_id, 300, 'Cash', 'completed', now() from close_fixture
union all select 'CLOSE-T2', '00000000-0000-4000-8000-000000000001'::uuid, staff_id, 200, 'cash', 'completed', now() from close_fixture
union all select 'CLOSE-T3', '00000000-0000-4000-8000-000000000001'::uuid, staff_id, 50, 'Cash', 'voided', now() from close_fixture
union all select 'CLOSE-T4', '00000000-0000-4000-8000-000000000001'::uuid, staff_id, 999, 'QR', 'completed', now() from close_fixture
union all select 'CLOSE-T5', '00000000-0000-4000-8000-000000000001'::uuid, staff_id, 700, 'Cash', 'completed', now() - interval '1 day' from close_fixture;

select ok(not has_table_privilege('authenticated', 'public.daily_closings', 'insert'), 'closings are written only by RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_id::text from close_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select staff_id from close_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from close_fixture))::text, true);

select throws_ok(
  format('select public.record_daily_closing(%L, %s, %s, %L)', '00000000-0000-4000-8000-000000000001'::uuid, -1, 100, gen_random_uuid()),
  'P0001', 'Cash amounts cannot be negative.', 'negative amounts are refused');

select throws_ok(
  format('select public.record_daily_closing(%L, %s, %s, %L)', '00000000-0000-4000-8000-000000000002'::uuid, 1000, 100, gen_random_uuid()),
  '42501', 'This branch is not your assigned branch.', 'staff close only their own branch');

create temporary table close_result on commit drop as
select (public.record_daily_closing('00000000-0000-4000-8000-000000000001'::uuid, 1000, 1440, client_request_id)).*
from close_fixture;

select is((select recorded_cash_sales from close_result), 550.00::numeric(12, 2),
  'recorded cash sales are today''s cash sales, voided included, other days and QR excluded');
select is((select voided_cash_sales from close_result), 50.00::numeric(12, 2), 'voided cash sales are counted separately');
select is((select expected_cash from close_result), 1500.00::numeric(12, 2),
  'ST-06 c8: expected = opening float + recorded cash sales − voided cash sales');
select is((select over_short from close_result), -60.00::numeric(12, 2), 'over/short = closing count − expected (short by ₱60)');
select is((select cash_transaction_count from close_result), 2, 'two completed cash transactions');
select is((select business_date from close_result), (clock_timestamp() at time zone 'Asia/Manila')::date,
  'the closing is for the current business day');

select is(
  (select (public.record_daily_closing('00000000-0000-4000-8000-000000000001'::uuid, 1000, 1440, client_request_id)).id from close_fixture),
  (select id from close_result), 'a retried submission returns the same closing');

select throws_ok(
  format('select public.record_daily_closing(%L, %s, %s, %L)', '00000000-0000-4000-8000-000000000001'::uuid, 1000, 1500, gen_random_uuid()),
  'P0001', 'The closing for this business day has already been recorded.', 'ST-06 c10: a day is closed only once');

select set_config('request.jwt.claim.sub', (select other_branch_staff_id::text from close_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select other_branch_staff_id from close_fixture), 'role', 'authenticated',
  'session_id', (select other_session_id from close_fixture))::text, true);
select is((select count(*)::int from public.daily_closings), 0, 'Branch 2 staff cannot read Branch 1 closings');

select * from finish();
rollback;
