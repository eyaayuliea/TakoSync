#!/usr/bin/env bash
set -euo pipefail

database_url=${TAKOSYNC_TEST_DATABASE_URL:?Set TAKOSYNC_TEST_DATABASE_URL to an isolated local test database}

node -e '
  const { hostname } = new URL(process.argv[1]);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    console.error("Refusing to run the prepared batter integration test against a non-local database.");
    process.exit(1);
  }
' "$database_url"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the prepared batter integration test." >&2
  exit 1
fi

psql_test=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
branch_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
owner_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
product_a_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
product_b_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
variant_a_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
variant_b_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
recipe_a_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
recipe_b_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
shared_recipe_id='30000000-0000-4000-8000-000000000001'
branch_code="TEST-PREPARED-BATTER-${branch_id}"
batch_reference="TEST-PREPARED-BATTER-BATCH-${branch_id}"
sale_reference="TEST-PREPARED-BATTER-SALE-${branch_id}"
raw_failure_reference="TEST-PREPARED-BATTER-RAW-FAILURE-${branch_id}"
prepared_failure_reference="TEST-PREPARED-BATTER-PREPARED-FAILURE-${branch_id}"

cleanup() {
  set +e
  if [[ -n "${branch_id:-}" ]]; then
    "${psql_test[@]}" <<SQL
delete from public.inventory_movements where branch_id = '${branch_id}';
delete from public.audit_logs where branch_id = '${branch_id}';
delete from public.ingredient_batches where branch_id = '${branch_id}';
delete from public.sale_consumption_snapshots
where sale_id in (select id from public.sales where branch_id = '${branch_id}');
delete from public.sale_inventory_processing
where sale_id in (select id from public.sales where branch_id = '${branch_id}');
delete from public.sale_addons
where sale_id in (select id from public.sales where branch_id = '${branch_id}');
delete from public.sale_items
where sale_id in (select id from public.sales where branch_id = '${branch_id}');
delete from public.sales where branch_id = '${branch_id}';
delete from public.batter_preparation_batches where branch_id = '${branch_id}';
delete from public.shared_recipe_products
where product_id in ('${product_a_id}', '${product_b_id}');
delete from public.recipes
where product_id in ('${product_a_id}', '${product_b_id}');
delete from public.branch_product_visibility where branch_id = '${branch_id}';
delete from public.product_variants
where id in ('${variant_a_id}', '${variant_b_id}');
delete from public.products
where id in ('${product_a_id}', '${product_b_id}');
delete from public.branch_inventory where branch_id = '${branch_id}';
delete from auth.users where id = '${owner_id}';
delete from public.branches where id = '${branch_id}';
SQL
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

"${psql_test[@]}" <<SQL
do \$\$
declare
  recipe public.shared_recipes%rowtype;
  raw_line_count integer;
begin
  select * into recipe
  from public.shared_recipes
  where id = '${shared_recipe_id}'
    and recipe_code = 'shared-batter'
    and active and automatic_consumption_enabled;
  if not found then
    raise exception 'Configured active shared batter recipe is missing';
  end if;
  if recipe.prepared_quantity <= 0 or recipe.estimated_yield_pieces <= 0 then
    raise exception 'Configured shared batter quantity or yield is invalid';
  end if;
  select count(*) into raw_line_count
  from public.shared_recipe_ingredients
  where shared_recipe_id = recipe.id
    and automatic_consumption_enabled
    and ingredient_id <> 'prepared-batter';
  if raw_line_count = 0 then
    raise exception 'Configured shared batter recipe has no raw ingredients';
  end if;
  if exists (
    select 1
    from public.shared_recipe_ingredients line
    join public.ingredients ingredient on ingredient.id = line.ingredient_id
    where line.shared_recipe_id = recipe.id
      and line.automatic_consumption_enabled
      and line.ingredient_id <> 'prepared-batter'
      and ingredient.unit <> line.unit_of_measure
  ) then
    raise exception 'Configured shared batter recipe has a unit mismatch';
  end if;
  if exists (
    select 1 from public.shared_recipe_ingredients
    where shared_recipe_id = recipe.id
      and ingredient_id in ('octopus', 'sauces')
      and automatic_consumption_enabled
  ) then
    raise exception 'Product-specific test ingredients overlap shared batter ingredients';
  end if;
end;
\$\$;

insert into public.branches (id, code, name, city, address, active)
values ('${branch_id}', '${branch_code}', 'Prepared Batter Test Branch', '', '', true);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '${owner_id}', 'authenticated', 'authenticated',
  'prepared-batter-${owner_id}@takosync.invalid', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Prepared Batter Test Owner"}'
);

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '${owner_id}';

insert into public.products (id, product_name, description, price, is_available)
values
  ('${product_a_id}', 'Prepared Batter Product A ${product_a_id}', 'Prepared batter fixture A', 10.00, true),
  ('${product_b_id}', 'Prepared Batter Product B ${product_b_id}', 'Prepared batter fixture B', 12.00, true);

insert into public.product_variants (
  id, product_id, variant_code, size_label, price, piece_count, active, is_available
) values
  ('${variant_a_id}', '${product_a_id}', 'TEST-A', '4 pieces', 10.00, 4, true, true),
  ('${variant_b_id}', '${product_b_id}', 'TEST-B', '8 pieces', 12.00, 8, true, true);

insert into public.shared_recipe_products (shared_recipe_id, product_id, active)
values
  ('${shared_recipe_id}', '${product_a_id}', true),
  ('${shared_recipe_id}', '${product_b_id}', true);

insert into public.recipes (
  id, product_id, ingredient_id, quantity_required, unit_of_measure,
  automatic_consumption_enabled
) values
  ('${recipe_a_id}', '${product_a_id}', 'octopus', 0.250, 'kg', true),
  ('${recipe_b_id}', '${product_b_id}', 'sauces', 0.100, 'L', true);

do \$\$
declare visibility_count integer;
begin
  select count(*) into visibility_count
  from public.branch_product_visibility
  where branch_id = '${branch_id}'
    and product_variant_id in ('${variant_a_id}', '${variant_b_id}')
    and is_visible;
  if visibility_count <> 2 then
    raise exception 'Test product visibility was not provisioned as expected';
  end if;
end;
\$\$;

update public.branch_inventory inventory
set quantity = line.quantity_required + 1.000
from public.shared_recipe_ingredients line
where inventory.branch_id = '${branch_id}'
  and inventory.ingredient_id = line.ingredient_id
  and line.shared_recipe_id = '${shared_recipe_id}'
  and line.automatic_consumption_enabled
  and line.ingredient_id <> 'prepared-batter';

update public.branch_inventory
set quantity = 1.000
where branch_id = '${branch_id}'
  and ingredient_id in ('octopus', 'sauces');

do \$\$
begin
  if (select count(*) from public.branch_inventory
      where branch_id = '${branch_id}'
        and ingredient_id in ('octopus', 'sauces', 'prepared-batter')) <> 3 then
    raise exception 'Product-specific or prepared-batter inventory rows were not provisioned';
  end if;
end;
\$\$;
SQL

batch_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select (public.prepare_batter_batch('${branch_id}', '${batch_reference}')).batch_reference")
created_batch_reference=$(printf '%s' "$batch_output" | tail -n 1)
if [[ -z "$created_batch_reference" ]]; then
  echo "prepare_batter_batch did not return a batch reference." >&2
  exit 1
fi

raw_line_count=$("${psql_test[@]}" -Atc "
  select count(*) from public.shared_recipe_ingredients
  where shared_recipe_id = '${shared_recipe_id}'
    and automatic_consumption_enabled
    and ingredient_id <> 'prepared-batter'
")
prepared_quantity=$("${psql_test[@]}" -Atc "
  select to_char(prepared_quantity, 'FM999999990.000')
  from public.shared_recipes where id = '${shared_recipe_id}'
")
yield_pieces=$("${psql_test[@]}" -Atc "
  select estimated_yield_pieces
  from public.shared_recipes where id = '${shared_recipe_id}'
")
sale_pieces=20
prepared_sale_quantity=$("${psql_test[@]}" -Atc "
  select to_char(round(${prepared_quantity} * ${sale_pieces} / ${yield_pieces}, 3), 'FM999999990.000')
")
expected_prepared_balance=$("${psql_test[@]}" -Atc "
  select to_char(round(${prepared_quantity} - ${prepared_sale_quantity}, 3), 'FM999999990.000')
")

preparation_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.batter_preparation_batches where batch_reference = '${created_batch_reference}' and branch_id = '${branch_id}'),
    (select count(*) from public.inventory_movements where branch_id = '${branch_id}' and notes = '${batch_reference}' and type = 'usage'),
    (select count(*) from public.inventory_movements movement
      join public.ingredient_batches batch on batch.id = movement.batch_id
      where movement.branch_id = '${branch_id}'
        and movement.ingredient_id = 'prepared-batter'
        and movement.type = 'stock_in'
        and batch.batch_reference = '${batch_reference}'),
    (select count(*) from public.inventory_movements movement
      join public.shared_recipe_ingredients line on line.shared_recipe_id = '${shared_recipe_id}'
        and line.ingredient_id = movement.ingredient_id
        and line.automatic_consumption_enabled
        and line.ingredient_id <> 'prepared-batter'
        and movement.quantity = line.quantity_required
        and movement.movement = -line.quantity_required
      where movement.branch_id = '${branch_id}' and movement.notes = '${batch_reference}' and movement.type = 'usage'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter'),
    (select count(*) from public.inventory_movements where branch_id = '${branch_id}' and notes = '${batch_reference}' and sale_id is not null)
")
expected_preparation_state="1|${raw_line_count}|1|${raw_line_count}|${prepared_quantity}|0"
if [[ "$preparation_state" != "$expected_preparation_state" ]]; then
  echo "Unexpected batter preparation state: ${preparation_state}" >&2
  exit 1
fi

items='[{"variant_id":"'"${variant_a_id}"'","quantity":1.000,"unit_price":10.00},{"variant_id":"'"${variant_b_id}"'","quantity":2.000,"unit_price":12.00}]'
sale_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select (public.submit_sale('${sale_reference}', '${branch_id}', 'Cash', 34.00, '${items}'::jsonb, '[]'::jsonb)).id")
sale_id=$(printf '%s' "$sale_output" | tail -n 1)
if [[ -z "$sale_id" ]]; then
  echo "submit_sale did not return a sale ID." >&2
  exit 1
fi

sale_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.sales where id = '${sale_id}' and transaction_reference = '${sale_reference}'),
    (select status from public.sales where id = '${sale_id}'),
    (select inventory_processing_status from public.sales where id = '${sale_id}'),
    (select attempt_count from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'prepared-batter'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'octopus'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'sauces'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id in (select ingredient_id from public.shared_recipe_ingredients where shared_recipe_id = '${shared_recipe_id}' and ingredient_id <> 'prepared-batter')),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}' and recipe_type = 'shared'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}' and recipe_type = 'product'),
    (select to_char(quantity_consumed, 'FM999999990.000') from public.sale_consumption_snapshots where sale_id = '${sale_id}' and ingredient_id = 'prepared-batter'),
    (select to_char(applicable_pieces, 'FM999999990.000') from public.sale_consumption_snapshots where sale_id = '${sale_id}' and ingredient_id = 'prepared-batter'),
    (select to_char(quantity_consumed, 'FM999999990.000') from public.sale_consumption_snapshots where sale_id = '${sale_id}' and ingredient_id = 'octopus'),
    (select to_char(quantity_consumed, 'FM999999990.000') from public.sale_consumption_snapshots where sale_id = '${sale_id}' and ingredient_id = 'sauces'),
    (select to_char(sum(movement), 'FM999999990.000') from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'prepared-batter'),
    (select to_char(sum(movement), 'FM999999990.000') from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'octopus'),
    (select to_char(sum(movement), 'FM999999990.000') from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'sauces'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'octopus'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'sauces'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and notes = 'sale:${sale_id}')
")
expected_sale_state="1|completed|completed|1|3|1|1|1|0|3|1|2|${prepared_sale_quantity}|20.000|0.250|0.200|-${prepared_sale_quantity}|-0.250|-0.200|0.750|0.800|${expected_prepared_balance}|3"
if [[ "$sale_state" != "$expected_sale_state" ]]; then
  echo "Unexpected prepared batter sale state: ${sale_state}" >&2
  exit 1
fi

retry_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select public.process_sale_inventory('${sale_id}')")
if [[ "$retry_output" != *"completed"* ]]; then
  echo "Reprocessing the completed sale did not report completed: ${retry_output}" >&2
  exit 1
fi

retry_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select attempt_count from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'octopus'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'sauces'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter')
")
expected_retry_state="1|3|3|0.750|0.800|${expected_prepared_balance}"
if [[ "$retry_state" != "$expected_retry_state" ]]; then
  echo "Completed sale was not idempotent: ${retry_state}" >&2
  exit 1
fi

"${psql_test[@]}" -c "update public.branch_inventory set quantity = 0.000 where branch_id = '${branch_id}' and ingredient_id = 'octopus';"
raw_failure_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select (public.submit_sale('${raw_failure_reference}', '${branch_id}', 'Cash', 10.00, '[{\"variant_id\":\"${variant_a_id}\",\"quantity\":1.000,\"unit_price\":10.00}]'::jsonb, '[]'::jsonb)).id")
raw_failure_sale_id=$(printf '%s' "$raw_failure_output" | tail -n 1)
raw_failure_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select status from public.sales where id = '${raw_failure_sale_id}'),
    (select inventory_processing_status from public.sales where id = '${raw_failure_sale_id}'),
    (select inventory_processing_error from public.sales where id = '${raw_failure_sale_id}'),
    (select attempt_count from public.sale_inventory_processing where sale_id = '${raw_failure_sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${raw_failure_sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${raw_failure_sale_id}'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'octopus'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter')
")
if [[ "$raw_failure_state" != "completed|failed|Transaction exceeds available stock|1|0|0|0.000|${expected_prepared_balance}" ]]; then
  echo "Raw ingredient failure was not atomic: ${raw_failure_state}" >&2
  exit 1
fi

"${psql_test[@]}" -c "update public.branch_inventory set quantity = case ingredient_id when 'octopus' then 1.000 when 'prepared-batter' then 0.000 else quantity end where branch_id = '${branch_id}' and ingredient_id in ('octopus', 'prepared-batter');"
prepared_failure_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select (public.submit_sale('${prepared_failure_reference}', '${branch_id}', 'Cash', 10.00, '[{\"variant_id\":\"${variant_a_id}\",\"quantity\":1.000,\"unit_price\":10.00}]'::jsonb, '[]'::jsonb)).id")
prepared_failure_sale_id=$(printf '%s' "$prepared_failure_output" | tail -n 1)
prepared_failure_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select status from public.sales where id = '${prepared_failure_sale_id}'),
    (select inventory_processing_status from public.sales where id = '${prepared_failure_sale_id}'),
    (select inventory_processing_error from public.sales where id = '${prepared_failure_sale_id}'),
    (select attempt_count from public.sale_inventory_processing where sale_id = '${prepared_failure_sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${prepared_failure_sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${prepared_failure_sale_id}'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'octopus'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter')
")
if [[ "$prepared_failure_state" != "completed|failed|Transaction exceeds available stock|1|0|0|1.000|0.000" ]]; then
  echo "Prepared batter failure was not atomic: ${prepared_failure_state}" >&2
  exit 1
fi

echo "PASS: batter preparation, shared/product recipe aggregation, sale idempotency, and atomic shortage handling were verified."
