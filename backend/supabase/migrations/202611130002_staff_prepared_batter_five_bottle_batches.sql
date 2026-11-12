begin;

create or replace function public.prepare_batter_batch(
  p_branch_id uuid,
  p_batch_reference text
)
returns public.batter_preparation_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_batch public.batter_preparation_batches%rowtype;
  v_recipe public.shared_recipes%rowtype;
  v_prepared_ingredient public.ingredients%rowtype;
  v_line record;
  v_preparation_lines jsonb := '[]'::jsonb;
  v_inserted integer;
  v_bottle_count constant integer := 5;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if nullif(btrim(p_batch_reference), '') is null then raise exception 'A batch reference is required'; end if;

  select * into v_recipe
  from public.shared_recipes
  where recipe_code = 'shared-batter'
    and active and automatic_consumption_enabled
  for update;
  if not found then raise exception 'An active shared batter recipe is required'; end if;
  if v_recipe.prepared_quantity <= 0 or v_recipe.estimated_yield_pieces <= 0 then
    raise exception 'Shared batter recipe has an invalid prepared quantity or yield';
  end if;

  select * into v_prepared_ingredient
  from public.ingredients
  where id = 'prepared-batter' and active;
  if not found then raise exception 'Prepared batter inventory item is not configured'; end if;

  if v_recipe.prepared_unit <> 'bottle' or v_prepared_ingredient.unit <> 'bottle' then
    raise exception 'Prepared batter batches must use bottle units';
  end if;
  if v_prepared_ingredient.unit <> v_recipe.prepared_unit then
    raise exception 'Prepared batter unit % does not match inventory unit %',
      v_recipe.prepared_unit, v_prepared_ingredient.unit;
  end if;
  if v_recipe.prepared_quantity <> trunc(v_recipe.prepared_quantity) then
    raise exception 'Prepared quantity must match the whole-unit inventory precision';
  end if;

  if exists (
    select 1
    from public.shared_recipe_ingredients shared_line
    left join public.ingredients ingredient on ingredient.id = shared_line.ingredient_id
    where shared_line.shared_recipe_id = v_recipe.id
      and shared_line.automatic_consumption_enabled
      and (ingredient.id is null or not ingredient.active)
  ) then
    raise exception 'Shared batter recipe contains a missing or inactive ingredient';
  end if;

  insert into public.batter_preparation_batches (
    batch_reference, branch_id, prepared_by, bottle_count,
    prepared_quantity, prepared_unit, estimated_yield_pieces
  ) values (
    btrim(p_batch_reference), p_branch_id, v_profile.id,
    v_bottle_count, v_bottle_count, v_recipe.prepared_unit,
    v_recipe.estimated_yield_pieces * v_bottle_count / v_recipe.prepared_quantity
  )
  on conflict (batch_reference) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_batch
  from public.batter_preparation_batches
  where batch_reference = btrim(p_batch_reference)
  for update;
  if v_batch.branch_id <> p_branch_id then
    raise exception 'Batch reference belongs to another branch';
  end if;
  if v_batch.prepared_by <> v_profile.id and v_profile.role <> 'owner' then
    raise exception 'Batch reference already belongs to another staff member';
  end if;
  if v_inserted = 0 then return v_batch; end if;

  -- Saved ingredient quantities are totals for the configured recipe output.
  -- Normalize per bottle, then scale to the fixed five-bottle batch.
  for v_line in
    select shared_line.ingredient_id, shared_line.quantity_required,
      shared_line.unit_of_measure, ingredient.unit
    from public.shared_recipe_ingredients shared_line
    join public.ingredients ingredient on ingredient.id = shared_line.ingredient_id
      and ingredient.active
    where shared_line.shared_recipe_id = v_recipe.id
      and shared_line.automatic_consumption_enabled
      and shared_line.ingredient_id <> 'prepared-batter'
  loop
    if v_line.unit_of_measure <> v_line.unit then
      raise exception 'Batter recipe unit for ingredient % does not match inventory unit',
        v_line.ingredient_id;
    end if;
    v_preparation_lines := v_preparation_lines || jsonb_build_array(jsonb_build_object(
      'ingredient_id', v_line.ingredient_id,
      'type', 'usage',
      'quantity', v_line.quantity_required * v_bottle_count / v_recipe.prepared_quantity,
      'reason', 'Batter preparation',
      'notes', v_batch.batch_reference
    ));
  end loop;
  v_preparation_lines := v_preparation_lines || jsonb_build_array(jsonb_build_object(
    'ingredient_id', 'prepared-batter', 'type', 'stock_in',
    'quantity', v_bottle_count, 'batch_reference', v_batch.batch_reference,
    'reason', 'Batter preparation',
    'notes', format('Prepared quantity %s %s; configured yield %s pieces',
      v_bottle_count, v_recipe.prepared_unit, v_recipe.estimated_yield_pieces)
  ));
  perform public.record_inventory_transactions(p_branch_id, v_preparation_lines);
  return v_batch;
end;
$$;

create or replace function public.prepare_batter_batch(
  p_branch_id uuid,
  p_batch_reference text,
  p_prepared_quantity integer
)
returns public.batter_preparation_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active;
  if not found then raise exception 'An active user profile is required'; end if;
  if not public.can_access_branch(p_branch_id) then raise exception 'Branch access denied'; end if;
  if p_prepared_quantity is distinct from 5 then
    raise exception 'Prepared batter batch quantity must be exactly 5 bottles';
  end if;

  return public.prepare_batter_batch(p_branch_id, p_batch_reference);
end;
$$;

revoke all on function public.prepare_batter_batch(uuid, text) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text) to authenticated;
revoke all on function public.prepare_batter_batch(uuid, text, integer) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text, integer) to authenticated;

alter function public.prepare_batter_batch(uuid, text) owner to postgres;
alter function public.prepare_batter_batch(uuid, text, integer) owner to postgres;

notify pgrst, 'reload schema';

commit;
