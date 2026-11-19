begin;

-- Aligns the existing ingredient catalog with the approved names/categories/units and makes
-- insufficient-stock errors actionable. Idempotent; no rows are deleted, no recipe quantity
-- is touched, and no ingredient is duplicated (existing rows are renamed/recategorized).

-- 1. Categories: add the two that do not exist; rename two to the approved wording.
insert into public.ingredient_categories (id, name)
select 'meat', 'Meat'
where not exists (select 1 from public.ingredient_categories where id = 'meat' or lower(name) = 'meat');

insert into public.ingredient_categories (id, name)
select 'supplies', 'Supplies'
where not exists (select 1 from public.ingredient_categories where id = 'supplies' or lower(name) = 'supplies');

update public.ingredient_categories set name = 'Dairy'
where id = 'dairy-eggs' and name <> 'Dairy'
  and not exists (select 1 from public.ingredient_categories other where other.name = 'Dairy' and other.id <> 'dairy-eggs');

update public.ingredient_categories set name = 'Vegetables'
where id = 'produce' and name <> 'Vegetables'
  and not exists (select 1 from public.ingredient_categories other where other.name = 'Vegetables' and other.id <> 'produce');

-- 2. Ingredients: map existing rows (by id) to the approved names and categories.
with approved(id, new_name, new_category) as (
  values
    ('flour',               'All-Purpose Flour', 'dry-goods'),
    ('salt',                'Salt',              'dry-goods'),
    ('baking-powder',       'Baking Powder',     'dry-goods'),
    ('bonito-flakes',       'Bonito Flakes',     'dry-goods'),
    ('octopus',             'Octopus',           'seafood'),
    ('crab-sticks',         'Crab Stick',        'seafood'),
    ('eggs',                'Eggs',              'dairy-eggs'),
    ('cheese-cubes',        'Cheese',            'dairy-eggs'),
    ('dashi',               'Dashi Stock',       'condiments'),
    ('soy-sauce',           'Soy Sauce',         'condiments'),
    ('sauces',              'Takoyaki Sauce',    'condiments'),
    ('japanese-mayonnaise', 'Japanese Mayonnaise', 'condiments'),
    ('bacon-bits',          'Bacon',             'meat'),
    ('cabbage',             'Chopped Cabbage',   'produce'),
    ('packaging',           'Packaging',         'supplies')
)
update public.ingredients ingredient
set name = approved.new_name,
    category_id = approved.new_category
from approved
where ingredient.id = approved.id
  and (ingredient.name is distinct from approved.new_name
       or ingredient.category_id is distinct from approved.new_category)
  and exists (select 1 from public.ingredient_categories c where c.id = approved.new_category)
  and not exists (
    select 1 from public.ingredients other
    where other.name = approved.new_name and other.id <> ingredient.id
  );

-- 3. Bacon was seeded with the placeholder unit 'unknown', which can never match a Staff
--    transaction. It has no recipe line, movement or batch, so it is safe to give it grams
--    (same as the other weighed items).
update public.ingredients
set unit = 'g', quantity_precision = 0
where id = 'bacon-bits' and unit = 'unknown'
  and not exists (select 1 from public.inventory_movements where ingredient_id = 'bacon-bits')
  and not exists (select 1 from public.ingredient_batches where ingredient_id = 'bacon-bits')
  and not exists (select 1 from public.recipes where ingredient_id = 'bacon-bits')
  and not exists (select 1 from public.shared_recipe_ingredients where ingredient_id = 'bacon-bits');

-- 4. 'Japanese White Sauce' is an unused duplicate of Japanese Mayonnaise (no stock, movement,
--    batch or recipe reference in any branch). Deactivate it rather than deleting history.
update public.ingredients
set active = false
where id = 'japanese-white-sauce' and active
  and not exists (select 1 from public.branch_inventory where ingredient_id = 'japanese-white-sauce' and quantity <> 0)
  and not exists (select 1 from public.inventory_movements where ingredient_id = 'japanese-white-sauce')
  and not exists (select 1 from public.ingredient_batches where ingredient_id = 'japanese-white-sauce')
  and not exists (select 1 from public.recipes where ingredient_id = 'japanese-white-sauce')
  and not exists (select 1 from public.shared_recipe_ingredients where ingredient_id = 'japanese-white-sauce');

-- 5. Every active ingredient must be configured for every active branch.
insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock)
select branch.id, ingredient.id, 0, 0
from public.branches branch
cross join public.ingredients ingredient
where branch.active and ingredient.active
  and not exists (
    select 1 from public.branch_inventory existing
    where existing.branch_id = branch.id and existing.ingredient_id = ingredient.id
  );

-- 6. Insufficient-stock error: name the ingredient, required, available and shortage.
do $migration$
declare
  v_definition text;
  v_old constant text := $r$if v_after < 0 then raise exception 'Transaction exceeds available stock'; end if;$r$;
  v_new constant text := $r$if v_after < 0 then
      raise exception using
        errcode = '22023',
        message = format(
          'Insufficient stock for %s: required %s %s, available %s %s, shortage %s %s',
          v_ingredient.name, trim_scale(abs(v_movement)), v_ingredient.unit,
          trim_scale(v_inventory.quantity), v_ingredient.unit,
          trim_scale(abs(v_after)), v_ingredient.unit
        );
    end if;$r$;
begin
  v_definition := pg_get_functiondef('public.record_inventory_transactions(uuid, jsonb)'::regprocedure);
  if position(v_old in v_definition) = 0 then
    if position('Insufficient stock for' in v_definition) > 0 then
      return;
    end if;
    raise exception 'Expected insufficient-stock statement was not found';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

-- 7. Batter batch: check every raw ingredient up front and report all shortages together.
do $migration$
declare
  v_definition text;
  v_old constant text := 'perform public.record_inventory_transactions(p_branch_id, v_preparation_lines);';
  v_new constant text := $r$if exists (
    select 1
    from jsonb_to_recordset(v_preparation_lines) as line(ingredient_id text, type text, quantity numeric)
    join public.branch_inventory stock
      on stock.branch_id = p_branch_id and stock.ingredient_id = line.ingredient_id
    where line.type = 'usage' and stock.quantity < line.quantity
  ) then
    raise exception using
      errcode = '22023',
      message = 'Cannot record this batter batch. ' || (
        select string_agg(
          format(
            'Insufficient stock for %s: required %s %s, available %s %s, shortage %s %s',
            ingredient.name, trim_scale(line.quantity), ingredient.unit,
            trim_scale(stock.quantity), ingredient.unit,
            trim_scale(line.quantity - stock.quantity), ingredient.unit
          ),
          '; ' order by ingredient.name
        )
        from jsonb_to_recordset(v_preparation_lines) as line(ingredient_id text, type text, quantity numeric)
        join public.branch_inventory stock
          on stock.branch_id = p_branch_id and stock.ingredient_id = line.ingredient_id
        join public.ingredients ingredient on ingredient.id = line.ingredient_id
        where line.type = 'usage' and stock.quantity < line.quantity
      );
  end if;
  perform public.record_inventory_transactions(p_branch_id, v_preparation_lines);$r$;
begin
  v_definition := pg_get_functiondef('public.prepare_batter_batch(uuid, text)'::regprocedure);
  if position(v_old in v_definition) = 0 then
    if position('Cannot record this batter batch' in v_definition) > 0 then
      return;
    end if;
    raise exception 'Expected batter inventory recorder call was not found';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;

notify pgrst, 'reload schema';

commit;
