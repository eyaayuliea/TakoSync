-- Team review of 2026-11-26, following the inventory catalog sheet as updated that
-- day ("Inventory Catalog", "Thresholds" and the new "Order Usage" tab).
--
-- 1. Units follow the catalog for the five items that did not yet:
--      salt, baking powder   tsp -> g   (converted: 6 g and 5 g per teaspoon)
--      cheese, crab stick    pcs -> g   (balance restarts at 0)
--      dashi stock           L   -> g   and the item is renamed "Dashi powder"
--    Pieces and litres of stock cannot be turned into grams, so for those three
--    the balance restarts at 0 with one recorded ledger entry per branch; the
--    stock on hand is recorded again in grams. Earlier ledger rows keep their unit.
--    The prepared batter stays in bottles: the catalog counts it in bottles too,
--    and its size in ml (680 or 1000) is still to be confirmed.
-- 2. Pack sizes and minimum stock from the catalog for those five items (they had
--    no minimum, which is why they never showed Low Stock).
-- 3. Sales deduct every ingredient and supply of an order, not only the batter.
--    The catalog gives two kinds of amount, so a recipe line now says which it is:
--      per_piece  x pieces in the size sold (octopus, cabbage, crab, cheese, bacon)
--      per_order  once per serving sold     (sauce, mayonnaise, bonito flakes,
--                                            packaging, picks)
--    Product recipe lines were created switched off and most items had none; the
--    catalog amounts are loaded for every product and switched on. They are the
--    sheet's estimates and stay editable by the owner. Lines the owner already
--    switched on are kept as they are.
-- 4. The POS check (sale_stock_requirements) uses the same rule, so a size whose
--    ingredient has run out is tagged Out of Stock and cannot be ordered until
--    stock is recorded again.
begin;

-- 1. Dashi powder -------------------------------------------------------------------------

update public.ingredients
set name = 'Dashi powder', category_id = 'dry-goods', updated_at = now()
where id = 'dashi'
  and (name <> 'Dashi powder' or category_id <> 'dry-goods')
  and not exists (select 1 from public.ingredients o where o.name = 'Dashi powder' and o.id <> 'dashi');

-- 2. Units ----------------------------------------------------------------------------------

alter table private.ingredient_unit_changes alter column factor drop not null;
comment on table private.ingredient_unit_changes is
  'Each change of an ingredient''s base unit. With a factor: new quantity = old quantity x factor. Without one the old unit could not be converted and the balance restarted at 0. Ledger rows from before the change keep their own unit.';

-- A unit change where the old amounts cannot be converted (pieces or litres to
-- grams). Nothing is guessed: the balance and the open lots go to 0 with a ledger
-- entry that says why, and the stock on hand is recorded again in the new unit.
create or replace function private.restart_ingredient_unit(
  p_ingredient_id text,
  p_from_unit text,
  p_to_unit text
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
begin
  select * into v_ingredient from public.ingredients where id = p_ingredient_id for update;
  -- Already changed, or never existed here: nothing to do.
  if not found or v_ingredient.unit <> p_from_unit then return; end if;

  select id into v_owner from public.profiles where role = 'owner' and active order by created_at limit 1;

  for v_row in
    select * from public.branch_inventory where ingredient_id = p_ingredient_id order by branch_id for update
  loop
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
        abs(v_row.quantity), p_from_unit, -v_row.quantity,
        v_row.quantity, 0, now(),
        format('Unit changed from %s to %s. An amount in %s cannot be converted to %s, so the balance restarts at 0; record the stock on hand again in %s',
          p_from_unit, p_to_unit, p_from_unit, p_to_unit, p_to_unit),
        'unit change'
      );
    end if;
    update public.branch_inventory
    set quantity = 0, minimum_stock = 0, updated_at = now()
    where id = v_row.id;
  end loop;

  update public.ingredient_batches set quantity_remaining = 0
  where ingredient_id = p_ingredient_id and quantity_remaining <> 0;

  -- Recipe lines in the old unit would stop a sale ("unit does not match"). Product
  -- lines are switched off (the owner still sees them and can correct them); an
  -- add-on line has no switch, so it is removed.
  update public.recipes set automatic_consumption_enabled = false
  where ingredient_id = p_ingredient_id and unit_of_measure = p_from_unit and automatic_consumption_enabled;
  delete from public.addon_recipes where ingredient_id = p_ingredient_id and unit_of_measure = p_from_unit;

  update public.ingredients set unit = p_to_unit, quantity_precision = 0, updated_at = now() where id = p_ingredient_id;

  insert into private.ingredient_unit_changes (ingredient_id, from_unit, to_unit, factor)
  values (p_ingredient_id, p_from_unit, p_to_unit, null);
end;
$$;
revoke all on function private.restart_ingredient_unit(text, text, text) from public, anon, authenticated;
alter function private.restart_ingredient_unit(text, text, text) owner to postgres;

select private.change_ingredient_unit('salt', 'tsp', 'g', 6);
select private.change_ingredient_unit('baking-powder', 'tsp', 'g', 5);
select private.restart_ingredient_unit('cheese-cubes', 'pcs', 'g');
select private.restart_ingredient_unit('crab-sticks', 'pcs', 'g');
select private.restart_ingredient_unit('dashi', 'L', 'g');

-- 2.5 tsp of baking powder per batter batch is 12.5 g, so this one item keeps one
-- decimal; the other gram items are whole numbers.
update public.ingredients set quantity_precision = 1
where id = 'baking-powder' and unit = 'g' and quantity_precision = 0;

-- The batter recipe used litres of dashi stock. With powder it is a few grams per
-- batch: 10 g is a starting estimate (about 4 g of powder per litre of water);
-- the owner sets the real amount from the label in the batter recipe.
update public.shared_recipe_ingredients
set quantity_required = 10, unit_of_measure = 'g'
where ingredient_id = 'dashi' and unit_of_measure = 'L'
  and exists (select 1 from public.ingredients where id = 'dashi' and unit = 'g');

-- The batter recipe changed (salt, baking powder and dashi are now in g), so it gets
-- a new version; sales already recorded keep pointing at the version they used.
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

-- 3. Pack sizes, minimum stock and expiry rules from the catalog ----------------------------------

insert into public.ingredient_package_sizes (ingredient_id, package_quantity, package_unit, package_label)
select v.ingredient_id, v.package_quantity, v.package_unit, v.package_label
from (values
  ('salt', 500, 'g', 'One pack'),
  ('baking-powder', 100, 'g', 'One pack'),
  ('cheese-cubes', 200, 'g', 'One pack'),
  ('crab-sticks', 250, 'g', 'One pack'),
  ('dashi', 500, 'g', 'One pack')
) as v(ingredient_id, package_quantity, package_unit, package_label)
join public.ingredients i on i.id = v.ingredient_id and i.unit = v.package_unit
on conflict (ingredient_id) do update
set package_quantity = excluded.package_quantity,
    package_unit = excluded.package_unit,
    package_label = excluded.package_label;

-- Only where no minimum is set, so a level the owner chose is kept.
update public.branch_inventory bi
set minimum_stock = v.minimum_stock, updated_at = now()
from (values
  ('salt', 'g', 500), ('baking-powder', 'g', 100), ('cheese-cubes', 'g', 400),
  ('crab-sticks', 'g', 500), ('dashi', 'g', 500)
) as v(ingredient_id, unit, minimum_stock)
join public.ingredients i on i.id = v.ingredient_id and i.unit = v.unit
where bi.ingredient_id = v.ingredient_id and bi.minimum_stock = 0;

-- Dashi powder was left out of the expiry rules until it became powder (12 months,
-- alert 30 days before). Crab stick: the sheet now says 5 days in the fridge with a
-- 2-day alert; changed only where the earlier starting value (45 / 7) is still set.
update public.ingredients
set shelf_life_days = 365, near_expiration_days = 30, expiration_tracking = true, updated_at = now()
where id = 'dashi' and unit = 'g' and shelf_life_days is null;
update public.ingredients
set shelf_life_days = 5, near_expiration_days = 2, updated_at = now()
where id = 'crab-sticks' and shelf_life_days = 45 and near_expiration_days = 7;

-- 4. A recipe line is per piece or per order -------------------------------------------------------

alter table public.recipes
  add column if not exists consumption_basis text not null default 'per_order';
alter table public.recipes drop constraint if exists recipes_consumption_basis_check;
alter table public.recipes
  add constraint recipes_consumption_basis_check check (consumption_basis in ('per_order', 'per_piece'));
comment on column public.recipes.consumption_basis is
  'per_order: the quantity is used once for each serving sold (sauce, packaging, picks). per_piece: the quantity is used for every piece in the size sold (4, 8 or 11), e.g. octopus per ball.';

CREATE OR REPLACE FUNCTION public.process_sale_inventory_unchecked(p_sale_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_sale public.sales%rowtype;
  v_profile public.profiles%rowtype;
  v_line record;
  v_inventory_lines jsonb := '[]'::jsonb;
  v_prepared_ingredient public.ingredients%rowtype;
  v_error text;
begin
  begin
    select * into v_profile
    from public.profiles
    where id = (select auth.uid()) and active;
    if not found then
      raise exception 'An active user profile is required';
    end if;

    select * into v_sale
    from public.sales
    where id = p_sale_id
    for update;
    if not found then raise exception 'Sale was not found'; end if;
    if not (v_profile.role = 'owner' or public.can_access_branch(v_sale.branch_id)) then
      raise exception 'Sale processing access denied';
    end if;

    if exists (
      select 1
      from public.inventory_movements
      where sale_id = p_sale_id
        and type = 'sales_consumption'::public.inventory_transaction_type
    ) then
      update public.sale_inventory_processing
      set status = 'completed', processed_at = now(), updated_at = now()
      where sale_id = p_sale_id;
      update public.sales
      set status = 'completed',
          inventory_processing_status = 'completed',
          inventory_processing_error = null,
          inventory_processed_at = now()
      where id = p_sale_id;
      return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
    end if;

    if exists (
      select 1 from public.sale_inventory_processing
      where sale_id = p_sale_id and status = 'completed'
    ) then
      return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
    end if;

    select * into v_prepared_ingredient
    from public.ingredients
    where id = 'prepared-batter' and active;
    if not found then raise exception 'Prepared batter inventory item is not configured'; end if;

    if exists (
      select 1
      from public.sale_items si
      join public.shared_recipe_products srp
        on srp.product_id = si.product_id and srp.active
      join public.shared_recipes sr
        on sr.id = srp.shared_recipe_id
       and sr.active and sr.automatic_consumption_enabled
      where si.sale_id = p_sale_id
      group by si.product_id
      having count(distinct sr.id) > 1
    ) then
      raise exception 'A sale product cannot use multiple active shared recipes';
    end if;

    insert into public.sale_inventory_processing (sale_id, status, attempt_count)
    values (p_sale_id, 'processing', 1)
    on conflict (sale_id) do update
    set status = 'processing',
        attempt_count = public.sale_inventory_processing.attempt_count + 1,
        failure_reason = null,
        updated_at = now();

    for v_line in
      with shared_usage as (
        select
          sr.id as recipe_id,
          sr.version as recipe_version,
          sr.prepared_quantity,
          sr.prepared_unit,
          sr.estimated_yield_pieces,
          sum(si.quantity * variant.piece_count) as applicable_pieces
        from public.sale_items si
        join public.product_variants variant on variant.id = si.product_variant_id
        join public.shared_recipe_products srp
          on srp.product_id = si.product_id and srp.active
        join public.shared_recipes sr
          on sr.id = srp.shared_recipe_id
         and sr.active and sr.automatic_consumption_enabled
        where si.sale_id = p_sale_id
        group by sr.id, sr.version,
          sr.prepared_quantity, sr.prepared_unit, sr.estimated_yield_pieces
      )
      select
        'prepared-batter'::text as ingredient_id,
        prepared_unit as unit_of_measure,
        recipe_id,
        recipe_version,
        applicable_pieces,
        prepared_quantity,
        prepared_quantity * applicable_pieces / estimated_yield_pieces as quantity_consumed,
        estimated_yield_pieces
      from shared_usage
    loop
      if v_line.unit_of_measure <> v_prepared_ingredient.unit then
        raise exception 'Prepared batter unit % does not match inventory unit %',
          v_line.unit_of_measure, v_prepared_ingredient.unit;
      end if;
      if v_line.estimated_yield_pieces is null or v_line.estimated_yield_pieces <= 0
        or v_line.prepared_quantity is null or v_line.prepared_quantity <= 0 then
        raise exception 'Shared batter recipe has an invalid prepared quantity or yield';
      end if;
      if v_line.quantity_consumed <= 0 then continue; end if;
      insert into public.sale_consumption_snapshots (
        sale_id, ingredient_id, quantity_consumed, unit_of_measure,
        applicable_pieces, recipe_type, recipe_id, recipe_version,
        recipe_quantity_required, estimated_yield_pieces
      ) values (
        p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
        v_line.unit_of_measure, v_line.applicable_pieces,
        'shared', v_line.recipe_id, v_line.recipe_version,
        v_line.prepared_quantity, v_line.estimated_yield_pieces
      )
      on conflict (sale_id, ingredient_id, recipe_type, recipe_id)
      do update set
        quantity_consumed = excluded.quantity_consumed,
        unit_of_measure = excluded.unit_of_measure,
        applicable_pieces = excluded.applicable_pieces,
        recipe_version = excluded.recipe_version,
        recipe_quantity_required = excluded.recipe_quantity_required,
        estimated_yield_pieces = excluded.estimated_yield_pieces,
        created_at = public.sale_consumption_snapshots.created_at;
    end loop;

    if exists (
      select 1
      from public.sale_items si
      join public.recipes recipe on recipe.product_id = si.product_id
       and recipe.automatic_consumption_enabled
      left join public.ingredients ingredient on ingredient.id = recipe.ingredient_id
      where si.sale_id = p_sale_id
        and (ingredient.id is null or not ingredient.active)
        and not (
          recipe.ingredient_id = 'prepared-batter'
          and exists (
            select 1
            from public.shared_recipe_products shared_product
            join public.shared_recipes shared_recipe
              on shared_recipe.id = shared_product.shared_recipe_id
             and shared_recipe.active
             and shared_recipe.automatic_consumption_enabled
            where shared_product.product_id = si.product_id
              and shared_product.active
          )
        )
    ) then
      raise exception 'A product recipe contains a missing or inactive ingredient';
    end if;

    if exists (
      select 1
      from public.sale_items si
      join public.recipes recipe on recipe.product_id = si.product_id
       and recipe.automatic_consumption_enabled
      left join public.ingredients ingredient on ingredient.id = recipe.ingredient_id
      where si.sale_id = p_sale_id
        and ingredient.active
        and recipe.unit_of_measure <> ingredient.unit
        and not (
          recipe.ingredient_id = 'prepared-batter'
          and exists (
            select 1
            from public.shared_recipe_products shared_product
            join public.shared_recipes shared_recipe
              on shared_recipe.id = shared_product.shared_recipe_id
             and shared_recipe.active
             and shared_recipe.automatic_consumption_enabled
            join public.shared_recipe_ingredients shared_line
              on shared_line.shared_recipe_id = shared_recipe.id
             and shared_line.ingredient_id = recipe.ingredient_id
             and shared_line.automatic_consumption_enabled
            where shared_product.product_id = si.product_id
              and shared_product.active
          )
        )
    ) then
      raise exception 'A product recipe unit does not match its inventory ingredient unit';
    end if;

    if exists (
      select 1
      from public.sale_items si
      join public.product_variants variant on variant.id = si.product_variant_id
      join public.recipes recipe on recipe.product_id = si.product_id
       and recipe.automatic_consumption_enabled
       and recipe.consumption_basis = 'per_piece'
      where si.sale_id = p_sale_id and variant.piece_count is null
    ) then
      raise exception 'A product size has no piece count, so its per-piece recipe cannot be deducted';
    end if;

    for v_line in
      select recipe.ingredient_id,
             ingredient.unit as unit_of_measure,
             recipe.id as recipe_id,
             recipe.quantity_required as recipe_quantity_required,
             sum(recipe.quantity_required * si.quantity
               * case when recipe.consumption_basis = 'per_piece' then variant.piece_count else 1 end) as quantity_consumed,
             sum(si.quantity * variant.piece_count) as applicable_pieces
      from public.sale_items si
      join public.product_variants variant on variant.id = si.product_variant_id
      join public.recipes recipe
        on recipe.product_id = si.product_id
       and recipe.automatic_consumption_enabled
      join public.ingredients ingredient
        on ingredient.id = recipe.ingredient_id and ingredient.active
      where si.sale_id = p_sale_id
        and not (
          recipe.ingredient_id = 'prepared-batter'
          and exists (
            select 1
            from public.shared_recipe_products shared_product
            join public.shared_recipes shared_recipe
              on shared_recipe.id = shared_product.shared_recipe_id
             and shared_recipe.active
             and shared_recipe.automatic_consumption_enabled
            where shared_product.product_id = si.product_id
              and shared_product.active
          )
        )
      group by recipe.ingredient_id, ingredient.unit, recipe.id, recipe.quantity_required
    loop
      if v_line.quantity_consumed <= 0 then continue; end if;
      insert into public.sale_consumption_snapshots (
        sale_id, ingredient_id, quantity_consumed, unit_of_measure,
        applicable_pieces, recipe_type, recipe_id, recipe_quantity_required
      ) values (
        p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
        v_line.unit_of_measure, v_line.applicable_pieces,
        'product', v_line.recipe_id, v_line.recipe_quantity_required
      )
      on conflict (sale_id, ingredient_id, recipe_type, recipe_id)
      do update set
        quantity_consumed = excluded.quantity_consumed,
        unit_of_measure = excluded.unit_of_measure,
        applicable_pieces = excluded.applicable_pieces,
        recipe_quantity_required = excluded.recipe_quantity_required,
        created_at = public.sale_consumption_snapshots.created_at;
    end loop;

    -- OW-22 c7: add-on recipes. Each add-on sold consumes its recipe ingredients
    -- (quantity × required quantity), recorded with the sale like product recipes.
    if exists (
      select 1
      from public.sale_addons sa
      join public.addon_recipes ar on ar.addon_id = sa.addon_id
      left join public.ingredients ingredient on ingredient.id = ar.ingredient_id
      where sa.sale_id = p_sale_id
        and (ingredient.id is null or not ingredient.active or ar.unit_of_measure <> ingredient.unit)
    ) then
      raise exception 'An add-on recipe contains a missing or inactive ingredient, or a unit that does not match it';
    end if;

    for v_line in
      select ar.ingredient_id,
             ingredient.unit as unit_of_measure,
             ar.id as recipe_id,
             ar.quantity_required as recipe_quantity_required,
             sum(ar.quantity_required * sa.quantity) as quantity_consumed,
             sum(sa.quantity) as applicable_pieces
      from public.sale_addons sa
      join public.addon_recipes ar on ar.addon_id = sa.addon_id
      join public.ingredients ingredient on ingredient.id = ar.ingredient_id and ingredient.active
      where sa.sale_id = p_sale_id
      group by ar.ingredient_id, ingredient.unit, ar.id, ar.quantity_required
    loop
      if v_line.quantity_consumed <= 0 or v_line.applicable_pieces <= 0 then continue; end if;
      insert into public.sale_consumption_snapshots (
        sale_id, ingredient_id, quantity_consumed, unit_of_measure,
        applicable_pieces, recipe_type, recipe_id, recipe_quantity_required
      ) values (
        p_sale_id, v_line.ingredient_id, v_line.quantity_consumed,
        v_line.unit_of_measure, v_line.applicable_pieces,
        'addon', v_line.recipe_id, v_line.recipe_quantity_required
      )
      on conflict (sale_id, ingredient_id, recipe_type, recipe_id)
      do update set
        quantity_consumed = excluded.quantity_consumed,
        unit_of_measure = excluded.unit_of_measure,
        applicable_pieces = excluded.applicable_pieces,
        recipe_quantity_required = excluded.recipe_quantity_required,
        created_at = public.sale_consumption_snapshots.created_at;
    end loop;

    select coalesce(jsonb_agg(jsonb_build_object(
      'ingredient_id', movement.ingredient_id,
      'type', 'sales_consumption',
      'quantity', movement.quantity_consumed,
      'sale_id', p_sale_id,
      'reason', 'Sales consumption',
      'notes', 'sale:' || p_sale_id::text
    )), '[]'::jsonb)
    into v_inventory_lines
    from (
      select ingredient_id, sum(quantity_consumed) as quantity_consumed
      from public.sale_consumption_snapshots
      where sale_id = p_sale_id
      group by ingredient_id
      order by ingredient_id
    ) movement;

    if jsonb_array_length(v_inventory_lines) > 0 then
      insert into private.sales_processing_authorizations (backend_pid, transaction_id, sale_id)
      values (pg_backend_pid(), txid_current(), p_sale_id);
      perform public.record_inventory_transactions(v_sale.branch_id, v_inventory_lines);
      delete from private.sales_processing_authorizations
      where backend_pid = pg_backend_pid()
        and transaction_id = txid_current()
        and sale_id = p_sale_id;
    end if;

    update public.sale_inventory_processing
    set status = 'completed', processed_at = now(), updated_at = now()
    where sale_id = p_sale_id;
    update public.sales
    set status = 'completed',
        inventory_processing_status = 'completed',
        inventory_processing_error = null,
        inventory_processed_at = now()
    where id = p_sale_id;

    return jsonb_build_object('status', 'completed', 'sale_id', p_sale_id);
  exception when others then
    get stacked diagnostics v_error = message_text;
    if v_sale.id is null then
      raise;
    end if;
    insert into public.sale_inventory_processing (
      sale_id, status, failure_reason, attempt_count, updated_at
    ) values (
      v_sale.id, 'failed', v_error, 1, now()
    )
    on conflict (sale_id) do update
    set status = 'failed',
        failure_reason = excluded.failure_reason,
        updated_at = excluded.updated_at;
    update public.sales
    set status = 'completed',
        inventory_processing_status = 'failed',
        inventory_processing_error = v_error
    where id = v_sale.id;
    return jsonb_build_object('status', 'failed', 'sale_id', v_sale.id, 'error', v_error);
  end;
end;
$function$
;

create or replace function public.sale_stock_requirements(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  return jsonb_build_object(
    'requirements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'variant_id', r.variant_id, 'ingredient_id', r.ingredient_id,
        'ingredient_name', i.name, 'unit', i.unit, 'per_unit', r.per_unit
      ) order by r.variant_id, r.ingredient_id)
      from (
        select variant_id, ingredient_id, sum(per_unit) as per_unit
        from (
          -- Shared batter recipe: prepared quantity per piece x pieces in the variant.
          select variant.id as variant_id, 'prepared-batter'::text as ingredient_id,
                 sr.prepared_quantity * variant.piece_count / sr.estimated_yield_pieces as per_unit
          from public.product_variants variant
          join public.shared_recipe_products srp on srp.product_id = variant.product_id and srp.active
          join public.shared_recipes sr on sr.id = srp.shared_recipe_id
            and sr.active and sr.automatic_consumption_enabled
          where sr.estimated_yield_pieces > 0 and variant.piece_count is not null
          union all
          -- Product recipe lines for one serving of this size: per order as written,
          -- per piece x the pieces in the size (the direct batter line is replaced
          -- by the shared recipe).
          select variant.id, recipe.ingredient_id,
                 recipe.quantity_required
                   * case when recipe.consumption_basis = 'per_piece' then variant.piece_count else 1 end
          from public.product_variants variant
          join public.recipes recipe on recipe.product_id = variant.product_id
            and recipe.automatic_consumption_enabled
          join public.ingredients ingredient on ingredient.id = recipe.ingredient_id and ingredient.active
          where not (
            recipe.ingredient_id = 'prepared-batter'
            and exists (
              select 1 from public.shared_recipe_products sp
              join public.shared_recipes s on s.id = sp.shared_recipe_id
                and s.active and s.automatic_consumption_enabled
              where sp.product_id = variant.product_id and sp.active
            )
          )
        ) lines
        where per_unit > 0
        group by variant_id, ingredient_id
      ) r
      join public.ingredients i on i.id = r.ingredient_id
    ), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_object_agg(ingredient_id, quantity)
      from public.branch_inventory where branch_id = p_branch_id
    ), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.sale_stock_requirements(uuid) from public, anon;
grant execute on function public.sale_stock_requirements(uuid) to authenticated;

-- 5. Recipe lines from the catalog's "Order Usage" tab -------------------------------------------------
--
-- Every product: octopus 8 g and cabbage 3 g per piece; takoyaki sauce 15 ml,
-- mayonnaise 10 ml, bonito flakes 2 g, 1 packaging and 1 pick per order.
-- Crab, cheese and bacon 5 g per piece, only on products with that filling (a
-- Combo + Cheese has its own filling and the cheese).
-- Flour, eggs, salt, baking powder, dashi powder and soy sauce are used when the
-- batter is prepared and are deducted there, not per order.

create temporary table _catalog_usage (
  ingredient_id text not null, quantity numeric not null, unit text not null,
  basis text not null, applies_to text not null
) on commit drop;
insert into _catalog_usage values
  ('octopus',             8,  'g',   'per_piece', 'all'),
  ('cabbage',             3,  'g',   'per_piece', 'all'),
  ('sauces',              15, 'ml',  'per_order', 'all'),
  ('japanese-mayonnaise', 10, 'ml',  'per_order', 'all'),
  ('bonito-flakes',       2,  'g',   'per_order', 'all'),
  ('packaging',           1,  'pcs', 'per_order', 'all'),
  ('takoyaki-picks',      1,  'pcs', 'per_order', 'all'),
  ('crab-sticks',         5,  'g',   'per_piece', 'crab'),
  ('cheese-cubes',        5,  'g',   'per_piece', 'cheese'),
  ('bacon-bits',          5,  'g',   'per_piece', 'bacon');

insert into public.recipes (
  product_id, ingredient_id, quantity_required, unit_of_measure, automatic_consumption_enabled, consumption_basis
)
select product.id, usage.ingredient_id, usage.quantity, ingredient.unit, true, usage.basis
from public.products product
cross join lateral (
  select concat_ws(' ', product.internal_code, product.flavor, product.product_name, product.display_name) as label
) names
join _catalog_usage usage
  on usage.applies_to = 'all'
  or (usage.applies_to = 'crab' and names.label ilike '%crab%')
  or (usage.applies_to = 'bacon' and names.label ilike '%bacon%')
  or (usage.applies_to = 'cheese' and (names.label ilike '%cheese%' or product.portion_type = 'Combo + Cheese'))
-- Only while the item is in the catalog's unit; otherwise the line is left for the owner.
join public.ingredients ingredient
  on ingredient.id = usage.ingredient_id and ingredient.active and ingredient.unit = usage.unit
on conflict (product_id, ingredient_id) do update
set quantity_required = excluded.quantity_required,
    unit_of_measure = excluded.unit_of_measure,
    automatic_consumption_enabled = true,
    consumption_basis = excluded.consumption_basis
-- A line the owner switched on in the right unit is theirs and is kept.
where not public.recipes.automatic_consumption_enabled
   or public.recipes.unit_of_measure <> excluded.unit_of_measure;

-- Add-ons without a recipe get one extra portion of what they add (the same
-- amounts as on an order). Add-ons the owner already set up are not touched.
insert into public.addon_recipes (addon_id, ingredient_id, quantity_required, unit_of_measure)
select addon.id, v.ingredient_id, v.quantity, ingredient.unit
from public.menu_addons addon
join (values
  ('japanese-white-sauce', 'japanese-mayonnaise', 10, 'ml'),
  ('takoyaki-sauce',       'sauces',              15, 'ml'),
  ('flakes',               'bonito-flakes',       2,  'g')
) as v(addon_code, ingredient_id, quantity, unit) on v.addon_code = addon.addon_code
join public.ingredients ingredient
  on ingredient.id = v.ingredient_id and ingredient.active and ingredient.unit = v.unit
where not exists (select 1 from public.addon_recipes r where r.addon_id = addon.id);

notify pgrst, 'reload schema';
commit;
