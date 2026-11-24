-- ST-07 automatic void (migration 202611240005): staff void at once, no owner approval.
-- Requests left pending by the earlier flow can still be decided by the owner.
-- Runs inside one transaction that is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

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
  gen_random_uuid() as pending_sale_id,
  gen_random_uuid() as pending_request_id,
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
select pending_sale_id, 'VOID-TEST-PENDING-SALE', '00000000-0000-4000-8000-000000000001'::uuid, staff_1_id, 10, 'Cash', 'completed',
  'completed', now() from void_fixture;
-- A request left Pending by the earlier approval flow.
insert into public.sale_void_requests (id, reference, client_request_id, sale_id, branch_id, requested_by, reason, status)
select pending_request_id, 'VOID-TEST-PENDING', gen_random_uuid(), pending_sale_id, '00000000-0000-4000-8000-000000000001'::uuid,
  staff_1_id, 'Asked before the change', 'pending' from void_fixture;
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

create temporary table void_lots_before on commit drop as
select sum(quantity_remaining) as lots_before from public.ingredient_batches
where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour';
grant select on void_lots_before to authenticated;

select ok(not has_table_privilege('authenticated', 'public.sale_void_requests', 'insert'), 'voids are written only by RPC');
select ok(to_regprocedure('public.request_sale_void(uuid, text, uuid)') is null, 'request_sale_void is gone');

-- Staff, Branch 1 ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_1_id::text from void_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select staff_1_id from void_fixture), 'role', 'authenticated',
  'session_id', (select staff_1_session_id from void_fixture))::text, true);

select throws_ok(
  format('select public.void_sale(%L, %L, %L)',
    (select sale_id from void_fixture), '   ', (select client_request_id from void_fixture)),
  'P0001', 'Enter the reason for voiding this sale.', 'ST-07: the reason is required');

select throws_ok(
  format('select public.void_sale(%L, %L, %L)',
    (select old_sale_id from void_fixture), 'Wrong flavor', gen_random_uuid()),
  'P0001', 'Only sales from the current business day can be voided.', 'ST-07: only current business day sales');

select is(
  (select (public.void_sale(sale_id, '  Wrong flavor  ', client_request_id)).status from void_fixture),
  'approved', 'the void is recorded at once, without owner approval');

select is((select status from public.sales where id = (select sale_id from void_fixture)), 'voided',
  'the sale is Voided immediately');

select results_eq(
  format($$select reason, decided_by = requested_by, decided_at is not null, decision_reason
    from public.sale_void_requests where sale_id = %L$$, (select sale_id from void_fixture)),
  $$values ('Wrong flavor'::text, true, true, 'Automatic void (no owner approval required)'::text)$$,
  'the record keeps the trimmed reason and shows the staff member as the one who voided');

select is(
  (select quantity from public.branch_inventory
   where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour'),
  10.000::numeric(12, 3), 'the consumed flour is back in stock');

select is(
  (select sum(quantity_remaining) from public.ingredient_batches
   where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour'),
  (select lots_before + 2 from void_lots_before), 'the 2 kg is returned to the flour lots');

select results_eq(
  format($$select quantity, movement, notes, actor_id from public.inventory_movements
    where sale_id = %L and type = 'void_reversal'$$, (select sale_id from void_fixture)),
  format($$values (2.000::numeric(12, 3), 2.000::numeric(12, 3), 'void:' || %L, %L::uuid)$$,
    (select reference from public.sale_void_requests where sale_id = (select sale_id from void_fixture)),
    (select staff_1_id from void_fixture)),
  'one Void Reversal entry per consumed ingredient, recorded under the staff member');

select is(
  (select count(*)::int from (
    select public.void_sale(sale_id, 'Wrong flavor', client_request_id) from void_fixture
  ) retry), 1, 'a retried submission returns the same void');
select is((select count(*)::int from public.sale_void_requests where sale_id = (select sale_id from void_fixture)), 1,
  'a retry does not record a second void');
select is(
  (select count(*)::int from public.inventory_movements
   where sale_id = (select sale_id from void_fixture) and type = 'void_reversal'), 1,
  'a retry does not return the stock twice');

select throws_ok(
  format('select public.void_sale(%L, %L, %L)',
    (select sale_id from void_fixture), 'Again', (select second_client_request_id from void_fixture)),
  'P0001', 'This sale is already voided.', 'a sale is voided at most once');

select throws_ok(
  format('select public.decide_sale_void(%L, %L, null)', (select pending_request_id from void_fixture), 'approve'),
  '42501', 'Only the owner can decide void requests', 'staff cannot decide a request left pending by the earlier flow');

-- Staff, Branch 2 ------------------------------------------------------------
select set_config('request.jwt.claim.sub', (select staff_2_id::text from void_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select staff_2_id from void_fixture), 'role', 'authenticated',
  'session_id', (select staff_2_session_id from void_fixture))::text, true);

select throws_ok(
  format('select public.void_sale(%L, %L, %L)',
    (select pending_sale_id from void_fixture), 'Not my branch', gen_random_uuid()),
  '42501', 'This sale is not available for your assigned branch.', 'only the assigned branch can void a sale');
select is((select count(*)::int from public.sale_void_requests), 0, 'Branch 2 staff cannot read Branch 1 voids');

-- Owner ----------------------------------------------------------------------
select set_config('request.jwt.claim.sub', (select owner_id::text from void_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from void_fixture), 'role', 'authenticated',
  'session_id', (select owner_session_id from void_fixture))::text, true);

select throws_ok(
  format('select public.void_sale(%L, %L, %L)',
    (select pending_sale_id from void_fixture), 'Owner tries', gen_random_uuid()),
  '42501', 'Only branch staff can void a sale', 'the void action belongs to branch staff');

select throws_ok(
  format('select public.decide_sale_void(%L, %L, %L)', (select pending_request_id from void_fixture), 'reject', ' '),
  'P0001', 'Enter the reason for rejecting this request.', 'rejecting an earlier pending request still needs a reason');

select is(
  (select (public.decide_sale_void(pending_request_id, 'approve', null)).status from void_fixture),
  'approved', 'the owner can still approve a request left pending by the earlier flow');
select is((select status from public.sales where id = (select pending_sale_id from void_fixture)), 'voided',
  'approving it voids the sale');

select throws_ok(
  format('select public.decide_sale_void(%L, %L, %L)', (select pending_request_id from void_fixture), 'reject', 'Too late'),
  'P0001', 'This request has already been approved.', 'a decided request can no longer be acted on');

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
  'Void Reversal entries cannot be written outside the Void action');

select throws_ok(
  format($$update public.sales set status = 'voided' where id = %L$$, (select old_sale_id from void_fixture)),
  'P0001', 'A sale can only be voided through the Void action',
  'a sale cannot be marked voided directly');

select * from finish();
rollback;
