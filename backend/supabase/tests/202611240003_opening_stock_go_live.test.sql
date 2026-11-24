-- OW-28 c5–c8: opening stock once per item and branch; go-live locks it.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(13);

create temporary table open_fixture on commit drop as
select
  '91000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '92000000-0000-4000-8000-000000000001'::uuid as staff_id,
  '93000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  '93000000-0000-4000-8000-000000000002'::uuid as staff_session_id,
  '00000000-0000-4000-8000-000000000001'::uuid as branch_id;
grant select on open_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'open-owner@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Open Owner"}'::jsonb from open_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'open-staff@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Open Staff"}'::jsonb from open_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false where id = (select owner_id from open_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900501', branch_id = (select branch_id from open_fixture), active = true, must_change_password = false where id = (select staff_id from open_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from open_fixture union all select staff_session_id, staff_id, now(), now() from open_fixture;

delete from public.business_go_live;
delete from public.opening_stock_entries;
update public.branch_inventory set quantity = 10 where branch_id = (select branch_id from open_fixture) and ingredient_id in ('salt', 'cabbage', 'dashi');

set local role authenticated;
-- Staff ------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from open_fixture), 'role', 'authenticated', 'session_id', (select staff_session_id from open_fixture))::text, true);
select throws_ok(format($$ select public.record_opening_stock(%L, 'salt', 5) $$, (select branch_id from open_fixture)), '42501', null, 'staff cannot enter opening stock');

-- Owner ------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from open_fixture), 'role', 'authenticated', 'session_id', (select owner_session_id from open_fixture))::text, true);
select lives_ok(format($$ select public.record_opening_stock(%L, 'salt', 25) $$, (select branch_id from open_fixture)), 'c5: the owner enters an opening stock above the current balance');
select lives_ok(format($$ select public.record_opening_stock(%L, 'cabbage', 4) $$, (select branch_id from open_fixture)), 'c5: and one below it');
select lives_ok(format($$ select public.record_opening_stock(%L, 'dashi', 10) $$, (select branch_id from open_fixture)), 'c5: and one equal to it');
select throws_ok(format($$ select public.record_opening_stock(%L, 'salt', 30) $$, (select branch_id from open_fixture)), 'P0001',
  'The opening stock of Salt at Branch 1 was already entered. It can be entered only once.', 'c6: once per item and branch');
select throws_ok(format($$ select public.record_opening_stock(%L, 'eggs', -1) $$, (select branch_id from open_fixture)), 'P0001',
  'The opening stock must be zero or greater.', 'c9: a negative opening stock is rejected');
select throws_ok($$ select public.set_business_go_live(current_date + 30) $$, 'P0001', 'The go-live date cannot be in the future.', 'the go-live date cannot be in the future');
select lives_ok($$ select public.set_business_go_live((now() at time zone 'Asia/Manila')::date) $$, 'c7: the owner sets the go-live date');
select throws_ok(format($$ select public.record_opening_stock(%L, 'eggs', 5) $$, (select branch_id from open_fixture)), 'P0001', null, 'c8: the opening stock is locked after go-live');
select throws_ok(format($$ update public.branch_inventory set quantity = 99 where branch_id = %L and ingredient_id = 'salt' $$, (select branch_id from open_fixture)),
  '42501', null, 'c7: a direct quantity change by a signed-in user is refused');

-- The ledger functions run as their owner, so recorded transactions still work.
reset role;
select lives_ok(format($$ select * from public.record_inventory_transactions(%L, '[{"ingredient_id":"salt","type":"stock_in","quantity":1,"reason":"Stock-In"}]'::jsonb) $$,
  (select branch_id from open_fixture)), 'c7: recorded transactions still change stock after go-live');
select is((select string_agg(trim_scale(quantity)::text, ',' order by ingredient_id) from public.branch_inventory
  where branch_id = (select branch_id from open_fixture) and ingredient_id in ('cabbage', 'dashi', 'salt')), '4,10,26',
  'balances: cabbage 10→4, salt 10→25 (+1 later), dashi unchanged');
select is((select string_agg(e.ingredient_id || ':' || coalesce(m.type::text, 'none') || ':' || coalesce(trim_scale(m.movement)::text, '-'), ',' order by e.ingredient_id)
  from public.opening_stock_entries e left join public.inventory_movements m on m.id = e.inventory_movement_id), 'cabbage:adjustment:-6,dashi:none:-,salt:stock_in:15',
  'opening entries post the difference through the ledger');

select * from finish();
rollback;
