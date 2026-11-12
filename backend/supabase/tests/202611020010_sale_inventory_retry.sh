#!/usr/bin/env bash
set -euo pipefail

database_url=${TAKOSYNC_TEST_DATABASE_URL:?Set TAKOSYNC_TEST_DATABASE_URL to an isolated local test database}

node -e '
  const { hostname } = new URL(process.argv[1]);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    console.error("Refusing to run the sale inventory retry test against a non-local database.");
    process.exit(1);
  }
' "$database_url"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the sale inventory retry test." >&2
  exit 1
fi

psql_test=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
branch_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
owner_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
session_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
product_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
variant_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
transaction_reference="TEST-SALE-INVENTORY-RETRY-${branch_id}"
branch_code="TEST-SALE-INVENTORY-${branch_id}"
product_name="Sale inventory retry product ${product_id}"
shared_recipe_id='30000000-0000-4000-8000-000000000001'

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
delete from public.shared_recipe_products where product_id = '${product_id}';
delete from public.recipes where product_id = '${product_id}';
delete from public.branch_product_visibility where branch_id = '${branch_id}';
delete from public.product_variants where id = '${variant_id}';
delete from public.products where id = '${product_id}';
delete from public.branch_inventory where branch_id = '${branch_id}';
delete from public.business_day_sessions where session_id = '${session_id}';
delete from auth.sessions where id = '${session_id}';
delete from auth.users where id = '${owner_id}';
delete from public.branches where id = '${branch_id}';
SQL
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

"${psql_test[@]}" <<SQL
insert into public.branches (id, code, name, city, address, active)
values ('${branch_id}', '${branch_code}', 'Sale Inventory Retry Test Branch', '', '', true);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '${owner_id}', 'authenticated', 'authenticated',
  'sale-inventory-retry-${owner_id}@takosync.invalid', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sale Inventory Retry Test Owner"}'
);

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '${owner_id}';

insert into auth.sessions (id, user_id, created_at, updated_at)
values ('${session_id}', '${owner_id}', now(), now());

insert into public.products (id, product_name, description, price, is_available)
values ('${product_id}', '${product_name}', 'Isolated sale inventory retry fixture', 10.00, true);

insert into public.product_variants (
  id, product_id, variant_code, size_label, price, piece_count, active, is_available
) values (
  '${variant_id}', '${product_id}', 'TEST', 'Test size', 10.00, 1, true, true
);

do \$\$
declare visibility_is_enabled boolean;
begin
  select is_visible into visibility_is_enabled
  from public.branch_product_visibility
  where branch_id = '${branch_id}' and product_variant_id = '${variant_id}';
  if not found or not visibility_is_enabled then
    raise exception 'Test variant visibility was not provisioned as expected';
  end if;
end;
\$\$;

insert into public.shared_recipe_products (shared_recipe_id, product_id, active)
values ('${shared_recipe_id}', '${product_id}', true);

insert into public.recipes (
  product_id, ingredient_id, quantity_required, unit_of_measure,
  automatic_consumption_enabled
) values ('${product_id}', 'flour', 0.500, 'kg', true);

update public.branch_inventory
set quantity = case ingredient_id
  when 'flour' then 1.000
  when 'prepared-batter' then 0.000
  else quantity
end
where branch_id = '${branch_id}' and ingredient_id in ('flour', 'prepared-batter');

do \$\$
begin
  if (select count(*) from public.branch_inventory
      where branch_id = '${branch_id}'
        and ingredient_id in ('flour', 'prepared-batter')) <> 2 then
    raise exception 'Required test inventory rows were not provisioned';
  end if;
end;
\$\$;
SQL

items='[{"variant_id":"'"${variant_id}"'","quantity":1.000,"unit_price":10.00}]'
sale_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select set_config('request.jwt.claims', '{\"sub\":\"${owner_id}\",\"session_id\":\"${session_id}\",\"role\":\"authenticated\",\"aud\":\"authenticated\"}', false)" \
  -c "select public.authorize_business_session()" \
  -c "select (public.submit_sale('${transaction_reference}', '${branch_id}', 'Cash', 10.00, '${items}'::jsonb, '[]'::jsonb)).id")
sale_id=$(printf '%s\n' "$sale_output" | tail -n 1)
if [[ -z "$sale_id" ]]; then
  echo "submit_sale did not return a sale ID." >&2
  exit 1
fi

failed_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.sales where id = '${sale_id}' and transaction_reference = '${transaction_reference}'),
    (select status from public.sales where id = '${sale_id}'),
    (select inventory_processing_status from public.sales where id = '${sale_id}'),
    (select inventory_processing_error from public.sales where id = '${sale_id}'),
    (select status from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select attempt_count from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id <> 'prepared-batter'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter')
")
expected_failed_state="1|completed|failed|Transaction exceeds available stock|failed|1|0|0|0|1.000|0.000"
if [[ "$failed_state" != "$expected_failed_state" ]]; then
  echo "Unexpected failed sale state: ${failed_state}" >&2
  exit 1
fi

prepared_consumption=$("${psql_test[@]}" -Atc "
  select to_char(round(prepared_quantity / estimated_yield_pieces, 3), 'FM999999990.000')
  from public.shared_recipes where id = '${shared_recipe_id}'
")
if [[ -z "$prepared_consumption" ]]; then
  echo "Could not determine prepared-batter consumption." >&2
  exit 1
fi

replenish_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select set_config('request.jwt.claims', '{\"sub\":\"${owner_id}\",\"session_id\":\"${session_id}\",\"role\":\"authenticated\",\"aud\":\"authenticated\"}', false)" \
  -c "select public.authorize_business_session()" \
  -c "select count(*) from public.record_inventory_transactions('${branch_id}', '[{\"ingredient_id\":\"prepared-batter\",\"type\":\"stock_in\",\"quantity\":1.000,\"batch_reference\":\"TEST-SALE-INVENTORY-RETRY-${branch_id}\",\"reason\":\"Inventory retry replenishment\"}]'::jsonb)")
if [[ "$(printf '%s\n' "$replenish_output" | tail -n 1)" != "1" ]]; then
  echo "Prepared-batter replenishment did not create exactly one movement: ${replenish_output}" >&2
  exit 1
fi

replenished_quantity=$("${psql_test[@]}" -Atc "
  select to_char(quantity, 'FM999999990.000')
  from public.branch_inventory
  where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter'
")
if [[ "$replenished_quantity" != "1.000" ]]; then
  echo "Unexpected replenished prepared-batter quantity: ${replenished_quantity}" >&2
  exit 1
fi

retry_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select set_config('request.jwt.claims', '{\"sub\":\"${owner_id}\",\"session_id\":\"${session_id}\",\"role\":\"authenticated\",\"aud\":\"authenticated\"}', false)" \
  -c "select public.authorize_business_session()" \
  -c "select public.process_sale_inventory('${sale_id}')")
if [[ "$retry_output" != *"completed"* ]]; then
  echo "Inventory retry did not report completed: ${retry_output}" >&2
  exit 1
fi

completed_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.sales where id = '${sale_id}' and transaction_reference = '${transaction_reference}'),
    (select status from public.sales where id = '${sale_id}'),
    (select inventory_processing_status from public.sales where id = '${sale_id}'),
    (select inventory_processing_error from public.sales where id = '${sale_id}'),
    (select status from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select attempt_count from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'flour'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'prepared-batter'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}' and recipe_type = 'product'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}' and recipe_type = 'shared'),
    (select to_char(sum(movement), 'FM999999990.000') from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'flour'),
    (select to_char(sum(movement), 'FM999999990.000') from public.inventory_movements where sale_id = '${sale_id}' and ingredient_id = 'prepared-batter'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}' and sale_id is not null)
")
expected_completed_state="1|completed|completed||completed|2|2|1|1|2|1|1|-0.500|-${prepared_consumption}|0.500|0.960|2"
if [[ "$completed_state" != "$expected_completed_state" ]]; then
  echo "Unexpected completed sale state: ${completed_state}" >&2
  exit 1
fi

second_retry_output=$("${psql_test[@]}" -At \
  -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
  -c "select set_config('request.jwt.claims', '{\"sub\":\"${owner_id}\",\"session_id\":\"${session_id}\",\"role\":\"authenticated\",\"aud\":\"authenticated\"}', false)" \
  -c "select public.authorize_business_session()" \
  -c "select public.process_sale_inventory('${sale_id}')")
if [[ "$second_retry_output" != *"completed"* ]]; then
  echo "Retry after completion did not report completed: ${second_retry_output}" >&2
  exit 1
fi

final_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.sales where branch_id = '${branch_id}'),
    (select attempt_count from public.sale_inventory_processing where sale_id = '${sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${sale_id}'),
    (select count(*) from public.sale_consumption_snapshots where sale_id = '${sale_id}'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select to_char(quantity, 'FM999999990.000') from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'prepared-batter')
")
if [[ "$final_state" != "1|2|2|2|0.500|0.960" ]]; then
  echo "Second retry duplicated inventory state: ${final_state}" >&2
  exit 1
fi

echo "PASS: failed inventory processing rolled back atomically, retry succeeded once, and completed retry was idempotent."
