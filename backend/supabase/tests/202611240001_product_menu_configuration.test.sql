-- OW-21: product flavor and portion type, product add-ons, Bulk Order threshold.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

create temporary table menu_fixture on commit drop as
select
  '71000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '72000000-0000-4000-8000-000000000001'::uuid as staff_id,
  '73000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  '73000000-0000-4000-8000-000000000002'::uuid as staff_session_id,
  gen_random_uuid() as product_id,
  gen_random_uuid() as addon_id;
grant select on menu_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'menu-owner@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Menu Owner"}'::jsonb from menu_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'menu-staff@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Menu Staff"}'::jsonb from menu_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false where id = (select owner_id from menu_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900301', branch_id = '00000000-0000-4000-8000-000000000001'::uuid, active = true, must_change_password = false where id = (select staff_id from menu_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from menu_fixture union all select staff_session_id, staff_id, now(), now() from menu_fixture;

insert into public.products (id, product_name, description, price, flavor, portion_type)
select product_id, 'Menu Test / Cheese', 'Fixture', 99, 'Menu Test', 'Combo + Cheese' from menu_fixture;
insert into public.menu_addons (id, addon_code, addon_name, price) select addon_id, 'menu-test-sauce', 'Menu test sauce', 15 from menu_fixture;

select throws_ok($$ update public.products set portion_type = 'Large' where product_name = 'Menu Test / Cheese' $$,
  '23514', null, 'c2: the portion type is Regular or Combo + Cheese');
select is((select flavor || ' / ' || portion_type from public.products where product_name = 'Octobits / Cheese'), 'Octobits / Combo + Cheese',
  'existing products get their flavor and portion type from their names');
select is((select bulk_order_threshold from public.owner_inventory_settings where id), 5, 'c10: the Bulk Order threshold defaults to 5');
select throws_ok($$ update public.owner_inventory_settings set bulk_order_threshold = 0 where id $$, '23514', null, 'the threshold is at least 1');

-- Staff ----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from menu_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from menu_fixture))::text, true);
select throws_ok(format('insert into public.product_addons (product_id, addon_id) values (%L, %L)',
  (select product_id from menu_fixture), (select addon_id from menu_fixture)), '42501', null, 'staff cannot link add-ons');

-- Owner ----------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from menu_fixture), 'role', 'authenticated',
  'session_id', (select owner_session_id from menu_fixture))::text, true);
select lives_ok(format('insert into public.product_addons (product_id, addon_id) values (%L, %L)',
  (select product_id from menu_fixture), (select addon_id from menu_fixture)), 'c5: the owner links an add-on to a product');
select lives_ok($$ update public.owner_inventory_settings set bulk_order_threshold = 8 where id $$, 'c10: the owner changes the threshold');

-- Staff read the links and the threshold (the POS uses both) -----------------
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from menu_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from menu_fixture))::text, true);
select is((select count(*)::int from public.product_addons where product_id = (select product_id from menu_fixture)), 1, 'staff read the product add-ons');
select is((select bulk_order_threshold from public.owner_inventory_settings where id), 8, 'staff read the threshold');

select * from finish();
rollback;
