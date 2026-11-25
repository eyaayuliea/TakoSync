-- OW-22 c7: an add-on's recipe is consumed when the add-on is sold.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

create temporary table addon_fixture on commit drop as
select
  '81000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '82000000-0000-4000-8000-000000000001'::uuid as staff_id,
  '83000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  '83000000-0000-4000-8000-000000000002'::uuid as staff_session_id,
  (select v.id from public.product_variants v join public.products p on p.id = v.product_id
    where p.product_name = 'Octobits Takoyaki' and v.variant_code = '4pcs') as variant_id,
  (select v.price from public.product_variants v join public.products p on p.id = v.product_id
    where p.product_name = 'Octobits Takoyaki' and v.variant_code = '4pcs') as variant_price,
  (select id from public.menu_addons where addon_name ilike 'takoyaki sauce' limit 1) as addon_id,
  (select price from public.menu_addons where addon_name ilike 'takoyaki sauce' limit 1) as addon_price;
grant select on addon_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'addon-owner@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Addon Owner"}'::jsonb from addon_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'addon-staff@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Addon Staff"}'::jsonb from addon_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false where id = (select owner_id from addon_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900401', branch_id = '00000000-0000-4000-8000-000000000001'::uuid, active = true, must_change_password = false where id = (select staff_id from addon_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from addon_fixture union all select staff_session_id, staff_id, now(), now() from addon_fixture;

-- Enough stock for one sale.
update public.branch_inventory set quantity = 5000 where branch_id = '00000000-0000-4000-8000-000000000001'::uuid;
-- 202611260001 gives the standard add-ons a starting recipe; this test sets its own.
delete from public.addon_recipes where addon_id = (select addon_id from addon_fixture);
update public.products set is_available = true where product_name = 'Octobits Takoyaki';
update public.menu_addons set active = true where id = (select addon_id from addon_fixture);

-- Owner ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from addon_fixture), 'role', 'authenticated',
  'session_id', (select owner_session_id from addon_fixture))::text, true);
select lives_ok(format($$ insert into public.addon_recipes (addon_id, ingredient_id, quantity_required, unit_of_measure) values (%L, 'sauces', 20, 'ml') $$,
  (select addon_id from addon_fixture)), 'c7: the owner gives an add-on a recipe');
select throws_ok(format($$ insert into public.addon_recipes (addon_id, ingredient_id, quantity_required, unit_of_measure) values (%L, 'salt', 0, 'tsp') $$,
  (select addon_id from addon_fixture)), '23514', null, 'the required quantity is greater than zero');

-- Staff ------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from addon_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from addon_fixture))::text, true);
-- Row security: a staff delete matches no rows.
delete from public.addon_recipes where addon_id = (select addon_id from addon_fixture);
select is((select count(*)::int from public.addon_recipes where addon_id = (select addon_id from addon_fixture)), 1,
  'staff cannot remove add-on recipes');

select lives_ok(format($$ select public.submit_sale('ADDON-RECIPE-TEST', '00000000-0000-4000-8000-000000000001', 'Cash', %s,
    jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1, 'unit_price', %s)),
    jsonb_build_array(jsonb_build_object('addon_id', %L, 'quantity', 2, 'unit_price', %s))) $$,
  (select variant_price + 2 * addon_price from addon_fixture), (select variant_id from addon_fixture), (select variant_price from addon_fixture),
  (select addon_id from addon_fixture), (select addon_price from addon_fixture)), 'a sale with two add-ons is recorded');

reset role;
select is((select quantity_consumed from public.sale_consumption_snapshots s join public.sales x on x.id = s.sale_id
  where x.transaction_reference = 'ADDON-RECIPE-TEST' and s.recipe_type = 'addon' and s.ingredient_id = 'sauces'), 40::numeric,
  'c7: two add-ons consume twice the recipe quantity (40 ml)');
select ok(exists (select 1 from public.inventory_movements m join public.sales x on x.id = m.sale_id
  where x.transaction_reference = 'ADDON-RECIPE-TEST' and m.ingredient_id = 'sauces' and m.type = 'sales_consumption'),
  'the add-on consumption is posted as Sales Consumption');

select * from finish();
rollback;
