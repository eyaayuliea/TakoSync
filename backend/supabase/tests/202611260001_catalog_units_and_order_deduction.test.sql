-- Catalog units and per-order deduction (migration 202611260001): the five items now
-- in the catalog's unit, a unit change that cannot be converted, and a sale that
-- deducts every ingredient and supply. Runs inside one transaction that is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

-- The catalog as loaded -------------------------------------------------------------------
select results_eq(
  $$select id, name, unit, quantity_precision::int from public.ingredients
    where id in ('salt','baking-powder','cheese-cubes','crab-sticks','dashi') order by 1$$,
  $$values ('baking-powder'::text, 'Baking powder'::text, 'g'::text, 1), ('cheese-cubes', 'Cheese', 'g', 0),
           ('crab-sticks', 'Crab stick', 'g', 0), ('dashi', 'Dashi powder', 'g', 0), ('salt', 'Salt', 'g', 0)$$,
  'salt, baking powder, cheese, crab stick and dashi powder are in grams; dashi is named Dashi powder');
select results_eq(
  $$select ingredient_id, package_quantity, package_unit from public.ingredient_package_sizes
    where ingredient_id in ('salt','baking-powder','cheese-cubes','crab-sticks','dashi') order by 1$$,
  $$values ('baking-powder'::text, 100.000::numeric, 'g'::text), ('cheese-cubes', 200.000, 'g'), ('crab-sticks', 250.000, 'g'),
           ('dashi', 500.000, 'g'), ('salt', 500.000, 'g')$$,
  'their pack sizes are the catalog''s');
select is(
  (select count(*)::int from public.branch_inventory bi
    join public.branches b on b.id = bi.branch_id and b.active
    join public.ingredients i on i.id = bi.ingredient_id and i.active
    where bi.minimum_stock = 0),
  0, 'every active item has a minimum stock in every active branch');
select results_eq(
  $$select shelf_life_days, near_expiration_days, expiration_tracking from public.ingredients where id = 'dashi'$$,
  $$values (365, 30, true)$$, 'dashi powder has its expiry rule (12 months, alert 30 days before)');
select results_eq(
  $$select ingredient_id, quantity_required, unit_of_measure from public.shared_recipe_ingredients
    where ingredient_id in ('salt','baking-powder','dashi') order by 1$$,
  $$values ('baking-powder'::text, 12.500000::numeric, 'g'::text), ('dashi', 10.000000, 'g'), ('salt', 15.000000, 'g')$$,
  'the batter recipe is in grams (2.5 tsp of salt = 15 g, of baking powder = 12.5 g; dashi powder starts at 10 g)');

-- Recipe lines from the Order Usage tab ---------------------------------------------------------
select results_eq(
  $$select r.ingredient_id, r.quantity_required, r.unit_of_measure, r.consumption_basis
    from public.recipes r join public.products p on p.id = r.product_id
    where p.internal_code = 'combo_crab_cheese' and r.automatic_consumption_enabled order by 1$$,
  $$values ('bonito-flakes'::text, 2.000::numeric(12,3), 'g'::text, 'per_order'::text), ('cabbage', 3.000, 'g', 'per_piece'),
           ('cheese-cubes', 5.000, 'g', 'per_piece'), ('crab-sticks', 5.000, 'g', 'per_piece'),
           ('japanese-mayonnaise', 10.000, 'ml', 'per_order'), ('octopus', 8.000, 'g', 'per_piece'),
           ('packaging', 1.000, 'pcs', 'per_order'), ('sauces', 15.000, 'ml', 'per_order'),
           ('takoyaki-picks', 1.000, 'pcs', 'per_order')$$,
  'Crab / Cheese deducts its fillings per piece and its sauces, packaging and pick per order');
select is(
  (select count(*)::int from public.recipes r join public.products p on p.id = r.product_id
    where p.internal_code = 'flavor_octobits' and r.ingredient_id in ('cheese-cubes', 'crab-sticks', 'bacon-bits')),
  0, 'a product without cheese, crab or bacon has no line for them');
select throws_ok(
  $$insert into public.recipes (product_id, ingredient_id, quantity_required, unit_of_measure, consumption_basis)
    select id, 'eggs', 1, 'pcs', 'per_dozen' from public.products where internal_code = 'flavor_octobits'$$,
  '23514', null, 'a recipe line is per order or per piece, nothing else');

-- A unit that cannot be converted: the balance restarts at 0 ------------------------------------
create temporary table unit_fixture on commit drop as
select
  'a6000000-0000-4000-8000-000000000001'::uuid as owner_id,
  'a6000000-0000-4000-8000-000000000002'::uuid as staff_id,
  'a6000000-0000-4000-8000-000000000011'::uuid as owner_session_id,
  'a6000000-0000-4000-8000-000000000012'::uuid as staff_session_id,
  '00000000-0000-4000-8000-000000000001'::uuid as b1,
  (select id from public.products where internal_code = 'flavor_octobits') as octobits_id,
  (select id from public.menu_addons where addon_code = 'flakes') as flakes_id;
grant select on unit_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'usage-owner@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Usage Owner"}'::jsonb from unit_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'usage-staff@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Usage Staff"}'::jsonb from unit_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false where id = (select owner_id from unit_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900601', branch_id = (select b1 from unit_fixture), active = true, must_change_password = false where id = (select staff_id from unit_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from unit_fixture union all select staff_session_id, staff_id, now(), now() from unit_fixture;

-- A throwaway item counted in pieces: 12 on hand in one lot, used by a product and an add-on.
insert into public.ingredients (id, category_id, name, unit, quantity_precision, active, expiration_tracking)
values ('unit-test-topping', 'supplies', 'Unit test topping', 'pcs', 0, true, false);
insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock)
select b1, 'unit-test-topping', 0, 0 from unit_fixture
on conflict do nothing;
insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type, quantity, unit, movement, before_quantity, after_quantity)
select 'USAGE-TEST-IN', b1, 'unit-test-topping', owner_id, 'stock_in', 12, 'pcs', 12, 0, 12 from unit_fixture;
update public.branch_inventory set quantity = 12, minimum_stock = 3
where ingredient_id = 'unit-test-topping' and branch_id = (select b1 from unit_fixture);
insert into public.ingredient_batches (branch_id, ingredient_id, batch_reference, quantity_received, quantity_remaining)
select b1, 'unit-test-topping', 'USAGE-TEST-LOT', 12, 12 from unit_fixture;
insert into public.recipes (product_id, ingredient_id, quantity_required, unit_of_measure, automatic_consumption_enabled)
select octobits_id, 'unit-test-topping', 1, 'pcs', true from unit_fixture;
insert into public.addon_recipes (addon_id, ingredient_id, quantity_required, unit_of_measure)
select flakes_id, 'unit-test-topping', 1, 'pcs' from unit_fixture;

select lives_ok($$ select private.restart_ingredient_unit('unit-test-topping', 'pcs', 'g') $$, 'the unit change runs');
select results_eq(
  $$select i.unit, bi.quantity, bi.minimum_stock from public.ingredients i
    join public.branch_inventory bi on bi.ingredient_id = i.id and bi.branch_id = '00000000-0000-4000-8000-000000000001'
    where i.id = 'unit-test-topping'$$,
  $$values ('g'::text, 0.000::numeric(12,3), 0.000::numeric(12,3))$$,
  'the item is in grams and its balance and minimum restart at 0');
select is((select quantity_remaining from public.ingredient_batches where batch_reference = 'USAGE-TEST-LOT'), 0.000::numeric,
  'the open lot is closed');
select results_eq(
  $$select type::text, quantity, unit, movement, before_quantity, after_quantity, reason from public.inventory_movements
    where ingredient_id = 'unit-test-topping' and notes = 'unit change'$$,
  $$values ('adjustment'::text, 12.000::numeric(12,3), 'pcs'::text, -12.000::numeric(12,3), 12.000::numeric(12,3), 0.000::numeric(12,3),
    'Unit changed from pcs to g. An amount in pcs cannot be converted to g, so the balance restarts at 0; record the stock on hand again in g'::text)$$,
  'one ledger entry removes the old balance and says why');
select is(
  (select sum(movement) from public.inventory_movements where ingredient_id = 'unit-test-topping'),
  0.000::numeric, 'the balance still equals the sum of the ledger');
select is(
  (select automatic_consumption_enabled from public.recipes where ingredient_id = 'unit-test-topping'),
  false, 'a product recipe line in the old unit is switched off, not deleted');
select is((select count(*)::int from public.addon_recipes where ingredient_id = 'unit-test-topping'), 0,
  'an add-on recipe line in the old unit is removed');
select lives_ok($$ select private.restart_ingredient_unit('unit-test-topping', 'pcs', 'g') $$, 'running it again does nothing');
select is((select count(*)::int from public.inventory_movements where ingredient_id = 'unit-test-topping' and notes = 'unit change'), 1,
  'no second entry');

-- A sale deducts every ingredient and supply ---------------------------------------------------
create temporary table sale_fixture on commit drop as
select
  (select v.id from public.product_variants v join public.products p on p.id = v.product_id
    where p.internal_code = 'combo_crab_cheese' and v.variant_code = '8pcs') as crab_cheese_8,
  (select v.price from public.product_variants v join public.products p on p.id = v.product_id
    where p.internal_code = 'combo_crab_cheese' and v.variant_code = '8pcs') as crab_cheese_8_price,
  (select v.id from public.product_variants v join public.products p on p.id = v.product_id
    where p.internal_code = 'flavor_octobits' and v.variant_code = '4pcs') as octobits_4,
  (select v.price from public.product_variants v join public.products p on p.id = v.product_id
    where p.internal_code = 'flavor_octobits' and v.variant_code = '4pcs') as octobits_4_price,
  (select v.id from public.product_variants v join public.products p on p.id = v.product_id
    where p.internal_code = 'flavor_cheese' and v.variant_code = '4pcs') as cheese_4,
  (select v.price from public.product_variants v join public.products p on p.id = v.product_id
    where p.internal_code = 'flavor_cheese' and v.variant_code = '4pcs') as cheese_4_price;
grant select on sale_fixture to authenticated;

delete from public.recipes where ingredient_id = 'unit-test-topping';
update public.products set is_available = true where internal_code in ('combo_crab_cheese', 'flavor_octobits', 'flavor_cheese');
update public.branch_inventory set quantity = 10000 where branch_id = (select b1 from unit_fixture);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from unit_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from unit_fixture))::text, true);

select results_eq(
  format($$select r->>'ingredient_id', (r->>'per_unit')::numeric
    from jsonb_array_elements(public.sale_stock_requirements('00000000-0000-4000-8000-000000000001')->'requirements') r
    where r->>'variant_id' = %L and r->>'ingredient_id' <> 'prepared-batter' order by 1$$, (select crab_cheese_8 from sale_fixture)),
  $$values ('bonito-flakes'::text, 2::numeric), ('cabbage', 24), ('cheese-cubes', 40), ('crab-sticks', 40),
           ('japanese-mayonnaise', 10), ('octopus', 64), ('packaging', 1), ('sauces', 15), ('takoyaki-picks', 1)$$,
  'the POS is told what one Crab / Cheese 8 pcs needs: per-piece amounts x 8, per-order amounts once');

select lives_ok(format($$ select public.submit_sale('USAGE-TEST-SALE', '00000000-0000-4000-8000-000000000001', 'Cash', %s,
    jsonb_build_array(
      jsonb_build_object('variant_id', %L, 'quantity', 1, 'unit_price', %s),
      jsonb_build_object('variant_id', %L, 'quantity', 2, 'unit_price', %s)),
    '[]'::jsonb) $$,
  (select crab_cheese_8_price + 2 * octobits_4_price from sale_fixture),
  (select crab_cheese_8 from sale_fixture), (select crab_cheese_8_price from sale_fixture),
  (select octobits_4 from sale_fixture), (select octobits_4_price from sale_fixture)),
  'one Crab / Cheese 8 pcs and two Octobits 4 pcs are sold');

reset role;
select results_eq(
  $$select s.ingredient_id, sum(s.quantity_consumed) from public.sale_consumption_snapshots s
    join public.sales x on x.id = s.sale_id
    where x.transaction_reference = 'USAGE-TEST-SALE' and s.recipe_type = 'product' group by 1 order by 1$$,
  $$values ('bonito-flakes'::text, 6::numeric), ('cabbage', 48), ('cheese-cubes', 40), ('crab-sticks', 40),
           ('japanese-mayonnaise', 30), ('octopus', 128), ('packaging', 3), ('sauces', 45), ('takoyaki-picks', 3)$$,
  '16 pieces in 3 servings: octopus 128 g, cabbage 48 g, crab and cheese 40 g each (8 pieces), 3 of each per-order item');
select ok(
  (select sum(s.quantity_consumed) > 0 from public.sale_consumption_snapshots s join public.sales x on x.id = s.sale_id
    where x.transaction_reference = 'USAGE-TEST-SALE' and s.recipe_type = 'shared' and s.ingredient_id = 'prepared-batter'),
  'the prepared batter is still deducted');
select results_eq(
  $$select ingredient_id, quantity from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id in ('octopus', 'takoyaki-picks', 'packaging', 'cheese-cubes') order by 1$$,
  $$values ('cheese-cubes'::text, 9960.000::numeric(12,3)), ('octopus', 9872.000), ('packaging', 9997.000), ('takoyaki-picks', 9997.000)$$,
  'the stock of octopus, cheese, packaging and picks went down');
select is(
  (select count(*)::int from public.inventory_movements m join public.sales x on x.id = m.sale_id
    where x.transaction_reference = 'USAGE-TEST-SALE' and m.type = 'sales_consumption'),
  10, 'each of the ten items has its Sales Consumption entry');

-- An ingredient that has run out stops only the products that use it ----------------------------------
update public.branch_inventory set quantity = 0
where branch_id = (select b1 from unit_fixture) and ingredient_id = 'cheese-cubes';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select staff_id from unit_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from unit_fixture))::text, true);

select is(
  (public.sale_stock_requirements('00000000-0000-4000-8000-000000000001')->'stock'->>'cheese-cubes')::numeric,
  0::numeric, 'the POS sees that there is no cheese, so it tags the cheese sizes Out of Stock');
select throws_like(format($$ select public.submit_sale('USAGE-TEST-NO-CHEESE', '00000000-0000-4000-8000-000000000001', 'Cash', %s,
    jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1, 'unit_price', %s)), '[]'::jsonb) $$,
  (select cheese_4_price from sale_fixture), (select cheese_4 from sale_fixture), (select cheese_4_price from sale_fixture)),
  'Order changed: Insufficient stock%', 'a Cheese Takoyaki cannot be sold while there is no cheese');
select lives_ok(format($$ select public.submit_sale('USAGE-TEST-NO-CHEESE-OK', '00000000-0000-4000-8000-000000000001', 'Cash', %s,
    jsonb_build_array(jsonb_build_object('variant_id', %L, 'quantity', 1, 'unit_price', %s)), '[]'::jsonb) $$,
  (select octobits_4_price from sale_fixture), (select octobits_4 from sale_fixture), (select octobits_4_price from sale_fixture)),
  'an Octobits Takoyaki, which has no cheese, still sells');

select * from finish();
rollback;
