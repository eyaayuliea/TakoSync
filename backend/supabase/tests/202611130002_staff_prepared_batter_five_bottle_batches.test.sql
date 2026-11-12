begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

create temporary table st07_fixture on commit drop as
select
  gen_random_uuid() as branch_a_id,
  gen_random_uuid() as branch_b_id,
  gen_random_uuid() as staff_a_id,
  gen_random_uuid() as staff_b_id,
  gen_random_uuid() as session_a_id,
  gen_random_uuid() as session_b_id,
  null::text as insufficient_ingredient_id,
  ('TEST-ST07-A-' || gen_random_uuid()::text) as branch_a_code,
  ('TEST-ST07-B-' || gen_random_uuid()::text) as branch_b_code,
  ('st07-a-' || gen_random_uuid()::text || '@takosync.invalid') as staff_a_email,
  ('st07-b-' || gen_random_uuid()::text || '@takosync.invalid') as staff_b_email;
grant select on st07_fixture to authenticated;

do $$
begin
  if not exists (
    select 1 from public.shared_recipes
    where recipe_code = 'shared-batter'
      and active and automatic_consumption_enabled
      and prepared_quantity > 0
      and prepared_quantity = trunc(prepared_quantity)
      and estimated_yield_pieces > 0
  ) then
    raise exception 'ST-07 requires an active shared batter recipe with a positive whole configured output';
  end if;
  if not exists (
    select 1 from public.ingredients
    where id = 'prepared-batter' and active
  ) then
    raise exception 'ST-07 requires an active prepared-batter inventory ingredient';
  end if;
  if not exists (
    select 1 from public.shared_recipe_ingredients
    where shared_recipe_id = (
      select id from public.shared_recipes where recipe_code = 'shared-batter'
    )
      and automatic_consumption_enabled
      and ingredient_id <> 'prepared-batter'
  ) then
    raise exception 'ST-07 requires at least one active raw batter ingredient';
  end if;
  if exists (
    select 1
    from public.shared_recipe_ingredients line
    join public.ingredients ingredient on ingredient.id = line.ingredient_id
    where line.shared_recipe_id = (
      select id from public.shared_recipes where recipe_code = 'shared-batter'
    )
      and line.automatic_consumption_enabled
      and ingredient.id <> 'prepared-batter'
      and (not ingredient.active or line.unit_of_measure <> ingredient.unit)
  ) then
    raise exception 'ST-07 shared batter raw ingredient configuration is inactive or has a unit mismatch';
  end if;
  if not exists (
    select 1 from public.ingredients
    where id = 'prepared-batter'
      and unit = 'bottle'
      and unit = (select prepared_unit from public.shared_recipes where recipe_code = 'shared-batter')
  ) then
    raise exception 'ST-07 prepared-batter inventory and recipe must use bottle units';
  end if;
end;
$$;

create temporary table st07_recipe_snapshot on commit drop as
select jsonb_build_object(
  'recipe_code', recipe.recipe_code,
  'name', recipe.name,
  'prepared_quantity', recipe.prepared_quantity,
  'prepared_unit', recipe.prepared_unit,
  'estimated_yield_pieces', recipe.estimated_yield_pieces,
  'active', recipe.active,
  'automatic_consumption_enabled', recipe.automatic_consumption_enabled,
  'version', recipe.version,
  'ingredients', coalesce(
    jsonb_agg(jsonb_build_array(
      line.ingredient_id,
      line.quantity_required,
      line.unit_of_measure,
      line.automatic_consumption_enabled
    ) order by line.ingredient_id) filter (where line.ingredient_id is not null),
    '[]'::jsonb
  )
) as configuration
from public.shared_recipes recipe
left join public.shared_recipe_ingredients line on line.shared_recipe_id = recipe.id
where recipe.recipe_code = 'shared-batter'
group by recipe.id;
grant select on st07_recipe_snapshot to authenticated;

insert into public.branches (id, code, name, city, address, active)
select branch_a_id, branch_a_code, 'ST-07 Batter Test A', '', '', true
from st07_fixture
union all
select branch_b_id, branch_b_code, 'ST-07 Batter Test B', '', '', true
from st07_fixture;

do $$
begin
  if not exists (
    select 1 from public.branch_inventory inventory
    join public.shared_recipe_ingredients line on line.ingredient_id = inventory.ingredient_id
    join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
    where recipe.recipe_code = 'shared-batter'
      and line.automatic_consumption_enabled
      and line.ingredient_id <> 'prepared-batter'
      and inventory.branch_id = (select branch_a_id from st07_fixture)
  ) then
    raise exception 'ST-07 test branches were not provisioned with the required raw ingredient inventory';
  end if;
  if not exists (
    select 1 from public.branch_inventory
    where branch_id = (select branch_a_id from st07_fixture)
      and ingredient_id = 'prepared-batter'
  ) then
    raise exception 'ST-07 test branches were not provisioned with prepared-batter inventory';
  end if;
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    (select staff_a_id from st07_fixture),
    'authenticated', 'authenticated',
    (select staff_a_email from st07_fixture),
    '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"ST-07 Staff A"}'
  ),
  (
    (select staff_b_id from st07_fixture),
    'authenticated', 'authenticated',
    (select staff_b_email from st07_fixture),
    '', now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"ST-07 Staff B"}'
  );

update public.profiles
set role = 'staff', branch_id = (select branch_a_id from st07_fixture), active = true
where id = (select staff_a_id from st07_fixture);
update public.profiles
set role = 'staff', branch_id = (select branch_b_id from st07_fixture), active = true
where id = (select staff_b_id from st07_fixture);

insert into auth.sessions (id, user_id, created_at, updated_at)
select session_a_id, staff_a_id, now(), now() from st07_fixture
union all
select session_b_id, staff_b_id, now(), now() from st07_fixture;
insert into public.business_day_sessions (session_id, user_id, business_date)
select session_a_id, staff_a_id, (clock_timestamp() at time zone 'Asia/Manila')::date
from st07_fixture
union all
select session_b_id, staff_b_id, (clock_timestamp() at time zone 'Asia/Manila')::date
from st07_fixture;

update public.branch_inventory
set quantity = case when ingredient_id = 'prepared-batter' then 0 else 100000 end
where branch_id in (
  (select branch_a_id from st07_fixture),
  (select branch_b_id from st07_fixture)
);

update st07_fixture
set insufficient_ingredient_id = (
  select line.ingredient_id
  from public.shared_recipe_ingredients line
  join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
  where recipe.recipe_code = 'shared-batter'
    and line.automatic_consumption_enabled
    and line.ingredient_id <> 'prepared-batter'
  order by line.ingredient_id
  limit 1
);
update public.branch_inventory
set quantity = 0
where branch_id = (select branch_b_id from st07_fixture)
  and ingredient_id = (select insufficient_ingredient_id from st07_fixture);

select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_batter_batch(uuid,text,integer)',
    'execute'
  ),
  'authenticated staff can call the quantity-checked batter RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.prepare_batter_batch(uuid,text)',
    'execute'
  ),
  'existing two-argument batter RPC callers remain compatible'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.prepare_batter_batch(uuid,text,integer)',
    'execute'
  ),
  'anonymous clients cannot prepare batter batches'
);
select ok(
  not has_table_privilege('authenticated', 'public.batter_preparation_batches', 'INSERT'),
  'staff cannot bypass the preparation RPC by inserting batch rows directly'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select staff_a_id::text from st07_fixture),
  true
);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object(
    'sub', staff_a_id::text,
    'session_id', session_a_id::text,
    'role', 'authenticated'
  )::text from st07_fixture),
  true
);

select throws_ok(
  format(
    'select * from public.prepare_batter_batch(%L::uuid, %L, 4)',
    (select branch_a_id from st07_fixture),
    'ST07-INVALID-FOUR'
  ),
  'P0001',
  'Prepared batter batch quantity must be exactly 5 bottles',
  'a request for four bottles is rejected'
);
select throws_ok(
  format(
    'select * from public.prepare_batter_batch(%L::uuid, %L, 6)',
    (select branch_a_id from st07_fixture),
    'ST07-INVALID-SIX'
  ),
  'P0001',
  'Prepared batter batch quantity must be exactly 5 bottles',
  'a request for six bottles is rejected'
);
select throws_ok(
  format(
    'select * from public.prepare_batter_batch(%L::uuid, %L, null::integer)',
    (select branch_a_id from st07_fixture),
    'ST07-INVALID-NULL'
  ),
  'P0001',
  'Prepared batter batch quantity must be exactly 5 bottles',
  'a null prepared quantity is rejected'
);

select is(
  (
    select bottle_count
    from public.prepare_batter_batch(
      (select branch_a_id from st07_fixture),
      'ST07-FIVE-BOTTLE-SUCCESS',
      5
    )
  ),
  5,
  'a successful preparation records exactly five bottles'
);
select is(
  (
    select prepared_quantity
    from public.batter_preparation_batches
    where batch_reference = 'ST07-FIVE-BOTTLE-SUCCESS'
  ),
  5::numeric,
  'a successful preparation records a prepared quantity of five'
);
select is(
  (
    select prepared_unit
    from public.batter_preparation_batches
    where batch_reference = 'ST07-FIVE-BOTTLE-SUCCESS'
  ),
  'bottle',
  'the saved Owner recipe unit remains in use'
);
select is(
  (
    select estimated_yield_pieces
    from public.batter_preparation_batches
    where batch_reference = 'ST07-FIVE-BOTTLE-SUCCESS'
  ),
  (
    select round(estimated_yield_pieces * 5 / prepared_quantity, 3)
    from public.shared_recipes
    where recipe_code = 'shared-batter'
  ),
  'the saved recipe yield is scaled to the fixed five-bottle batch'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where branch_id = (select branch_a_id from st07_fixture)
      and notes = 'ST07-FIVE-BOTTLE-SUCCESS'
      and type = 'usage'
  ),
  (
    select count(*)::integer
    from public.shared_recipe_ingredients line
    join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
    where recipe.recipe_code = 'shared-batter'
      and line.automatic_consumption_enabled
      and line.ingredient_id <> 'prepared-batter'
  ),
  'one raw ingredient deduction is recorded for each configured recipe line'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements movement
    where movement.branch_id = (select branch_a_id from st07_fixture)
      and movement.notes = 'ST07-FIVE-BOTTLE-SUCCESS'
      and movement.type = 'usage'
      and not exists (
        select 1
        from public.shared_recipe_ingredients line
        join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
        where recipe.recipe_code = 'shared-batter'
          and line.automatic_consumption_enabled
          and line.ingredient_id = movement.ingredient_id
          and movement.quantity = round(
            line.quantity_required * 5 / recipe.prepared_quantity,
            3
          )
      )
  ),
  0,
  'raw ingredient deductions equal configured per-bottle quantities times five'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_a_id from st07_fixture)
      and ingredient_id = 'prepared-batter'
  ),
  5::numeric,
  'prepared-batter inventory receives exactly five bottles'
);
select is(
  (
    select movement.quantity
    from public.inventory_movements movement
    join public.ingredient_batches batch on batch.id = movement.batch_id
    where movement.branch_id = (select branch_a_id from st07_fixture)
      and movement.ingredient_id = 'prepared-batter'
      and batch.batch_reference = 'ST07-FIVE-BOTTLE-SUCCESS'
  ),
  5::numeric,
  'the five-bottle stock-in movement is recorded for the batch'
);
select is(
  (
    select count(*)::integer
    from public.shared_recipe_ingredients line
    join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
    join public.branch_inventory inventory
      on inventory.branch_id = (select branch_a_id from st07_fixture)
     and inventory.ingredient_id = line.ingredient_id
    where recipe.recipe_code = 'shared-batter'
      and line.automatic_consumption_enabled
      and line.ingredient_id <> 'prepared-batter'
      and inventory.quantity <> 100000 - round(
        line.quantity_required * 5 / recipe.prepared_quantity,
        3
      )
  ),
  0,
  'branch raw stock is deducted according to each saved per-bottle requirement'
);
select is(
  (select configuration from st07_recipe_snapshot),
  (
    select jsonb_build_object(
      'recipe_code', recipe.recipe_code,
      'name', recipe.name,
      'prepared_quantity', recipe.prepared_quantity,
      'prepared_unit', recipe.prepared_unit,
      'estimated_yield_pieces', recipe.estimated_yield_pieces,
      'active', recipe.active,
      'automatic_consumption_enabled', recipe.automatic_consumption_enabled,
      'version', recipe.version,
      'ingredients', coalesce(
        jsonb_agg(jsonb_build_array(
          line.ingredient_id,
          line.quantity_required,
          line.unit_of_measure,
          line.automatic_consumption_enabled
        ) order by line.ingredient_id) filter (where line.ingredient_id is not null),
        '[]'::jsonb
      )
    )
    from public.shared_recipes recipe
    left join public.shared_recipe_ingredients line on line.shared_recipe_id = recipe.id
    where recipe.recipe_code = 'shared-batter'
    group by recipe.id
  ),
  'preparation leaves saved Owner recipe settings and ingredient rows unchanged'
);
select is(
  (
    select batch_reference
    from public.prepare_batter_batch(
      (select branch_a_id from st07_fixture),
      'ST07-FIVE-BOTTLE-SUCCESS'
    )
  ),
  'ST07-FIVE-BOTTLE-SUCCESS',
  'the existing two-argument RPC remains usable for a five-bottle batch'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements movement
    left join public.ingredient_batches batch on batch.id = movement.batch_id
    where movement.branch_id = (select branch_a_id from st07_fixture)
      and (
        movement.notes = 'ST07-FIVE-BOTTLE-SUCCESS'
        or batch.batch_reference = 'ST07-FIVE-BOTTLE-SUCCESS'
      )
  ),
  (
    select count(*)::integer + 1
    from public.shared_recipe_ingredients line
    join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
    where recipe.recipe_code = 'shared-batter'
      and line.automatic_consumption_enabled
      and line.ingredient_id <> 'prepared-batter'
  ),
  'retrying the same batch reference does not create duplicate movements'
);
select is(
  (
    select count(*)::integer
    from public.shared_recipe_ingredients line
    join public.shared_recipes recipe on recipe.id = line.shared_recipe_id
    join public.branch_inventory inventory
      on inventory.branch_id = (select branch_a_id from st07_fixture)
     and inventory.ingredient_id = line.ingredient_id
    where recipe.recipe_code = 'shared-batter'
      and line.automatic_consumption_enabled
      and line.ingredient_id <> 'prepared-batter'
      and inventory.quantity <> 100000 - round(
        line.quantity_required * 5 / recipe.prepared_quantity,
        3
      )
  ),
  0,
  'retrying the same batch reference does not deduct raw ingredients again'
);

select set_config(
  'request.jwt.claim.sub',
  (select staff_b_id::text from st07_fixture),
  true
);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object(
    'sub', staff_b_id::text,
    'session_id', session_b_id::text,
    'role', 'authenticated'
  )::text from st07_fixture),
  true
);
select throws_ok(
  format(
    'select * from public.prepare_batter_batch(%L::uuid, %L, 5)',
    (select branch_a_id from st07_fixture),
    'ST07-UNAUTHORIZED-BRANCH'
  ),
  'P0001',
  'Branch access denied',
  'staff cannot prepare batter for another branch'
);
select throws_ok(
  format(
    'select * from public.prepare_batter_batch(%L::uuid, %L, 5)',
    (select branch_b_id from st07_fixture),
    'ST07-INSUFFICIENT-STOCK'
  ),
  'P0001',
  'Transaction exceeds available stock',
  'insufficient raw ingredient stock rejects the preparation'
);
select is(
  (
    select count(*)::integer
    from public.batter_preparation_batches
    where batch_reference = 'ST07-INSUFFICIENT-STOCK'
  ),
  0,
  'failed preparation rolls back its batch record'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where branch_id = (select branch_b_id from st07_fixture)
      and notes = 'ST07-INSUFFICIENT-STOCK'
  ),
  0,
  'failed preparation rolls back any earlier line movements'
);
select throws_ok(
  format(
    'insert into public.batter_preparation_batches (
      batch_reference, branch_id, prepared_by, bottle_count,
      prepared_quantity, prepared_unit, estimated_yield_pieces
    ) values (%L, %L::uuid, %L::uuid, 4, 4, %L, 125)',
    'ST07-DIRECT-INVALID-BATCH',
    (select branch_b_id from st07_fixture),
    (select staff_b_id from st07_fixture),
    (select prepared_unit from public.shared_recipes where recipe_code = 'shared-batter')
  ),
  '42501',
  'permission denied for table batter_preparation_batches',
  'staff cannot bypass the fixed quantity rule with a direct batch insert'
);

reset role;
select * from finish();
rollback;
