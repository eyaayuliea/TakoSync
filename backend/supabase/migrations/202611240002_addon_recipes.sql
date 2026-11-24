-- OW-22 c7: add-ons can have their own recipes so that their ingredient
-- consumption is recorded.
--
--   * public.addon_recipes: the ingredients and required quantities of one add-on
--     (in the ingredient's unit). Read by active users, written by the owner.
--   * process_sale_inventory_unchecked (from 202611220014, otherwise unchanged)
--     also consumes the recipes of the add-ons sold. submit_sale runs it in the
--     same transaction, so a sale whose add-ons the stock cannot cover is refused
--     like any other ("Order changed: Insufficient stock …").
--   * sale_consumption_snapshots.recipe_type accepts 'addon'.
-- Add-ons without a recipe consume nothing, as before. Past sales are unchanged.
begin;

create table if not exists public.addon_recipes (
  id uuid primary key default gen_random_uuid(),
  addon_id uuid not null references public.menu_addons(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  quantity_required numeric(12, 3) not null check (quantity_required > 0),
  unit_of_measure text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (addon_id, ingredient_id)
);
comment on table public.addon_recipes is 'OW-22 c7: ingredients consumed by each add-on sold.';

alter table public.addon_recipes enable row level security;
drop policy if exists addon_recipes_read_active_users on public.addon_recipes;
create policy addon_recipes_read_active_users on public.addon_recipes
for select to authenticated
using (exists (select 1 from public.profiles where profiles.id = (select auth.uid()) and profiles.active));
drop policy if exists addon_recipes_owner_manage on public.addon_recipes;
create policy addon_recipes_owner_manage on public.addon_recipes
for all to authenticated using (public.is_active_owner()) with check (public.is_active_owner());
revoke all on table public.addon_recipes from public, anon, authenticated;
grant select, insert, update, delete on table public.addon_recipes to authenticated;

alter table public.sale_consumption_snapshots drop constraint if exists sale_consumption_snapshots_recipe_type_check;
alter table public.sale_consumption_snapshots add constraint sale_consumption_snapshots_recipe_type_check
  check (recipe_type = any (array['shared'::text, 'product'::text, 'addon'::text]));

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

    for v_line in
      select recipe.ingredient_id,
             ingredient.unit as unit_of_measure,
             recipe.id as recipe_id,
             recipe.quantity_required as recipe_quantity_required,
             sum(recipe.quantity_required * si.quantity) as quantity_consumed,
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

select private.declare_endpoint('table/addon_recipes', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG'], 'Add-on recipes (OW-22 c7).');

notify pgrst, 'reload schema';
commit;
