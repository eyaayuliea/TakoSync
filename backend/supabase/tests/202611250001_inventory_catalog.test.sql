-- Inventory catalog (migration 202611250001): the loaded catalog, and the unit
-- change as a recorded cut-over. Runs inside one transaction that is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

-- The catalog as loaded -------------------------------------------------------------------
select results_eq(
  $$select id, unit from public.ingredients where id in ('flour','octopus','sauces','japanese-mayonnaise','soy-sauce','packaging','takoyaki-picks') order by 1$$,
  $$values ('flour'::text, 'g'::text), ('japanese-mayonnaise', 'ml'), ('octopus', 'g'), ('packaging', 'pcs'), ('sauces', 'ml'), ('soy-sauce', 'ml'), ('takoyaki-picks', 'pcs')$$,
  'the six convertible items and Takoyaki picks use the catalog units');
select results_eq(
  $$select id, unit from public.ingredients where id in ('salt','baking-powder','cheese-cubes','dashi') order by 1$$,
  $$values ('baking-powder'::text, 'tsp'::text), ('cheese-cubes', 'pcs'), ('dashi', 'L'), ('salt', 'tsp')$$,
  'salt, baking powder, cheese and dashi wait for the owner''s amounts in grams');
select is((select active from public.ingredients where id = 'octobits'), false, 'Octobits is hidden as an inventory item');
select is((select count(*)::int from public.recipes where ingredient_id = 'octobits'), 0, 'no recipe points at the hidden item');
select results_eq(
  $$select bi.ingredient_id, min(bi.minimum_stock), count(*)::int from public.branch_inventory bi
    join public.branches b on b.id = bi.branch_id and b.active
    where bi.ingredient_id in ('flour','eggs','prepared-batter','takoyaki-picks') group by 1 order by 1$$,
  $$values ('eggs'::text, 30.000::numeric(12,3), 3), ('flour', 2000.000, 3), ('prepared-batter', 5.000, 3), ('takoyaki-picks', 200.000, 3)$$,
  'low-stock thresholds from the sheet are set for all three branches');
select results_eq(
  $$select ingredient_id, package_label, package_quantity, package_unit from public.ingredient_package_sizes
    where ingredient_id in ('flour','eggs','sauces','prepared-batter') order by 1$$,
  $$values ('eggs'::text, 'One tray'::text, 30.000::numeric, 'pcs'::text), ('flour', 'One bag', 1000.000, 'g'),
           ('prepared-batter', 'One bottle', 680.000, 'ml'), ('sauces', 'One bottle', 1000.000, 'ml')$$,
  'pack sizes from the sheet are loaded; the batter bottle stays 680 ml');
select results_eq(
  $$select i.ingredient_id, i.quantity_required, i.unit_of_measure from public.shared_recipe_ingredients i
    where i.ingredient_id in ('flour','soy-sauce') order by 1$$,
  $$values ('flour'::text, 625.000::numeric, 'g'::text), ('soy-sauce', 75.000, 'ml')$$,
  'the batter recipe is in the new units (0.625 kg = 625 g, 5 tbsp = 75 ml)');

-- A unit change on live data: salt, 10 tsp on hand in two lots, tsp -> g at 6 g per tsp ----
create temporary table unit_fixture on commit drop as
select '96000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '00000000-0000-4000-8000-000000000001'::uuid as b1, gen_random_uuid() as old_stock_in_id;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'unit-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Unit Owner"}'::jsonb from unit_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = (select owner_id from unit_fixture);

delete from public.inventory_movements where ingredient_id = 'salt' and branch_id = (select b1 from unit_fixture);
delete from public.ingredient_batches where ingredient_id = 'salt' and branch_id = (select b1 from unit_fixture);
insert into public.inventory_movements (id, reference, branch_id, ingredient_id, actor_id, type, quantity, unit, movement, before_quantity, after_quantity)
select old_stock_in_id, 'UNIT-TEST-IN', b1, 'salt', owner_id, 'stock_in', 10, 'tsp', 10, 0, 10 from unit_fixture;
update public.branch_inventory set quantity = 10, minimum_stock = 2
where ingredient_id = 'salt' and branch_id = (select b1 from unit_fixture);
insert into public.ingredient_batches (branch_id, ingredient_id, batch_reference, quantity_received, quantity_remaining)
select b1, 'salt', 'UNIT-TEST-LOT-A', 6, 6 from unit_fixture union all select b1, 'salt', 'UNIT-TEST-LOT-B', 5, 4 from unit_fixture;

select lives_ok($$ select private.change_ingredient_unit('salt', 'tsp', 'g', 6) $$, 'the unit change runs');

select results_eq(
  $$select i.unit, i.quantity_precision::int, bi.quantity, bi.minimum_stock from public.ingredients i
    join public.branch_inventory bi on bi.ingredient_id = i.id and bi.branch_id = '00000000-0000-4000-8000-000000000001' where i.id = 'salt'$$,
  $$values ('g'::text, 0, 60.000::numeric(12,3), 12.000::numeric(12,3))$$,
  'the balance and the minimum level are converted (10 tsp = 60 g, 2 tsp = 12 g)');
select results_eq(
  $$select batch_reference, quantity_received, quantity_remaining from public.ingredient_batches
    where ingredient_id = 'salt' and batch_reference like 'UNIT-TEST-LOT-%' order by 1$$,
  $$values ('UNIT-TEST-LOT-A'::text, 36.000::numeric(12,3), 36.000::numeric(12,3)), ('UNIT-TEST-LOT-B', 30.000, 24.000)$$,
  'the open lots are converted');
select results_eq(
  $$select type::text, movement, unit, before_quantity, after_quantity, reason from public.inventory_movements
    where ingredient_id = 'salt' and notes = 'unit change' and branch_id = '00000000-0000-4000-8000-000000000001'$$,
  $$values ('adjustment'::text, 50.000::numeric(12,3), 'g'::text, 10.000::numeric(12,3), 60.000::numeric(12,3),
    'Unit changed from tsp to g (1 tsp = 6 g); no stock was added or removed'::text)$$,
  'one ledger entry records the change and says no stock moved');
select is(
  (select sum(movement) from public.inventory_movements where ingredient_id = 'salt' and branch_id = (select b1 from unit_fixture)),
  60.000::numeric, 'the balance still equals the sum of the ledger');
select results_eq(
  $$select quantity, unit from public.inventory_movements where reference = 'UNIT-TEST-IN'$$,
  $$values (10.000::numeric(12,3), 'tsp'::text)$$,
  'the earlier ledger row keeps the unit it was recorded in');
select results_eq(
  $$select quantity_required, unit_of_measure from public.shared_recipe_ingredients where ingredient_id = 'salt'$$,
  $$values (15.000::numeric, 'g'::text)$$,
  'the recipe line is converted (2.5 tsp = 15 g)');
select lives_ok($$ select private.change_ingredient_unit('salt', 'tsp', 'g', 6) $$, 'running it again does nothing');
select is((select count(*)::int from public.inventory_movements where ingredient_id = 'salt' and notes = 'unit change'), 1,
  'no second conversion entry');

-- An entry from before the change cannot be reversed automatically.
-- (The approval check is switched off inside this rolled-back transaction so the unit check is reached.)
alter table public.inventory_movements disable trigger inventory_movements_reject_unimplemented;
select throws_ok(
  format($$insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type, reverses_movement_id,
    quantity, unit, movement, before_quantity, after_quantity)
    values ('UNIT-TEST-REV', %L, 'salt', %L, 'entry_reversal', %L, 10, 'tsp', -10, 60, 50)$$,
    (select b1 from unit_fixture), (select owner_id from unit_fixture), (select old_stock_in_id from unit_fixture)),
  'P0001', 'This was recorded in tsp before the item changed to g, so it cannot be reversed automatically. Record a correction instead.',
  'a reversal in the old unit is refused with the reason');

select * from finish();
rollback;
