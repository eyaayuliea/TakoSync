insert into public.ingredient_categories (id, name) values
  ('seafood', 'Seafood'),
  ('dry-goods', 'Dry Goods'),
  ('dairy-eggs', 'Dairy & eggs'),
  ('condiments', 'Condiments'),
  ('produce', 'Produce')
on conflict (id) do nothing;

insert into public.ingredients (id, category_id, name, unit, quantity_precision) values
  ('octopus', 'seafood', 'Octopus', 'kg', 2),
  ('flour', 'dry-goods', 'Flour', 'kg', 2),
  ('eggs', 'dairy-eggs', 'Eggs', 'pcs', 0),
  ('sauces', 'condiments', 'Takoyaki Sauce', 'L', 2),
  ('japanese-mayonnaise', 'condiments', 'Japanese Mayonnaise', 'L', 2),
  ('bonito-flakes', 'dry-goods', 'Bonito Flakes', 'g', 0),
  ('spring-onions', 'produce', 'Spring Onions', 'g', 0),
  ('cooking-oil', 'condiments', 'Cooking Oil', 'L', 2)
on conflict (id) do update
set category_id = excluded.category_id,
    name = excluded.name,
    unit = excluded.unit,
    quantity_precision = excluded.quantity_precision,
    active = true;

insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock) values
  ('00000000-0000-4000-8000-000000000001', 'octopus', 3, 5),
  ('00000000-0000-4000-8000-000000000001', 'flour', 12, 5),
  ('00000000-0000-4000-8000-000000000001', 'eggs', 48, 24),
  ('00000000-0000-4000-8000-000000000001', 'sauces', 2, 1),
  ('00000000-0000-4000-8000-000000000002', 'octopus', 0, 5),
  ('00000000-0000-4000-8000-000000000002', 'flour', 0, 5),
  ('00000000-0000-4000-8000-000000000002', 'eggs', 0, 24),
  ('00000000-0000-4000-8000-000000000002', 'sauces', 0, 1),
  ('00000000-0000-4000-8000-000000000003', 'octopus', 0, 5),
  ('00000000-0000-4000-8000-000000000003', 'flour', 0, 5),
  ('00000000-0000-4000-8000-000000000003', 'eggs', 0, 24),
  ('00000000-0000-4000-8000-000000000003', 'sauces', 0, 1)
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
    'octopus', 'flour', 'eggs', 'sauces', 'japanese-mayonnaise',
    'bonito-flakes', 'spring-onions', 'cooking-oil'
  )
on conflict (branch_id, ingredient_id) do nothing;

insert into public.ingredient_batches (
  branch_id, ingredient_id, batch_reference, received_date, expiration_date,
  quantity_received, quantity_remaining
) values
  ('00000000-0000-4000-8000-000000000001', 'octopus', 'OCT-2510', '2026-10-25', '2026-10-30', 3, 3),
  ('00000000-0000-4000-8000-000000000001', 'flour', 'FLR-2510', '2026-10-24', null, 12, 12),
  ('00000000-0000-4000-8000-000000000001', 'eggs', 'EGG-2510', '2026-10-25', '2026-11-02', 48, 48),
  ('00000000-0000-4000-8000-000000000001', 'sauces', 'SC-B1-2710', '2026-10-23', '2026-10-27', 2, 2)
on conflict (branch_id, batch_reference) do nothing;
