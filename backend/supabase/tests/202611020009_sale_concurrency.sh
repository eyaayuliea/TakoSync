#!/usr/bin/env bash
set -euo pipefail

database_url=${TAKOSYNC_TEST_DATABASE_URL:?Set TAKOSYNC_TEST_DATABASE_URL to an isolated local test database}

node -e '
  const { hostname } = new URL(process.argv[1]);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    console.error("Refusing to run the sale concurrency test against a non-local database.");
    process.exit(1);
  }
' "$database_url"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the sale concurrency test." >&2
  exit 1
fi

psql_test=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
branch_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
owner_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
product_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
variant_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
addon_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
transaction_reference="TEST-SALE-CONCURRENCY-${branch_id}"
duplicate_item_reference="TEST-SALE-DUPLICATE-ITEM-${branch_id}"
duplicate_addon_reference="TEST-SALE-DUPLICATE-ADDON-${branch_id}"
branch_code="TEST-SALE-${branch_id}"
product_name="Sale concurrency product ${product_id}"
addon_code="sale-concurrency-addon-${addon_id}"
addon_name="Sale concurrency add-on ${addon_id}"
delay_function="public.sale_concurrency_delay_${branch_id//-/}"
delay_trigger="sale_concurrency_delay_${branch_id//-/}"

first_output=$(mktemp)
second_output=$(mktemp)
first_pid=
second_pid=

cleanup() {
  set +e
  if [[ -n "$first_pid" ]]; then
    kill "$first_pid" 2>/dev/null || true
    wait "$first_pid" 2>/dev/null || true
  fi
  if [[ -n "$second_pid" ]]; then
    kill "$second_pid" 2>/dev/null || true
    wait "$second_pid" 2>/dev/null || true
  fi

  if [[ -n "$delay_trigger" ]]; then
    "${psql_test[@]}" <<SQL
drop trigger if exists ${delay_trigger} on public.sales;
drop function if exists ${delay_function}();
SQL
  fi

  if [[ -n "$branch_id" ]]; then
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
delete from public.recipes where product_id = '${product_id}';
delete from public.branch_product_visibility where branch_id = '${branch_id}';
delete from public.product_variants where id = '${variant_id}';
delete from public.products where id = '${product_id}';
delete from public.menu_addons where id = '${addon_id}';
delete from public.branch_inventory where branch_id = '${branch_id}';
delete from auth.users where id = '${owner_id}';
delete from public.branches where id = '${branch_id}';
SQL
  fi

  rm -f "$first_output" "$second_output"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

"${psql_test[@]}" <<SQL
insert into public.branches (id, code, name, city, address, active)
values ('${branch_id}', '${branch_code}', 'Sale Concurrency Test Branch', '', '', true);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '${owner_id}', 'authenticated', 'authenticated',
  'sale-concurrency-${owner_id}@takosync.invalid', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sale Concurrency Test Owner"}'
);

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '${owner_id}';

insert into public.products (
  id, product_name, description, price, is_available
) values (
  '${product_id}', '${product_name}', 'Isolated sale concurrency fixture', 10.00, true
);

insert into public.product_variants (
  id, product_id, variant_code, size_label, price, piece_count, active, is_available
) values (
  '${variant_id}', '${product_id}', 'TEST', 'Test size', 10.00, 1, true, true
);

do \$\$
declare
  visibility_is_enabled boolean;
begin
  select is_visible into visibility_is_enabled
  from public.branch_product_visibility
  where branch_id = '${branch_id}' and product_variant_id = '${variant_id}';
  if not found or not visibility_is_enabled then
    raise exception 'Test variant visibility was not provisioned as expected';
  end if;
end;
\$\$;

insert into public.menu_addons (
  id, addon_code, addon_name, price, active
) values (
  '${addon_id}', '${addon_code}', '${addon_name}', 1.50, true
);

insert into public.recipes (
  product_id, ingredient_id, quantity_required, unit_of_measure,
  automatic_consumption_enabled
) values (
  '${product_id}', 'flour', 2.000, 'kg', true
);

update public.branch_inventory
set quantity = 10
where branch_id = '${branch_id}' and ingredient_id = 'flour';

create function ${delay_function}()
returns trigger
language plpgsql
as \$\$
begin
  if new.transaction_reference = '${transaction_reference}' then
    perform pg_sleep(2);
  end if;
  return new;
end;
\$\$;

create trigger ${delay_trigger}
before insert on public.sales
for each row execute function ${delay_function}();
SQL

run_sale() {
  local scenario=$1
  local sale_reference=$2
  local output_file=$3
  local items=$4
  local addons=$5
  local total=$6
  local canonical_hash
  canonical_hash=$("${psql_test[@]}" -Atc "select public.compute_sale_payload_hash('${branch_id}', 'Cash', ${total}, '${items}'::jsonb, '${addons}'::jsonb)")
  printf '[submit_sale:%s] reference=%s branch_id=%s payment_method=%s total=%s items=%s addons=%s canonical_hash=%s\n' \
    "$scenario" "$sale_reference" "$branch_id" "Cash" "$total" "$items" "$addons" "$canonical_hash" >&2
  "${psql_test[@]}" -At \
    -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
    -c "select (public.submit_sale('${sale_reference}', '${branch_id}', 'Cash', ${total}, '${items}'::jsonb, '${addons}'::jsonb)).id" \
    > "$output_file"
}

assert_reference_unused() {
  local scenario=$1
  local sale_reference=$2
  local existing_count
  existing_count=$("${psql_test[@]}" -Atc "select count(*) from public.sales where transaction_reference = '${sale_reference}'")
  printf '[reference:%s] reference=%s existing_sales=%s\n' "$scenario" "$sale_reference" "$existing_count" >&2
  if [[ "$existing_count" != "0" ]]; then
    echo "Test reference is already present before scenario ${scenario}: ${sale_reference}" >&2
    exit 1
  fi
}

items='[{"variant_id":"'"${variant_id}"'","quantity":1.000,"unit_price":10.00}]'
addons='[{"addon_id":"'"${addon_id}"'","quantity":1.000,"unit_price":1.50}]'
assert_reference_unused concurrent "$transaction_reference"
assert_reference_unused duplicate-item "$duplicate_item_reference"
assert_reference_unused duplicate-add-on "$duplicate_addon_reference"

run_sale concurrent-1 "$transaction_reference" "$first_output" "$items" "$addons" 11.50 &
first_pid=$!
sleep 0.25
run_sale concurrent-2 "$transaction_reference" "$second_output" "$items" "$addons" 11.50 &
second_pid=$!

wait "$first_pid"
first_pid=
wait "$second_pid"
second_pid=

first_sale_id=$(tail -n 1 "$first_output")
second_sale_id=$(tail -n 1 "$second_output")
if [[ -z "$first_sale_id" || "$first_sale_id" != "$second_sale_id" ]]; then
  echo "Concurrent sale calls did not return the same sale record." >&2
  exit 1
fi

result=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.sales where transaction_reference = '${transaction_reference}'),
    (select count(*) from public.sale_items where sale_id = '${first_sale_id}'),
    (select count(*) from public.sale_addons where sale_id = '${first_sale_id}'),
    (select count(*) from public.inventory_movements where sale_id = '${first_sale_id}' and type = 'sales_consumption'),
    (select count(*) from public.inventory_movements where sale_id = '${first_sale_id}' and ingredient_id = 'flour'),
    (select quantity from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select status from public.sales where id = '${first_sale_id}'),
    (select inventory_processing_status from public.sales where id = '${first_sale_id}'),
    (select total_amount from public.sales where id = '${first_sale_id}'),
    (select sale_id from public.inventory_movements where sale_id = '${first_sale_id}' and ingredient_id = 'flour')
")
expected="1|1|1|1|1|8.000|completed|completed|11.50|${first_sale_id}"
if [[ "$result" != "$expected" ]]; then
  echo "Unexpected concurrent sale state: ${result}" >&2
  exit 1
fi

conflicting_items='[{"variant_id":"'"${variant_id}"'","quantity":2.000,"unit_price":10.00}]'
conflicting_addons="$addons"
if conflict_output=$(run_sale conflicting-payload "$transaction_reference" /dev/null "$conflicting_items" "$conflicting_addons" 21.50 2>&1); then
  echo "Conflicting sale payload unexpectedly succeeded." >&2
  exit 1
fi
if [[ "$conflict_output" != *"Transaction reference was already used with a different sale payload"* ]]; then
  echo "Conflicting payload returned an unexpected error: ${conflict_output}" >&2
  exit 1
fi

duplicate_items='[{"variant_id":"'"${variant_id}"'","quantity":1.000,"unit_price":10.00},{"variant_id":"'"${variant_id}"'","quantity":1.000,"unit_price":10.00}]'
if duplicate_item_output=$(run_sale duplicate-item "$duplicate_item_reference" /dev/null "$duplicate_items" "$addons" 21.50 2>&1); then
  echo "Duplicate item payload unexpectedly succeeded." >&2
  exit 1
fi
if [[ "$duplicate_item_output" != *"A sale variant may appear only once"* ]]; then
  echo "Duplicate item payload returned an unexpected error: ${duplicate_item_output}" >&2
  exit 1
fi

duplicate_addons='[{"addon_id":"'"${addon_id}"'","quantity":1.000,"unit_price":1.50},{"addon_id":"'"${addon_id}"'","quantity":1.000,"unit_price":1.50}]'
if duplicate_addon_output=$(run_sale duplicate-add-on "$duplicate_addon_reference" /dev/null "$items" "$duplicate_addons" 13.00 2>&1); then
  echo "Duplicate add-on payload unexpectedly succeeded." >&2
  exit 1
fi
if [[ "$duplicate_addon_output" != *"An add-on may appear only once"* ]]; then
  echo "Duplicate add-on payload returned an unexpected error: ${duplicate_addon_output}" >&2
  exit 1
fi

post_rejection_state=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select count(*) from public.sales where branch_id = '${branch_id}'),
    (select count(*) from public.sale_items item join public.sales sale on sale.id = item.sale_id where sale.branch_id = '${branch_id}'),
    (select count(*) from public.sale_addons addon join public.sales sale on sale.id = addon.sale_id where sale.branch_id = '${branch_id}'),
    (select count(*) from public.inventory_movements where branch_id = '${branch_id}'),
    (select quantity from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour')
")
if [[ "$post_rejection_state" != "1|1|1|1|8.000" ]]; then
  echo "Rejected requests changed sale or inventory state: ${post_rejection_state}" >&2
  exit 1
fi

echo "PASS: concurrent identical sales were idempotent and conflicting/duplicate payloads were rejected without extra state."
