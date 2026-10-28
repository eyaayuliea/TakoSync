insert into public.ingredient_categories (id, name) values
  ('seafood', 'Seafood'),
  ('dry-goods', 'Dry Goods'),
  ('dairy-eggs', 'Dairy & eggs'),
  ('condiments', 'Condiments'),
  ('produce', 'Produce')
on conflict (id) do nothing;

update public.ingredients
set name = 'Takoyaki Sauce'
where id = 'sauces' and name = 'Sauces';

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

insert into public.inventory (branch_id, ingredient_id, quantity, minimum_stock)
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

create or replace function public.provision_branch_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.inventory (branch_id, ingredient_id, quantity, minimum_stock)
  select new.id, ingredient.id, 0, 0
  from public.ingredients as ingredient
  where ingredient.active
  on conflict (branch_id, ingredient_id) do nothing;
  return new;
end;
$$;

create trigger branches_provision_inventory
after insert on public.branches
for each row execute function public.provision_branch_inventory();

create or replace function public.provision_ingredient_inventory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.active then
    insert into public.inventory (branch_id, ingredient_id, quantity, minimum_stock)
    select branch.id, new.id, 0, 0
    from public.branches as branch
    where branch.active
    on conflict (branch_id, ingredient_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger ingredients_provision_inventory
after insert or update of active on public.ingredients
for each row execute function public.provision_ingredient_inventory();
