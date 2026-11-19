update public.ingredients
set unit = 'g',
    quantity_precision = 2
where id in ('octopus', 'octobits', 'cheese-cubes', 'bacon-bits');

delete from public.recipes
where ingredient_id = 'octobits';

insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock)
select octobits.branch_id,
       'octopus',
       coalesce((select octopus.quantity
                 from public.branch_inventory octopus
                 where octopus.branch_id = octobits.branch_id
                   and octopus.ingredient_id = 'octopus'), 0)
       + octobits.quantity,
       coalesce((select octopus.minimum_stock
                 from public.branch_inventory octopus
                 where octopus.branch_id = octobits.branch_id
                   and octopus.ingredient_id = 'octopus'), 0)
from public.branch_inventory octobits
where octobits.ingredient_id = 'octobits'
on conflict (branch_id, ingredient_id) do update
set quantity = excluded.quantity,
    minimum_stock = greatest(public.branch_inventory.minimum_stock, excluded.minimum_stock);

delete from public.branch_inventory
where ingredient_id = 'octobits';

update public.ingredients
set active = false
where id = 'octobits';

update public.ingredients
set unit = 'g',
    quantity_precision = 2
where id in ('flour', 'dashi', 'salt', 'baking-powder');

update public.ingredients
set unit = 'ml',
    quantity_precision = 2
where id in ('sauces', 'japanese-mayonnaise');

update public.ingredients
set unit = 'bottle',
    quantity_precision = 0
where id = 'prepared-batter';

update public.ingredients
set unit = 'g',
    quantity_precision = 2,
    name = 'Crab sticks'
where id = 'crab-sticks';

update public.ingredients
set name = 'Bacon'
where id = 'bacon-bits';

update public.ingredients
set unit = 'pcs',
    quantity_precision = 0
where id in ('eggs', 'packaging');

insert into public.ingredient_package_sizes (ingredient_id, package_quantity, package_unit, package_label)
values
  ('bonito-flakes', 1, 'kg', 'One package'),
  ('japanese-mayonnaise', 360, 'ml', 'One bottle'),
  ('packaging', 100, 'pcs', 'One pack'),
  ('prepared-batter', 680, 'ml', 'One 680 ml bottle'),
  ('sauces', 360, 'ml', 'One bottle')
on conflict (ingredient_id) do update
set package_quantity = excluded.package_quantity,
    package_unit = excluded.package_unit,
    package_label = excluded.package_label;

insert into public.recipes (
  product_id, ingredient_id, quantity_required, unit_of_measure,
  automatic_consumption_enabled
)
select product.id, recipe.ingredient_id, recipe.quantity_required,
       recipe.unit_of_measure, false
from public.products product
join (values
  ('flavor_octobits', 'octopus', 40::numeric, 'g'),
  ('flavor_cheese', 'cheese-cubes', 20::numeric, 'g'),
  ('flavor_crab', 'crab-sticks', 20::numeric, 'g'),
  ('flavor_bacon_bits', 'bacon-bits', 20::numeric, 'g'),
  ('combo_octobits_cheese_01', 'octopus', 20::numeric, 'g'),
  ('combo_octobits_cheese_01', 'cheese-cubes', 10::numeric, 'g'),
  ('combo_bacon_cheese', 'bacon-bits', 10::numeric, 'g'),
  ('combo_bacon_cheese', 'cheese-cubes', 10::numeric, 'g'),
  ('combo_crab_cheese', 'crab-sticks', 10::numeric, 'g'),
  ('combo_crab_cheese', 'cheese-cubes', 10::numeric, 'g')
) recipe(internal_code, ingredient_id, quantity_required, unit_of_measure)
  on recipe.internal_code = product.internal_code
on conflict (product_id, ingredient_id) do update
set quantity_required = excluded.quantity_required,
    unit_of_measure = excluded.unit_of_measure;
