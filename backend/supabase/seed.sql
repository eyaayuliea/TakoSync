-- Categories and units follow the team's inventory catalog (migration 202611250001).
insert into public.ingredient_categories (id, name) values
  ('seafood', 'Seafood'),
  ('dried-seafood', 'Dried seafood'),
  ('frozen-seafood', 'Frozen seafood'),
  ('chilled-seafood', 'Chilled seafood'),
  ('dry-goods', 'Dry goods'),
  ('dairy-eggs', 'Dairy & eggs'),
  ('condiments', 'Sauces & oils'),
  ('produce', 'Fresh produce'),
  ('meat', 'Chilled meat'),
  ('supplies', 'Supplies')
on conflict (id) do update set name = excluded.name;

-- Approved ingredient catalog (exact names and categories; no extra ingredients).
insert into public.ingredients (id, category_id, name, unit, quantity_precision) values
  ('flour', 'dry-goods', 'All-purpose flour', 'g', 0),
  -- Salt, baking powder, cheese and dashi keep their earlier units until the owner
  -- gives the amounts in grams (see migration 202611250001).
  ('salt', 'dry-goods', 'Salt', 'tsp', 2),
  ('baking-powder', 'dry-goods', 'Baking powder', 'tsp', 2),
  ('bonito-flakes', 'dried-seafood', 'Bonito flakes', 'g', 0),
  ('octopus', 'frozen-seafood', 'Octopus', 'g', 0),
  ('crab-sticks', 'chilled-seafood', 'Crab stick', 'pcs', 0),
  ('eggs', 'dairy-eggs', 'Eggs', 'pcs', 0),
  ('cheese-cubes', 'dairy-eggs', 'Cheese', 'pcs', 0),
  ('dashi', 'condiments', 'Dashi stock', 'L', 2),
  ('soy-sauce', 'condiments', 'Soy sauce', 'ml', 0),
  ('sauces', 'condiments', 'Takoyaki sauce', 'ml', 0),
  ('japanese-mayonnaise', 'condiments', 'Japanese mayonnaise', 'ml', 0),
  ('bacon-bits', 'meat', 'Bacon', 'g', 0),
  ('cabbage', 'produce', 'Chopped cabbage', 'g', 0),
  ('packaging', 'supplies', 'Packaging', 'pcs', 0),
  ('takoyaki-picks', 'supplies', 'Takoyaki picks', 'pcs', 0)
on conflict (id) do update
set category_id = excluded.category_id,
    name = excluded.name,
    unit = excluded.unit,
    quantity_precision = excluded.quantity_precision,
    active = true;

insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock) values
  ('00000000-0000-4000-8000-000000000001', 'octopus', 3000, 2000),
  ('00000000-0000-4000-8000-000000000001', 'flour', 12000, 2000),
  ('00000000-0000-4000-8000-000000000001', 'eggs', 48, 30),
  ('00000000-0000-4000-8000-000000000001', 'sauces', 2000, 2000),
  ('00000000-0000-4000-8000-000000000002', 'octopus', 0, 2000),
  ('00000000-0000-4000-8000-000000000002', 'flour', 0, 2000),
  ('00000000-0000-4000-8000-000000000002', 'eggs', 0, 30),
  ('00000000-0000-4000-8000-000000000002', 'sauces', 0, 2000),
  ('00000000-0000-4000-8000-000000000003', 'octopus', 0, 2000),
  ('00000000-0000-4000-8000-000000000003', 'flour', 0, 2000),
  ('00000000-0000-4000-8000-000000000003', 'eggs', 0, 30),
  ('00000000-0000-4000-8000-000000000003', 'sauces', 0, 2000)
on conflict (branch_id, ingredient_id) do update
set quantity = excluded.quantity,
    minimum_stock = excluded.minimum_stock,
    updated_at = now()
where not exists (
  select 1
  from public.inventory_transactions as transaction_record
  where transaction_record.branch_id = excluded.branch_id
    and transaction_record.ingredient_id = excluded.ingredient_id
);

insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock)
select branch.id, ingredient.id, 0, 0
from public.branches as branch
cross join public.ingredients as ingredient
where branch.active
  and ingredient.active
  and ingredient.id in (
    'flour', 'salt', 'baking-powder', 'bonito-flakes', 'octopus', 'crab-sticks',
    'eggs', 'cheese-cubes', 'dashi', 'soy-sauce', 'sauces', 'japanese-mayonnaise',
    'bacon-bits', 'cabbage', 'packaging', 'takoyaki-picks'
  )
on conflict (branch_id, ingredient_id) do nothing;

insert into public.ingredient_batches (
  branch_id, ingredient_id, batch_reference, received_date, expiration_date,
  quantity_received, quantity_remaining
) values
  ('00000000-0000-4000-8000-000000000001', 'octopus', 'OCT-2510', '2026-10-25', '2026-10-30', 3000, 3000),
  ('00000000-0000-4000-8000-000000000001', 'flour', 'FLR-2510', '2026-10-24', null, 12000, 12000),
  ('00000000-0000-4000-8000-000000000001', 'eggs', 'EGG-2510', '2026-10-25', '2026-11-02', 48, 48),
  ('00000000-0000-4000-8000-000000000001', 'sauces', 'SC-B1-2710', '2026-10-23', '2026-10-27', 2000, 2000)
on conflict (branch_id, batch_reference) do nothing;
