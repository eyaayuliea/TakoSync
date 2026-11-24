-- Inventory catalog from the team's sheet ("Inventory Catalog", "Thresholds",
-- received 2026-11-25), with the owner's decisions of the same day:
--   * items follow the catalog: Octobits is hidden as an inventory item and
--     Takoyaki picks is added;
--   * units follow the catalog (g, ml, pcs);
--   * pack sizes and low-stock thresholds are loaded as starting values for
--     every branch (the sheet marks them as suggestions; the owner can change
--     them in Configuration). The sheet's stock counts and dates are examples
--     and are NOT loaded.
--
-- Unit changes are a recorded cut-over, not a rewrite of history:
--   * the balance, the open lots, the recipes, the minimum level and any count
--     still waiting for the owner are converted;
--   * one ledger entry per branch records the change (an adjustment whose
--     reason says no stock was added or removed), so the balance still equals
--     the sum of the ledger;
--   * earlier ledger rows keep the unit they were recorded in.
--
-- Converted now (exact): flour and octopus kg -> g, takoyaki sauce and
-- mayonnaise L -> ml, soy sauce tbsp -> ml (15 ml), packaging pack -> pcs (100).
-- NOT converted yet: salt and baking powder (tsp -> g), cheese (pcs -> g) and
-- dashi stock (L) -> dashi powder (g). They need the owner's real amounts in
-- grams; they keep their unit, pack size and minimum level until then.
-- The prepared batter stays in bottles of 680 ml; the sheet's 1000 ml is one of
-- its placeholder pack sizes.
begin;

-- 1. Categories (ids unchanged; three seafood categories are new) ---------------------

update public.ingredient_categories c
set name = v.name
from (values
  ('dry-goods', 'Dry goods'), ('dairy-eggs', 'Dairy & eggs'), ('condiments', 'Sauces & oils'),
  ('meat', 'Chilled meat'), ('produce', 'Fresh produce'), ('supplies', 'Supplies'), ('prepared', 'Prepared batter')
) as v(id, name)
where c.id = v.id and c.name <> v.name
  and not exists (select 1 from public.ingredient_categories o where o.name = v.name and o.id <> v.id);

insert into public.ingredient_categories (id, name)
select v.id, v.name
from (values ('dried-seafood', 'Dried seafood'), ('frozen-seafood', 'Frozen seafood'), ('chilled-seafood', 'Chilled seafood')) as v(id, name)
where not exists (select 1 from public.ingredient_categories c where c.id = v.id or c.name = v.name);

update public.ingredients set category_id = 'dried-seafood' where id = 'bonito-flakes';
update public.ingredients set category_id = 'frozen-seafood' where id = 'octopus';
update public.ingredients set category_id = 'chilled-seafood' where id = 'crab-sticks';

-- 2. Items --------------------------------------------------------------------------------

insert into public.ingredients (id, category_id, name, unit, quantity_precision, active, expiration_tracking)
select 'takoyaki-picks', 'supplies', 'Takoyaki picks', 'pcs', 0, true, false
where not exists (select 1 from public.ingredients where id = 'takoyaki-picks' or name = 'Takoyaki picks');

insert into public.branch_inventory (branch_id, ingredient_id, quantity, minimum_stock)
select b.id, 'takoyaki-picks', 0, 0
from public.branches b
where b.active
  and exists (select 1 from public.ingredients where id = 'takoyaki-picks')
  and not exists (select 1 from public.branch_inventory x where x.branch_id = b.id and x.ingredient_id = 'takoyaki-picks');

-- Octobits is not in the catalog. Its recipe line was never deducted by sales
-- (automatic consumption is off); it is removed so the hidden item is not
-- referenced. Its stock rows and history are kept.
delete from public.recipes where ingredient_id = 'octobits' and not automatic_consumption_enabled;
update public.ingredients set active = false
where id = 'octobits'
  and not exists (select 1 from public.recipes r where r.ingredient_id = 'octobits')
  and not exists (select 1 from public.shared_recipe_ingredients r where r.ingredient_id = 'octobits');

-- 3. Unit changes ---------------------------------------------------------------------------

create table if not exists private.ingredient_unit_changes (
  id bigint generated always as identity primary key,
  ingredient_id text not null references public.ingredients(id),
  from_unit text not null,
  to_unit text not null,
  factor numeric(18, 9) not null check (factor > 0),
  changed_at timestamptz not null default now()
);
comment on table private.ingredient_unit_changes is
  'Each change of an ingredient''s base unit: new quantity = old quantity x factor. Ledger rows from before the change keep their own unit.';
revoke all on table private.ingredient_unit_changes from public, anon, authenticated;

create or replace function private.change_ingredient_unit(
  p_ingredient_id text,
  p_from_unit text,
  p_to_unit text,
  p_factor numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ingredient public.ingredients%rowtype;
  v_owner uuid;
  v_row public.branch_inventory%rowtype;
  v_new numeric(12, 3);
begin
  if p_factor is null or p_factor <= 0 then
    raise exception 'The conversion factor must be greater than zero';
  end if;
  select * into v_ingredient from public.ingredients where id = p_ingredient_id for update;
  -- Already converted, or never existed here: nothing to do.
  if not found or v_ingredient.unit <> p_from_unit then return; end if;

  select id into v_owner from public.profiles where role = 'owner' and active order by created_at limit 1;

  for v_row in
    select * from public.branch_inventory where ingredient_id = p_ingredient_id order by branch_id for update
  loop
    v_new := v_row.quantity * p_factor;
    if v_row.quantity <> 0 then
      if v_owner is null then
        raise exception 'An active owner account is needed to record the unit change of %', v_ingredient.name;
      end if;
      insert into public.inventory_movements (
        reference, branch_id, ingredient_id, actor_id, type, quantity, unit, movement,
        before_quantity, after_quantity, transaction_date, reason, notes
      ) values (
        'TX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
        v_row.branch_id, p_ingredient_id, v_owner, 'adjustment'::public.inventory_transaction_type,
        abs(v_new - v_row.quantity), p_to_unit, v_new - v_row.quantity,
        v_row.quantity, v_new, now(),
        format('Unit changed from %s to %s (1 %s = %s %s); no stock was added or removed',
          p_from_unit, p_to_unit, p_from_unit, trim_scale(p_factor), p_to_unit),
        'unit change'
      );
    end if;
    update public.branch_inventory
    set quantity = v_new, minimum_stock = minimum_stock * p_factor, updated_at = now()
    where id = v_row.id;
  end loop;

  update public.ingredient_batches
  set quantity_received = quantity_received * p_factor, quantity_remaining = quantity_remaining * p_factor
  where ingredient_id = p_ingredient_id;

  -- Recipes in the old unit.
  update public.recipes set quantity_required = quantity_required * p_factor, unit_of_measure = p_to_unit
  where ingredient_id = p_ingredient_id and unit_of_measure = p_from_unit;
  update public.addon_recipes set quantity_required = quantity_required * p_factor, unit_of_measure = p_to_unit
  where ingredient_id = p_ingredient_id and unit_of_measure = p_from_unit;
  update public.shared_recipe_ingredients set quantity_required = quantity_required * p_factor, unit_of_measure = p_to_unit
  where ingredient_id = p_ingredient_id and unit_of_measure = p_from_unit;

  -- Counts the owner has not decided yet are still open work, so they follow the
  -- new unit; validated and rejected counts are history and keep theirs.
  update public.inventory_count_correction_requests r
  set corrected_actual_quantity = r.corrected_actual_quantity * p_factor
  from public.daily_stock_count_lines l
  where r.daily_stock_count_line_id = l.id
    and l.ingredient_id = p_ingredient_id and l.unit = p_from_unit
    and not exists (select 1 from public.inventory_count_validations v where v.daily_stock_count_line_id = l.id)
    and not exists (select 1 from public.inventory_count_rejections x where x.daily_stock_count_line_id = l.id);
  update public.daily_stock_count_lines l
  set recorded_quantity = l.recorded_quantity * p_factor,
      physical_quantity = l.physical_quantity * p_factor,
      difference = l.difference * p_factor,
      unit = p_to_unit
  where l.ingredient_id = p_ingredient_id and l.unit = p_from_unit
    and not exists (select 1 from public.inventory_count_validations v where v.daily_stock_count_line_id = l.id)
    and not exists (select 1 from public.inventory_count_rejections x where x.daily_stock_count_line_id = l.id);

  update public.ingredients set unit = p_to_unit, quantity_precision = 0, updated_at = now() where id = p_ingredient_id;

  insert into private.ingredient_unit_changes (ingredient_id, from_unit, to_unit, factor)
  values (p_ingredient_id, p_from_unit, p_to_unit, p_factor);
end;
$$;
revoke all on function private.change_ingredient_unit(text, text, text, numeric) from public, anon, authenticated;
alter function private.change_ingredient_unit(text, text, text, numeric) owner to postgres;

select private.change_ingredient_unit('flour', 'kg', 'g', 1000);
select private.change_ingredient_unit('octopus', 'kg', 'g', 1000);
select private.change_ingredient_unit('sauces', 'L', 'ml', 1000);
select private.change_ingredient_unit('japanese-mayonnaise', 'L', 'ml', 1000);
select private.change_ingredient_unit('soy-sauce', 'tbsp', 'ml', 15);
select private.change_ingredient_unit('packaging', 'pack', 'pcs', 100);

-- The batter recipe changed (its lines are now in g and ml), so it gets a new
-- version; sales already recorded keep pointing at the version they used.
do $$
declare
  v_recipe public.shared_recipes%rowtype;
begin
  for v_recipe in
    select sr.* from public.shared_recipes sr
    where exists (
      select 1 from public.shared_recipe_ingredients i
      left join public.shared_recipe_version_ingredients vi
        on vi.shared_recipe_id = i.shared_recipe_id and vi.version = sr.version and vi.ingredient_id = i.ingredient_id
      where i.shared_recipe_id = sr.id
        and (vi.ingredient_id is null or vi.quantity_required <> i.quantity_required or vi.unit_of_measure <> i.unit_of_measure)
    )
  loop
    update public.shared_recipes set version = version + 1, updated_at = now() where id = v_recipe.id;
    insert into public.shared_recipe_versions (
      shared_recipe_id, version, name, estimated_yield_pieces, active, automatic_consumption_enabled,
      prepared_quantity, prepared_unit
    ) values (
      v_recipe.id, v_recipe.version + 1, v_recipe.name, v_recipe.estimated_yield_pieces, v_recipe.active,
      v_recipe.automatic_consumption_enabled, v_recipe.prepared_quantity, v_recipe.prepared_unit
    );
    insert into public.shared_recipe_version_ingredients (
      shared_recipe_id, version, ingredient_id, quantity_required, unit_of_measure, automatic_consumption_enabled
    )
    select shared_recipe_id, v_recipe.version + 1, ingredient_id, quantity_required, unit_of_measure, automatic_consumption_enabled
    from public.shared_recipe_ingredients where shared_recipe_id = v_recipe.id;
  end loop;
end;
$$;

-- A reversal puts back exactly what an earlier entry moved, in that entry's unit.
-- After a unit change that amount would be applied in the wrong unit, so a
-- reversal of an entry from before the change is refused with the reason.
create or replace function private.guard_reversal_unit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_unit text;
begin
  if new.type in ('void_reversal'::public.inventory_transaction_type, 'entry_reversal'::public.inventory_transaction_type) then
    select unit into v_unit from public.ingredients where id = new.ingredient_id;
    if v_unit is not null and v_unit <> new.unit then
      raise exception 'This was recorded in % before the item changed to %, so it cannot be reversed automatically. Record a correction instead.', new.unit, v_unit;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_reversal_unit() from public, anon, authenticated;
drop trigger if exists inventory_movements_reversal_unit_guard on public.inventory_movements;
create trigger inventory_movements_reversal_unit_guard
  before insert on public.inventory_movements
  for each row execute function private.guard_reversal_unit();

-- 4. Pack sizes (starting values from the sheet) -----------------------------------------------

insert into public.ingredient_package_sizes (ingredient_id, package_quantity, package_unit, package_label)
select v.ingredient_id, v.package_quantity, v.package_unit, v.package_label
from (values
  ('flour', 1000, 'g', 'One bag'),
  ('bonito-flakes', 100, 'g', 'One pack'),
  ('octopus', 1000, 'g', 'One pack'),
  ('crab-sticks', 20, 'pcs', 'One pack'),
  ('eggs', 30, 'pcs', 'One tray'),
  ('soy-sauce', 1000, 'ml', 'One bottle'),
  ('sauces', 1000, 'ml', 'One bottle'),
  ('japanese-mayonnaise', 1000, 'ml', 'One bottle'),
  ('bacon-bits', 500, 'g', 'One pack'),
  ('cabbage', 1000, 'g', 'One pack'),
  ('packaging', 100, 'pcs', 'One pack'),
  ('takoyaki-picks', 200, 'pcs', 'One pack')
) as v(ingredient_id, package_quantity, package_unit, package_label)
join public.ingredients i on i.id = v.ingredient_id and i.unit = v.package_unit
on conflict (ingredient_id) do update
set package_quantity = excluded.package_quantity,
    package_unit = excluded.package_unit,
    package_label = excluded.package_label;

-- 5. Low-stock thresholds (starting values from the sheet, every branch) ------------------------

update public.branch_inventory bi
set minimum_stock = v.minimum_stock, updated_at = now()
from (values
  ('flour', 'g', 2000), ('bonito-flakes', 'g', 300), ('octopus', 'g', 2000), ('crab-sticks', 'pcs', 40),
  ('eggs', 'pcs', 30), ('soy-sauce', 'ml', 1000), ('sauces', 'ml', 2000), ('japanese-mayonnaise', 'ml', 2000),
  ('bacon-bits', 'g', 500), ('cabbage', 'g', 2000), ('packaging', 'pcs', 300), ('prepared-batter', 'bottle', 5),
  ('takoyaki-picks', 'pcs', 200)
) as v(ingredient_id, unit, minimum_stock)
join public.ingredients i on i.id = v.ingredient_id and i.unit = v.unit
where bi.ingredient_id = v.ingredient_id and bi.minimum_stock is distinct from v.minimum_stock;

notify pgrst, 'reload schema';
commit;
