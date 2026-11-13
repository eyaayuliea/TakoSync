begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

-- This fixture deliberately uses the three production branch rows.  The test is
-- rolled back, so it cannot alter a hosted or local database beyond its session.
create temporary table rls_fixture on commit drop as
select
  '11111111-0000-4000-8000-111111111111'::uuid as owner_id,
  '22222222-0000-4000-8000-222222222222'::uuid as staff_1_id,
  '33333333-0000-4000-8000-333333333333'::uuid as staff_2_id,
  '44444444-0000-4000-8000-444444444444'::uuid as staff_3_id,
  'aaaaaaaa-0000-4000-8000-aaaaaaaaaaaa'::uuid as owner_session_id,
  'bbbbbbbb-0000-4000-8000-bbbbbbbbbbbb'::uuid as staff_1_session_id,
  'cccccccc-0000-4000-8000-cccccccccccc'::uuid as staff_2_session_id,
  'dddddddd-0000-4000-8000-dddddddddddd'::uuid as staff_3_session_id,
  gen_random_uuid() as product_id,
  gen_random_uuid() as sale_1_id,
  gen_random_uuid() as sale_2_id,
  gen_random_uuid() as sale_3_id,
  gen_random_uuid() as check_1_id,
  gen_random_uuid() as check_2_id,
  gen_random_uuid() as check_3_id,
  gen_random_uuid() as line_1_id,
  gen_random_uuid() as line_2_id,
  gen_random_uuid() as line_3_id,
  gen_random_uuid() as movement_1_id,
  gen_random_uuid() as movement_2_id,
  gen_random_uuid() as movement_3_id,
  gen_random_uuid() as adjustment_2_id,
  gen_random_uuid() as adjustment_3_id,
  gen_random_uuid() as correction_request_id,
  ('RLS-3-' || gen_random_uuid()::text) as product_name;
grant select on rls_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'rls-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Owner"}' from rls_fixture
union all
select staff_1_id, 'authenticated', 'authenticated', 'rls-staff-1@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Staff 1"}' from rls_fixture
union all
select staff_2_id, 'authenticated', 'authenticated', 'rls-staff-2@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Staff 2"}' from rls_fixture
union all
select staff_3_id, 'authenticated', 'authenticated', 'rls-staff-3@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"RLS Staff 3"}' from rls_fixture;

update public.profiles set role = 'owner', branch_id = null, active = true
where id = (select owner_id from rls_fixture);
update public.profiles set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true
where id = (select staff_1_id from rls_fixture);
update public.profiles set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000002', active = true
where id = (select staff_2_id from rls_fixture);
update public.profiles set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000003', active = true
where id = (select staff_3_id from rls_fixture);

insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from rls_fixture
union all select staff_1_session_id, staff_1_id, now(), now() from rls_fixture
union all select staff_2_session_id, staff_2_id, now(), now() from rls_fixture
union all select staff_3_session_id, staff_3_id, now(), now() from rls_fixture;
insert into public.business_day_sessions (session_id, user_id, business_date)
select owner_session_id, owner_id, (clock_timestamp() at time zone 'Asia/Manila')::date from rls_fixture
union all select staff_1_session_id, staff_1_id, (clock_timestamp() at time zone 'Asia/Manila')::date from rls_fixture
union all select staff_2_session_id, staff_2_id, (clock_timestamp() at time zone 'Asia/Manila')::date from rls_fixture
union all select staff_3_session_id, staff_3_id, (clock_timestamp() at time zone 'Asia/Manila')::date from rls_fixture;
insert into public.business_day_settings (business_date, opening_time, normal_closing_time,
  extended_closing_time, extended_closing_enabled, timezone)
values ((clock_timestamp() at time zone 'Asia/Manila')::date, time '00:00', time '23:59:58',
  time '23:59:59', true, 'Asia/Manila')
on conflict (business_date) do update set normal_closing_time = excluded.normal_closing_time,
  extended_closing_time = excluded.extended_closing_time, extended_closing_enabled = true;

-- Seed one row for every branch in each branch-owned category as the database owner.
update public.branch_inventory set quantity = 10, minimum_stock = 1
where ingredient_id = 'flour' and branch_id in (
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003');
insert into public.ingredient_batches (branch_id, ingredient_id, batch_reference, quantity_received, quantity_remaining)
select branch_id, 'flour', 'RLS-' || right(branch_id::text, 1), 10, 10
from public.branches where code in ('BR-001', 'BR-002', 'BR-003')
on conflict (branch_id, batch_reference) do nothing;

insert into public.inventory_movements (id, reference, branch_id, ingredient_id, actor_id, type, quantity, unit,
  movement, before_quantity, after_quantity, reason, notes)
select f.movement_1_id, 'RLS-M1', '00000000-0000-4000-8000-000000000001', 'flour', f.staff_1_id,
  'stock_in', 1, 'kg', 1, 9, 10, 'RLS fixture', 'branch 1'
from rls_fixture f
union all
select f.movement_2_id, 'RLS-M2', '00000000-0000-4000-8000-000000000002', 'flour', f.staff_2_id,
  'stock_in', 1, 'kg', 1, 9, 10, 'RLS fixture', 'branch 2'
from rls_fixture f
union all
select f.movement_3_id, 'RLS-M3', '00000000-0000-4000-8000-000000000003', 'flour', f.staff_3_id,
  'stock_in', 1, 'kg', 1, 9, 10, 'RLS fixture', 'branch 3'
from rls_fixture f;

insert into public.daily_stock_checks (id, reference, branch_id, submitted_by, check_date, status)
select f.check_1_id, 'RLS-C1', '00000000-0000-4000-8000-000000000001', f.staff_1_id, current_date, 'pending_owner_review' from rls_fixture f
union all select f.check_2_id, 'RLS-C2', '00000000-0000-4000-8000-000000000002', f.staff_2_id, current_date, 'pending_owner_review' from rls_fixture f
union all select f.check_3_id, 'RLS-C3', '00000000-0000-4000-8000-000000000003', f.staff_3_id, current_date, 'pending_owner_review' from rls_fixture f;
insert into public.daily_stock_count_lines (id, daily_stock_check_id, ingredient_id, recorded_quantity, physical_quantity, difference, unit, inventory_revision)
select f.line_1_id, f.check_1_id, 'flour', 10, 9, -1, 'kg', 0 from rls_fixture f
union all select f.line_2_id, f.check_2_id, 'flour', 10, 9, -1, 'kg', 0 from rls_fixture f
union all select f.line_3_id, f.check_3_id, 'flour', 10, 9, -1, 'kg', 0 from rls_fixture f;

insert into public.products (id, product_name, description, price) select product_id, product_name, 'RLS fixture', 10 from rls_fixture;
insert into public.sales (id, transaction_reference, branch_id, staff_id, total_amount, payment_method, status)
select f.sale_1_id, 'RLS-S1', '00000000-0000-4000-8000-000000000001', f.staff_1_id, 10, 'cash', 'completed' from rls_fixture f
union all select f.sale_2_id, 'RLS-S2', '00000000-0000-4000-8000-000000000002', f.staff_2_id, 10, 'cash', 'completed' from rls_fixture f
union all select f.sale_3_id, 'RLS-S3', '00000000-0000-4000-8000-000000000003', f.staff_3_id, 10, 'cash', 'completed' from rls_fixture f;
insert into public.sale_items (sale_id, product_id, quantity, unit_price, subtotal)
select sale_1_id, product_id, 1, 10, 10 from rls_fixture
union all select sale_2_id, product_id, 1, 10, 10 from rls_fixture
union all select sale_3_id, product_id, 1, 10, 10 from rls_fixture;
insert into public.batter_preparation_batches (batch_reference, branch_id, prepared_by)
select 'RLS-B1', '00000000-0000-4000-8000-000000000001', staff_1_id from rls_fixture
union all select 'RLS-B2', '00000000-0000-4000-8000-000000000002', staff_2_id from rls_fixture
union all select 'RLS-B3', '00000000-0000-4000-8000-000000000003', staff_3_id from rls_fixture;
insert into public.inventory_discrepancy_adjustments (id, daily_stock_count_line_id, daily_stock_check_id, branch_id,
  ingredient_id, recorded_quantity, physical_quantity, difference, approved_by, reason, inventory_movement_id)
select f.adjustment_2_id, f.line_2_id, f.check_2_id, '00000000-0000-4000-8000-000000000002', 'flour', 10, 9, -1, f.owner_id, 'RLS fixture', f.movement_2_id from rls_fixture f
union all select f.adjustment_3_id, f.line_3_id, f.check_3_id, '00000000-0000-4000-8000-000000000003', 'flour', 10, 9, -1, f.owner_id, 'RLS fixture', f.movement_3_id from rls_fixture f;

select has_function_privilege('authenticated', 'public.business_session_status()', 'execute');
select has_function_privilege('authenticated', 'public.record_inventory_transactions(uuid,jsonb)', 'execute');
select ok(not has_table_privilege('authenticated', 'public.inventory_movements', 'insert'), 'movement writes are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.sales', 'insert'), 'sales writes are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.daily_stock_checks', 'insert'), 'count writes are RPC-only');
select ok(not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'insert'), 'adjustment audit writes are RPC-only');
select ok(not has_function_privilege('authenticated', 'public.authorize_inventory_discrepancy_adjustment_unchecked(uuid,text)', 'execute'), 'unchecked adjustment bypass is unavailable');

-- The same table set is checked for each staff identity.  Every branch-owned
-- category is expected to expose exactly one row for the assigned branch.
set local role authenticated;
select set_config('request.jwt.claims', (select jsonb_build_object('sub', staff_1_id, 'role', 'authenticated', 'session_id', staff_1_session_id)::text from rls_fixture), true);
select is((select count(*)::int from branch_inventory where ingredient_id = 'flour'), 1, 'Branch 1 staff sees only Branch 1 inventory');
select is((select count(*)::int from ingredient_batches where batch_reference like 'RLS-%'), 1, 'Branch 1 staff sees only Branch 1 stock-in batch');
select is((select count(*)::int from inventory_movements where reference like 'RLS-%'), 1, 'Branch 1 staff sees only Branch 1 movements');
select is((select count(*)::int from sales where transaction_reference like 'RLS-%'), 1, 'Branch 1 staff sees only Branch 1 sales');
select is((select count(*)::int from sale_items), 1, 'Branch 1 staff sees only Branch 1 sale items');
select is((select count(*)::int from daily_stock_checks where reference like 'RLS-%'), 1, 'Branch 1 staff sees only Branch 1 counts');
select is((select count(*)::int from batter_preparation_batches where batch_reference like 'RLS-%'), 1, 'Branch 1 staff sees only Branch 1 batter');
select is((select count(*)::int from inventory_discrepancy_adjustments), 0, 'Staff cannot read adjustment audit rows');
select throws_ok($$select * from record_inventory_transactions('00000000-0000-4000-8000-000000000002', '[{"ingredient_id":"flour","type":"stock_in","quantity":1}]'::jsonb)$$, 'P0001', 'Branch access denied', 'Branch 1 staff cannot write Branch 2');

select set_config('request.jwt.claims', (select jsonb_build_object('sub', staff_2_id, 'role', 'authenticated', 'session_id', staff_2_session_id)::text from rls_fixture), true);
select is((select count(*)::int from branch_inventory where ingredient_id = 'flour'), 1, 'Branch 2 staff sees only Branch 2 inventory');
select is((select count(*)::int from ingredient_batches where batch_reference like 'RLS-%'), 1, 'Branch 2 staff sees only Branch 2 stock-in batch');
select is((select count(*)::int from inventory_movements where reference like 'RLS-%'), 1, 'Branch 2 staff sees only Branch 2 movements');
select is((select count(*)::int from sales where transaction_reference like 'RLS-%'), 1, 'Branch 2 staff sees only Branch 2 sales');
select is((select count(*)::int from daily_stock_checks where reference like 'RLS-%'), 1, 'Branch 2 staff sees only Branch 2 counts');
select throws_ok($$select * from record_inventory_transactions('00000000-0000-4000-8000-000000000001', '[{"ingredient_id":"flour","type":"stock_in","quantity":1}]'::jsonb)$$, 'P0001', 'Branch access denied', 'Branch 2 staff cannot write Branch 1');

select set_config('request.jwt.claims', (select jsonb_build_object('sub', staff_3_id, 'role', 'authenticated', 'session_id', staff_3_session_id)::text from rls_fixture), true);
select is((select count(*)::int from branch_inventory where ingredient_id = 'flour'), 1, 'Branch 3 staff sees only Branch 3 inventory');
select is((select count(*)::int from ingredient_batches where batch_reference like 'RLS-%'), 1, 'Branch 3 staff sees only Branch 3 stock-in batch');
select is((select count(*)::int from inventory_movements where reference like 'RLS-%'), 1, 'Branch 3 staff sees only Branch 3 movements');
select is((select count(*)::int from sales where transaction_reference like 'RLS-%'), 1, 'Branch 3 staff sees only Branch 3 sales');
select is((select count(*)::int from daily_stock_checks where reference like 'RLS-%'), 1, 'Branch 3 staff sees only Branch 3 counts');
select throws_ok($$select * from record_inventory_transactions('00000000-0000-4000-8000-000000000001', '[{"ingredient_id":"flour","type":"stock_in","quantity":1}]'::jsonb)$$, 'P0001', 'Branch access denied', 'Branch 3 staff cannot write Branch 1');

select set_config('request.jwt.claims', (select jsonb_build_object('sub', staff_1_id, 'role', 'authenticated', 'session_id', staff_1_session_id)::text from rls_fixture), true);
select is(
  (select status from request_inventory_count_correction(
    (select line_1_id from rls_fixture), (select correction_request_id from rls_fixture), 9, 'Staff correction request'
  )),
  'pending',
  'assigned Staff can submit a correction request for its own physical count'
);
select throws_ok(
  format('select decide_inventory_count_correction(%L, %L, %L)', (select correction_request_id from rls_fixture), 'approved', 'Staff self approval'),
  '42501', 'Only an active owner may decide count correction requests',
  'Staff cannot approve its own discrepancy'
);
select set_config('request.jwt.claims', (select jsonb_build_object('sub', owner_id, 'role', 'authenticated', 'session_id', owner_session_id)::text from rls_fixture), true);
select is(
  (select status from decide_inventory_count_correction((select correction_request_id from rls_fixture), 'approved', 'Owner review')),
  'approved',
  'Owner can approve the submitted correction through the guarded RPC'
);
select is(
  (select outcome from validate_inventory_count_correction((select correction_request_id from rls_fixture), 'Owner validation')),
  'adjusted',
  'Owner validation records an authorized inventory adjustment'
);
select is(
  (select quantity from branch_inventory where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  9::numeric,
  'authorized validation changes expected inventory through the workflow'
);
select is(
  (select physical_quantity from daily_stock_count_lines where id = (select line_1_id from rls_fixture)),
  9::numeric,
  'submitted physical count preserves its original value'
);

select set_config('request.jwt.claims', (select jsonb_build_object('sub', owner_id, 'role', 'authenticated', 'session_id', owner_session_id)::text from rls_fixture), true);
select is((select count(*)::int from branch_inventory where ingredient_id = 'flour'), 3, 'Owner sees inventory across all three branches');
select is((select count(*)::int from ingredient_batches where batch_reference like 'RLS-%'), 3, 'Owner sees stock-in batches across all three branches');
select is((select count(*)::int from inventory_movements where reference like 'RLS-%'), 3, 'Owner sees movements across all three branches');
select is((select count(*)::int from sales where transaction_reference like 'RLS-%'), 3, 'Owner sees sales across all three branches');
select is((select count(*)::int from daily_stock_checks where reference like 'RLS-%'), 3, 'Owner sees counts across all three branches');
select is((select count(*)::int from inventory_discrepancy_adjustments), 3, 'Owner sees adjustment audit rows across branches');
select ok((select (business_session_status() ->> 'active')::boolean), 'Owner session status returns active true');

select set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-111111111111","role":"authenticated"}', true);
select is(business_session_status() ->> 'active', 'false', 'missing session identity is rejected');
select set_config('request.jwt.claims', '{"sub":"11111111-0000-4000-8000-111111111111","role":"authenticated","session_id":"not-a-uuid"}', true);
select is(business_session_status() ->> 'active', 'false', 'invalid session identity is rejected');
reset role;
update public.business_day_settings set normal_closing_time = time '00:00:01', extended_closing_time = time '00:00:02', extended_closing_enabled = false
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
set local role authenticated;
select set_config('request.jwt.claims', (select jsonb_build_object('sub', owner_id, 'role', 'authenticated', 'session_id', owner_session_id)::text from rls_fixture), true);
select is(business_session_status() ->> 'active', 'false', 'expired business session is rejected');
reset role;
delete from auth.sessions where id = (select owner_session_id from rls_fixture);
set local role authenticated;
select is(business_session_status() ->> 'active', 'false', 'revoked Auth session is rejected');
reset role;
update public.profiles set active = false where id = (select owner_id from rls_fixture);
set local role authenticated;
select is(business_session_status() ->> 'active', 'false', 'inactive Owner profile is rejected');

reset role;
select * from finish();
rollback;
