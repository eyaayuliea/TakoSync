-- ST-07 / OW-26 / OM-15: staff void a sale at once; the owner marks it Reviewed or Flagged.
-- Runs inside one transaction that is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

-- Independent of data already in the database (rolled back with the test).
delete from public.daily_closings where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;

create temporary table void_fixture on commit drop as
select
  '51000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '52000000-0000-4000-8000-000000000001'::uuid as staff_1_id,
  '52000000-0000-4000-8000-000000000002'::uuid as staff_2_id,
  '53000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  '53000000-0000-4000-8000-000000000002'::uuid as staff_1_session_id,
  '53000000-0000-4000-8000-000000000003'::uuid as staff_2_session_id,
  gen_random_uuid() as product_id,
  gen_random_uuid() as sale_id,
  gen_random_uuid() as old_sale_id,
  gen_random_uuid() as flag_sale_id,
  gen_random_uuid() as late_sale_id,
  '54000000-0000-4000-8000-000000000001'::uuid as client_request_id,
  '54000000-0000-4000-8000-000000000002'::uuid as second_client_request_id,
  ('VOID-TEST-' || gen_random_uuid()::text) as product_name;
grant select on void_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'void-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Void Owner"}'::jsonb from void_fixture
union all
select staff_1_id, 'authenticated', 'authenticated', 'void-staff-1@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Void Staff 1"}'::jsonb from void_fixture
union all
select staff_2_id, 'authenticated', 'authenticated', 'void-staff-2@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Void Staff 2"}'::jsonb from void_fixture;

update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = (select owner_id from void_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900101', branch_id = '00000000-0000-4000-8000-000000000001'::uuid, active = true, must_change_password = false
where id = (select staff_1_id from void_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900102', branch_id = '00000000-0000-4000-8000-000000000002'::uuid, active = true, must_change_password = false
where id = (select staff_2_id from void_fixture);

insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from void_fixture
union all select staff_1_session_id, staff_1_id, now(), now() from void_fixture
union all select staff_2_session_id, staff_2_id, now(), now() from void_fixture;

-- Branch 1 had 10 kg of flour; the sale below consumed 2 kg.
update public.branch_inventory set quantity = 8
where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour';
insert into public.ingredient_batches (branch_id, ingredient_id, batch_reference, quantity_received, quantity_remaining)
values ('00000000-0000-4000-8000-000000000001'::uuid, 'flour', 'VOID-TEST-LOT', 10, 8);

insert into public.products (id, product_name, description, price)
select product_id, product_name, 'Void fixture', 10 from void_fixture;
insert into public.sales (id, transaction_reference, branch_id, staff_id, total_amount, payment_method, status,
  inventory_processing_status, created_at)
select sale_id, 'VOID-TEST-SALE', '00000000-0000-4000-8000-000000000001'::uuid, staff_1_id, 20, 'Cash', 'completed',
  'completed', now() from void_fixture
union all
select old_sale_id, 'VOID-TEST-OLD-SALE', '00000000-0000-4000-8000-000000000001'::uuid, staff_1_id, 10, 'Cash', 'completed',
  'completed', now() - interval '2 days' from void_fixture
union all
select flag_sale_id, 'VOID-TEST-FLAG-SALE', '00000000-0000-4000-8000-000000000001'::uuid, staff_1_id, 10, 'Cash', 'completed',
  'completed', now() from void_fixture
union all
select late_sale_id, 'VOID-TEST-LATE-SALE', '00000000-0000-4000-8000-000000000001'::uuid, staff_1_id, 10, 'Cash', 'completed',
  'completed', now() from void_fixture;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
select sale_id, product_id, 2, 10, 20 from void_fixture;

-- The sale's consumption, recorded the way trusted sale processing records it.
insert into private.sales_processing_authorizations (backend_pid, transaction_id, sale_id)
select pg_backend_pid(), txid_current(), sale_id from void_fixture;
insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type, sale_id, quantity, unit,
  movement, before_quantity, after_quantity, reason, notes)
select 'VOID-TEST-CONSUMPTION', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', staff_1_id, 'sales_consumption',
  sale_id, 2, 'kg', -2, 10, 8, 'Sale fixture', 'sale:' || sale_id::text
from void_fixture;
delete from private.sales_processing_authorizations where backend_pid = pg_backend_pid();


select ok(not has_table_privilege('authenticated', 'public.sale_void_requests', 'insert'), 'voids are written only by RPC');
select ok(to_regprocedure('public.request_sale_void(uuid,text,uuid)') is null
  and to_regprocedure('public.decide_sale_void(uuid,text,text)') is null, 'the request/approval functions are gone');

create or replace function pg_temp.act_as(p_user uuid, p_session uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session)::text, true);
end;
$$;

-- Staff, Branch 2 ------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as(staff_2_id, staff_2_session_id) from void_fixture;
select throws_ok(
  format('select public.void_sale(%L, %L, %L)', (select sale_id from void_fixture), 'Not my branch', gen_random_uuid()),
  '42501', 'This sale is not available for your assigned branch.', 'ST-07 c1: only the assigned branch');

-- Staff, Branch 1 ------------------------------------------------------------
select pg_temp.act_as(staff_1_id, staff_1_session_id) from void_fixture;

select throws_ok(
  format('select public.void_sale(%L, %L, %L)', (select sale_id from void_fixture), '   ', (select client_request_id from void_fixture)),
  'P0001', 'Enter the reason for voiding this sale.', 'ST-07 c3: the reason is required');
select throws_ok(
  format('select public.void_sale(%L, %L, %L)', (select old_sale_id from void_fixture), 'Wrong flavor', gen_random_uuid()),
  'P0001', 'Only sales from the current business day can be voided.', 'ST-07 c1: only current business day sales');

select is(
  (select (public.void_sale(sale_id, '  Wrong flavor  ', client_request_id)).status from void_fixture),
  'pending_review', 'ST-07 c4, c7: the void is saved and is Pending Review');
select is((select status from public.sales where id = (select sale_id from void_fixture)), 'voided',
  'ST-07 c5: the sale is Voided at once, without an owner approval');
select results_eq(
  format($$select reason, requested_by, requested_at is not null from public.sale_void_requests where sale_id = %L$$, (select sale_id from void_fixture)),
  format($$values ('Wrong flavor'::text, %L::uuid, true)$$, (select staff_1_id from void_fixture)),
  'ST-07 c4: saved with the trimmed reason, the employee account, and the server time');
select is(
  (select quantity from public.branch_inventory
   where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour'),
  10.000::numeric(12, 3), 'ST-07 c6: the consumed flour is back in stock');
select is(
  (select quantity_remaining from public.ingredient_batches
   where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and batch_reference = 'VOID-TEST-LOT'),
  10.000::numeric(12, 3), 'the lot it came from is refilled');
select results_eq(
  format($$select quantity, movement, notes, actor_id from public.inventory_movements
    where sale_id = %L and type = 'void_reversal'$$, (select sale_id from void_fixture)),
  format($$values (2.000::numeric(12, 3), 2.000::numeric(12, 3), 'void:' || %L, %L::uuid)$$,
    (select reference from public.sale_void_requests where sale_id = (select sale_id from void_fixture)),
    (select staff_1_id from void_fixture)),
  'OW-26 c6: the staff void posts one Void Reversal entry per consumed ingredient');

select is(
  (select count(*)::int from (select public.void_sale(sale_id, 'Wrong flavor', client_request_id) from void_fixture) retry),
  1, 'a retried submission returns the same void');
select is((select count(*)::int from public.sale_void_requests where sale_id = (select sale_id from void_fixture)), 1,
  'a retry does not create a second void');
select throws_ok(
  format('select public.void_sale(%L, %L, %L)', (select sale_id from void_fixture), 'Again', (select second_client_request_id from void_fixture)),
  'P0001', 'This sale is already voided.', 'ST-07 c8: a voided sale cannot be voided again');

select throws_ok(
  format('select public.review_sale_void(%L, %L, null)',
    (select id from public.sale_void_requests where sale_id = (select sale_id from void_fixture)), 'reviewed'),
  '42501', 'Only the owner can review voided sales', 'staff cannot review a void');

select lives_ok(
  format('select public.void_sale(%L, %L, %L)', (select flag_sale_id from void_fixture), 'Customer left', gen_random_uuid()),
  'a second sale is voided for the flag check');

-- Owner ----------------------------------------------------------------------
select pg_temp.act_as(owner_id, owner_session_id) from void_fixture;

select throws_ok(
  format('select public.void_sale(%L, %L, %L)', (select late_sale_id from void_fixture), 'Owner', gen_random_uuid()),
  '42501', 'Only branch staff can void a sale', 'the owner does not void sales');
select is(
  (select (public.review_sale_void(id, 'reviewed', null)).status
   from public.sale_void_requests where sale_id = (select sale_id from void_fixture)),
  'reviewed', 'OM-15: the owner marks a void Reviewed');
select results_eq(
  format($$select decided_by, decided_at is not null from public.sale_void_requests where sale_id = %L$$, (select sale_id from void_fixture)),
  format($$values (%L::uuid, true)$$, (select owner_id from void_fixture)),
  'OW-10 c5: the reviewing owner and review time are recorded');
select throws_ok(
  format('select public.review_sale_void(%L, %L, %L)',
    (select id from public.sale_void_requests where sale_id = (select sale_id from void_fixture)), 'flagged', 'Too late'),
  'P0001', 'This void has already been reviewed.', 'OW-26 c9: a reviewed void can no longer be acted on');
select throws_ok(
  format('select public.review_sale_void(%L, %L, %L)',
    (select id from public.sale_void_requests where sale_id = (select flag_sale_id from void_fixture)), 'flagged', ' '),
  'P0001', 'Enter the reason for flagging this void.', 'OW-26 c8: flagging needs a reason');
select is(
  (select (public.review_sale_void(id, 'flagged', 'No customer complaint on record')).status
   from public.sale_void_requests where sale_id = (select flag_sale_id from void_fixture)),
  'flagged', 'OW-26 c8: the owner flags a void');
select is((select status from public.sales where id = (select flag_sale_id from void_fixture)), 'voided',
  'OW-26 c8: flagging does not undo the void');

-- After the daily closing ---------------------------------------------------------
reset role;
insert into public.daily_closings (reference, client_request_id, branch_id, business_date, opening_float, closing_cash_count,
  recorded_cash_sales, voided_cash_sales, expected_cash, over_short, cash_transaction_count, recorded_by)
select 'CLOSE-VOID-TEST', gen_random_uuid(), '00000000-0000-4000-8000-000000000001'::uuid,
  (clock_timestamp() at time zone 'Asia/Manila')::date, 0, 0, 0, 0, 0, 0, 0, staff_1_id from void_fixture;
set local role authenticated;
select pg_temp.act_as(staff_1_id, staff_1_session_id) from void_fixture;
select throws_ok(
  format('select public.void_sale(%L, %L, %L)', (select late_sale_id from void_fixture), 'After closing', gen_random_uuid()),
  'P0001', 'The daily closing is already recorded, so sales of this business day can no longer be voided.',
  'ST-07 c1: no void after the daily closing is recorded');

-- Database owner: the guards hold even outside the RPCs ------------------------
reset role;

update public.sales set status = 'completed' where id = (select sale_id from void_fixture);
select is((select status from public.sales where id = (select sale_id from void_fixture)), 'voided',
  'a voided sale stays voided (a sale-processing retry cannot un-void it)');

select throws_ok(
  format($$insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type, sale_id,
    quantity, unit, movement, before_quantity, after_quantity)
    values ('VOID-TEST-FORGED', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', %L, 'void_reversal', %L,
    1, 'kg', 1, 10, 11)$$, (select owner_id from void_fixture), (select old_sale_id from void_fixture)),
  'P0001', 'This movement type requires an approved atomic workflow',
  'Void Reversal entries cannot be written outside Void Sale');

select throws_ok(
  format($$update public.sales set status = 'voided' where id = %L$$, (select old_sale_id from void_fixture)),
  'P0001', 'A sale can only be voided through Void Sale', 'a sale cannot be voided by a direct update');

select * from finish();
rollback;
