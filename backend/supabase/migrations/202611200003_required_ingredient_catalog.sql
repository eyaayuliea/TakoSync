begin;

-- Makes the ACTIVE ingredient catalog exactly the approved list (exact spelling/casing and
-- categories). Idempotent. NOT applied by this change set; review before any Development apply.
--
--   Dry Goods:  All-purpose flour, Salt, Baking powder, Bonito flakes
--   Seafood:    Octopus, Crab stick
--   Dairy:      Eggs, Cheese
--   Condiments: Dashi stock, Soy sauce, Takoyaki sauce, Japanese mayonnaise
--   Meat:       Bacon
--   Vegetables: Chopped cabbage
--   Supplies:   Packaging
--
-- Safety: no row is deleted, no recipe quantity or movement is touched. Extra ingredients are
-- only DEACTIVATED, and only when no Owner recipe (product recipe, shared recipe, or recipe
-- version) references them. Extras referenced by a recipe, and the system 'prepared-batter'
-- item, stay active and are left for an Owner decision (see AUDIT_REPORT.md section 76).

-- 1. Approved category names (ids unchanged).
insert into public.ingredient_categories (id, name)
select v.id, v.name
from (values
  ('dry-goods', 'Dry Goods'), ('seafood', 'Seafood'), ('dairy-eggs', 'Dairy'),
  ('condiments', 'Condiments'), ('meat', 'Meat'), ('produce', 'Vegetables'), ('supplies', 'Supplies')
) as v(id, name)
where not exists (select 1 from public.ingredient_categories c where c.id = v.id or c.name = v.name);

update public.ingredient_categories c
set name = v.name
from (values
  ('dry-goods', 'Dry Goods'), ('seafood', 'Seafood'), ('dairy-eggs', 'Dairy'),
  ('condiments', 'Condiments'), ('meat', 'Meat'), ('produce', 'Vegetables'), ('supplies', 'Supplies')
) as v(id, name)
where c.id = v.id and c.name <> v.name
  and not exists (select 1 from public.ingredient_categories o where o.name = v.name and o.id <> v.id);

-- 2. The approved ingredients: create any that are missing, then enforce exact name,
--    category, and active state. Units/precision are only used when a row must be created.
create temporary table _required_ingredients (
  id text primary key, name text not null, category_id text not null, unit text not null, quantity_precision smallint not null
) on commit drop;
insert into _required_ingredients values
  ('flour',               'All-purpose flour',   'dry-goods',  'kg',   2),
  ('salt',                'Salt',                'dry-goods',  'tsp',  2),
  ('baking-powder',       'Baking powder',       'dry-goods',  'tsp',  2),
  ('bonito-flakes',       'Bonito flakes',       'dry-goods',  'g',    0),
  ('octopus',             'Octopus',             'seafood',    'kg',   2),
  ('crab-sticks',         'Crab stick',          'seafood',    'pcs',  0),
  ('eggs',                'Eggs',                'dairy-eggs', 'pcs',  0),
  ('cheese-cubes',        'Cheese',              'dairy-eggs', 'pcs',  0),
  ('dashi',               'Dashi stock',         'condiments', 'L',    2),
  ('soy-sauce',           'Soy sauce',           'condiments', 'tbsp', 2),
  ('sauces',              'Takoyaki sauce',      'condiments', 'L',    2),
  ('japanese-mayonnaise', 'Japanese mayonnaise', 'condiments', 'L',    2),
  ('bacon-bits',          'Bacon',               'meat',       'g',    0),
  ('cabbage',             'Chopped cabbage',     'produce',    'g',    0),
  ('packaging',           'Packaging',           'supplies',   'pack', 0);

insert into public.ingredients (id, category_id, name, unit, quantity_precision, active)
select r.id, r.category_id, r.name, r.unit, r.quantity_precision, true
from _required_ingredients r
where not exists (select 1 from public.ingredients i where i.id = r.id)
  and not exists (select 1 from public.ingredients i where i.name = r.name);

update public.ingredients i
set name = r.name, category_id = r.category_id, active = true
from _required_ingredients r
where i.id = r.id
  and (i.name is distinct from r.name or i.category_id is distinct from r.category_id or i.active is not true)
  and not exists (select 1 from public.ingredients o where o.name = r.name and o.id <> i.id);

-- 3. Every active branch gets a stock row for every approved ingredient (existing rows kept).
insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock)
select b.id, r.id, 0, 0
from public.branches b
cross join _required_ingredients r
where b.active
  and not exists (
    select 1 from public.branch_inventory x where x.branch_id = b.id and x.ingredient_id = r.id
  );

-- 4. Deactivate every other ingredient that no Owner recipe references. Rows, stock,
--    movements and batches are preserved; inactive ingredients are hidden by the apps.
update public.ingredients i
set active = false
where i.active
  and i.id <> 'prepared-batter'
  and not exists (select 1 from _required_ingredients r where r.id = i.id)
  and not exists (select 1 from public.recipes x where x.ingredient_id = i.id)
  and not exists (select 1 from public.shared_recipe_ingredients x where x.ingredient_id = i.id)
  and not exists (select 1 from public.shared_recipe_version_ingredients x where x.ingredient_id = i.id);

notify pgrst, 'reload schema';

commit;
