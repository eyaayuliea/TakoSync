-- Per-item expiry rules (migration 202611250002). Runs inside one transaction that is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select results_eq(
  $$select id, shelf_life_days, near_expiration_days, expiration_tracking from public.ingredients
    where id in ('eggs','cabbage','baking-powder','prepared-batter','flour') order by 1$$,
  $$values ('baking-powder'::text, 365, 30, true), ('cabbage', 5, 2, true), ('eggs', 28, 14, true),
           ('flour', 180, 14, true), ('prepared-batter', 1, 0, true)$$,
  'starting values from the sheet: shelf life and window per item, and those items are date-tracked');
select results_eq(
  $$select id, shelf_life_days, near_expiration_days, expiration_tracking from public.ingredients
    where id in ('salt','packaging','takoyaki-picks') order by 1$$,
  $$values ('packaging'::text, null::int, null::int, false), ('salt', null, null, false), ('takoyaki-picks', null, null, false)$$,
  'salt, packaging and picks never expire and are not date-tracked');
select throws_ok($$ update public.ingredients set shelf_life_days = 0 where id = 'eggs' $$, '23514', null, 'a shelf life is at least one day');
select throws_ok($$ update public.ingredients set near_expiration_days = -1 where id = 'eggs' $$, '23514', null, 'a window is zero or more days');
select lives_ok($$ update public.ingredients set near_expiration_days = 0 where id = 'eggs' $$, 'a window of zero days (same-day alert) is allowed');

-- New lots: the entered date, or date received + shelf life ---------------------------------
create temporary table expiry_fixture on commit drop as
select '97000000-0000-4000-8000-000000000001'::uuid as owner_id, '98000000-0000-4000-8000-000000000001'::uuid as session_id,
  '00000000-0000-4000-8000-000000000001'::uuid as b1;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'expiry-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Expiry Owner"}'::jsonb from expiry_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = (select owner_id from expiry_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at) select session_id, owner_id, now(), now() from expiry_fixture;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from expiry_fixture), 'role', 'authenticated',
  'session_id', (select session_id from expiry_fixture))::text, true);

select lives_ok(format($$ select public.record_inventory_transactions(%L, %L::jsonb) $$, (select b1 from expiry_fixture),
  '[{"ingredient_id":"eggs","type":"stock_in","quantity":30,"transaction_date":"2026-11-01","batch_reference":"EXP-TEST-EGGS-AUTO"},
    {"ingredient_id":"eggs","type":"stock_in","quantity":30,"transaction_date":"2026-11-01","expiration_date":"2026-11-20","batch_reference":"EXP-TEST-EGGS-PRINTED"},
    {"ingredient_id":"cabbage","type":"stock_in","quantity":1000,"transaction_date":"2026-11-18","batch_reference":"EXP-TEST-CABBAGE"},
    {"ingredient_id":"salt","type":"stock_in","quantity":5,"transaction_date":"2026-11-18","batch_reference":"EXP-TEST-SALT"},
    {"ingredient_id":"prepared-batter","type":"stock_in","quantity":5,"transaction_date":"2026-11-24","batch_reference":"EXP-TEST-BATTER"}]'),
  'stock is received');

select is((select expiration_date from public.ingredient_batches where batch_reference = 'EXP-TEST-EGGS-AUTO'), '2026-11-29'::date,
  'no printed date: eggs received 1 Nov expire on 29 Nov (28 days)');
select is((select expiration_date from public.ingredient_batches where batch_reference = 'EXP-TEST-EGGS-PRINTED'), '2026-11-20'::date,
  'a printed date is kept as entered');
select is((select expiration_date from public.ingredient_batches where batch_reference = 'EXP-TEST-CABBAGE'), '2026-11-23'::date,
  'cabbage received 18 Nov expires on 23 Nov (5 days)');
select is((select expiration_date from public.ingredient_batches where batch_reference = 'EXP-TEST-SALT'), null::date,
  'an item without a shelf life gets no expiration date');
select is((select expiration_date from public.ingredient_batches where batch_reference = 'EXP-TEST-BATTER'), '2026-11-25'::date,
  'prepared batter made on 24 Nov is due on 25 Nov (1 day)');

select * from finish();
rollback;
