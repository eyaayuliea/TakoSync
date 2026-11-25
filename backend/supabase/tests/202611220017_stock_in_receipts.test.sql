-- ST-09: Stock-In as a header with lines, purchase-unit conversion, lots, retry safety.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(21);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'stockin-staff@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"StockIn Staff"}'::jsonb),
  ('a7000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'stockin-owner@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"StockIn Owner"}'::jsonb);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900801',
  branch_id = '00000000-0000-4000-8000-000000000001', active = true, must_change_password = false
where id = 'a7000000-0000-4000-8000-000000000001';
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = 'a7000000-0000-4000-8000-000000000002';
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', now(), now()),
  ('a7100000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date) values
  ('a7100000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', (clock_timestamp() at time zone 'Asia/Manila')::date),
  ('a7100000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002', (clock_timestamp() at time zone 'Asia/Manila')::date);

update public.branch_inventory set quantity = 10
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id in ('octopus', 'sauces', 'flour', 'packaging');
-- An item that is date-tracked but has no shelf life: the date must be typed (ST-09 c3).
-- Items with a shelf life get date received + shelf life when no date is typed.
update public.ingredients set expiration_tracking = true, shelf_life_days = null where id = 'dashi';
-- Salt has a pack size since 202611260001; this test needs an item without one.
delete from public.ingredient_package_sizes where ingredient_id = 'salt';

create temporary table t on commit drop as
select (clock_timestamp() at time zone 'Asia/Manila')::date as today,
  '00000000-0000-4000-8000-000000000001'::uuid as b1,
  'a7200000-0000-4000-8000-000000000001'::uuid as request_id;
grant select on t to authenticated;

create or replace function pg_temp.act_as(p_user uuid, p_session uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'session_id', p_session)::text, true);
end;
$$;
create or replace function pg_temp.header(p_purchased date, p_received date, p_supplier text default 'Seaside Market OR-1182')
returns jsonb language sql as $$
  select jsonb_build_object('supplier_reference', p_supplier, 'date_purchased', p_purchased, 'date_received', p_received);
$$;

set local role authenticated;
select pg_temp.act_as('a7000000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001');

-- Validation (ST-09 c2, c3) ------------------------------------------------------------
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[]'::jsonb),
  '22023', 'Add at least one item to the Stock-In.', 'at least one line is required');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"","quantity":1}]'::jsonb),
  '22023', 'Item 1: select the ingredient being received.', 'ST-09 c2: the ingredient is required');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"flour","quantity":0}]'::jsonb),
  '22023', 'All-purpose flour: the quantity must be a number greater than 0.', 'ST-09 c2: the quantity must be greater than zero');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"dashi","quantity":1}]'::jsonb),
  '22023', 'Dashi powder: select the expiration date. It is tracked for expiry.', 'ST-09 c3: a date-tracked item without a shelf life needs an expiration date');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)),
  jsonb_build_array(jsonb_build_object('ingredient_id', 'octopus', 'quantity', 1, 'expiration_date', (select today - 1 from t)))),
  '22023', 'Octopus: the expiration date cannot be earlier than the date received.', 'ST-09 c3: expiration not before the date received');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today - 1 from t)), '[{"ingredient_id":"flour","quantity":1}]'::jsonb),
  '22023', 'The date purchased cannot be later than the date received.', 'the date purchased is not after the date received');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today + 1 from t)), '[{"ingredient_id":"flour","quantity":1}]'::jsonb),
  '22023', 'The date received cannot be in the future.', 'the date received is not in the future');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"salt","quantity":1,"unit":"pack"}]'::jsonb),
  '22023', 'Salt has no purchase-unit conversion. Enter the quantity in g.', 'ST-09 c4: no conversion without an owner-set package size');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"flour","quantity":1},{"ingredient_id":"flour","quantity":2}]'::jsonb),
  '22023', 'All-purpose flour is listed more than once. Combine it into one line.', 'an ingredient appears once per Stock-In');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', '00000000-0000-4000-8000-000000000002',
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"flour","quantity":1}]'::jsonb),
  '42501', 'This branch is not your assigned branch.', 'staff record Stock-In for their own branch only');
select is((select count(*)::int from public.stock_in_receipts), 0, 'a refused Stock-In saves nothing');

-- A valid three-line Stock-In (ST-09 c1, c4, c6, c7) ------------------------------------
create temporary table saved on commit drop as
select public.record_stock_in(b1, request_id, pg_temp.header(today - 1, today), jsonb_build_array(
  jsonb_build_object('ingredient_id', 'octopus', 'quantity', 2000, 'unit', 'g', 'expiration_date', today + 7),
  jsonb_build_object('ingredient_id', 'sauces', 'quantity', 3, 'unit', 'pack', 'expiration_date', today + 30),
  jsonb_build_object('ingredient_id', 'flour', 'quantity', 5)
)) as body from t;

select results_eq(
  $$select supplier_reference, date_purchased, date_received, recorded_by from public.stock_in_receipts$$,
  format($$values ('Seaside Market OR-1182'::text, %L::date, %L::date, 'a7000000-0000-4000-8000-000000000001'::uuid)$$,
    (select today - 1 from t), (select today from t)),
  'ST-09 c1: the header keeps the supplier, date purchased, date received, and the employee account');
select results_eq(
  $$select ingredient_id, entered_quantity, entered_unit, base_quantity, base_unit from public.stock_in_receipt_lines order by line_index$$,
  $$values ('octopus'::text, 2000.000::numeric(12,3), 'g'::text, 2000.000::numeric(12,3), 'g'::text),
           ('sauces', 3.000, 'pack', 3000.000, 'ml'),
           ('flour', 5.000, 'g', 5.000, 'g')$$,
  'ST-09 c4: three 1000 ml bottles of sauce become 3000 ml; base-unit lines are unchanged');
select results_eq(
  $$select ingredient_id, quantity from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id in ('octopus','sauces','flour') order by 1$$,
  $$values ('flour'::text, 15.000::numeric(12,3)), ('octopus', 2010.000), ('sauces', 3010.000)$$,
  'ST-09 c6: expected quantities increase by the base-unit quantities');
select results_eq(
  format($$select b.ingredient_id, b.quantity_received, b.expiration_date, b.received_date
    from public.stock_in_receipt_lines l join public.inventory_movements m on m.id = l.movement_id
    join public.ingredient_batches b on b.id = m.batch_id order by l.line_index$$),
  format($$values ('octopus'::text, 2000.000::numeric(12,3), %L::date, %L::date), ('sauces', 3000.000, %L::date, %L::date), ('flour', 5.000, %L::date, %L::date)$$,
    (select today + 7 from t), (select today from t), (select today + 30 from t), (select today from t), (select today + 180 from t), (select today from t)),
  'ST-09 c7: each line creates a lot with its expiration date (flour, with no date typed, gets date received + its 180-day shelf life) and the date received');
select is((select count(*)::int from public.inventory_movements m join public.stock_in_receipt_lines l on l.movement_id = m.id where m.type = 'stock_in'), 3,
  'each line is its own Stock-In ledger movement');
select is((select jsonb_array_length(body -> 'lines') from saved), 3, 'the saved receipt is returned with its lines');

-- Retry (ST-09 c10) ---------------------------------------------------------------------
select is(
  (select public.record_stock_in(b1, request_id, pg_temp.header(today - 1, today), '[{"ingredient_id":"flour","quantity":5}]'::jsonb) -> 'receipt' ->> 'reference' from t),
  (select body -> 'receipt' ->> 'reference' from saved), 'ST-09 c10: a retry with the same request id returns the same receipt');
select is((select count(*)::int from public.stock_in_receipt_lines), 3, 'the retry adds no lines and no stock');

-- Access --------------------------------------------------------------------------------
select ok(not has_table_privilege('authenticated', 'public.stock_in_receipts', 'insert')
  and not has_table_privilege('authenticated', 'public.stock_in_receipt_lines', 'insert'), 'receipts are written only by RPC');
select pg_temp.act_as('a7000000-0000-4000-8000-000000000002', 'a7100000-0000-4000-8000-000000000002');
select throws_ok(format('select public.record_stock_in(%L, gen_random_uuid(), %L, %L)', (select b1 from t),
  pg_temp.header((select today from t), (select today from t)), '[{"ingredient_id":"flour","quantity":1}]'::jsonb),
  '42501', 'Only branch staff can record a Stock-In', 'the owner does not record Stock-In');

select * from finish();
rollback;
