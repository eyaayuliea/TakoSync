#!/usr/bin/env bash
set -euo pipefail

database_url=${TAKOSYNC_TEST_DATABASE_URL:?Set TAKOSYNC_TEST_DATABASE_URL to an isolated local test database}

node -e '
  const { hostname } = new URL(process.argv[1]);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    console.error("Refusing to run the concurrency test against a non-local database.");
    process.exit(1);
  }
' "$database_url"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the discrepancy concurrency test." >&2
  exit 1
fi

psql_test=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
owner_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
branch_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
check_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
line_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
reference="TEST-DISCREPANCY-${check_id}"
movement_note="Authorized physical count line ${line_id}"
delay_function="public.delay_discrepancy_test_${check_id//-/}"
delay_trigger="discrepancy_test_delay_${check_id//-/}"

first_output=$(mktemp)
second_output=$(mktemp)
first_pid=
second_pid=

cleanup() {
  if [[ -n "$first_pid" ]]; then
    wait "$first_pid" 2>/dev/null || true
  fi
  if [[ -n "$second_pid" ]]; then
    wait "$second_pid" 2>/dev/null || true
  fi
  "${psql_test[@]}" <<SQL
drop trigger if exists ${delay_trigger} on public.inventory_discrepancy_adjustments;
drop function if exists ${delay_function}();
delete from public.inventory_discrepancy_adjustments where daily_stock_count_line_id = '${line_id}';
delete from public.inventory_movements where notes = '${movement_note}';
delete from public.audit_logs where user_id = '${owner_id}';
delete from public.daily_stock_count_lines where id = '${line_id}';
delete from public.daily_stock_checks where id = '${check_id}';
delete from public.branch_inventory where branch_id = '${branch_id}';
delete from public.branches where id = '${branch_id}';
delete from auth.users where id = '${owner_id}';
SQL
  rm -f "$first_output" "$second_output"
}
trap cleanup EXIT

"${psql_test[@]}" <<SQL
insert into public.branches (id, code, name, city, address, active)
values ('${branch_id}', 'TEST-${check_id}', 'Concurrency Test Branch', '', '', true);
insert into auth.users (
  id, aud, role, email, encrypted_password, confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '${owner_id}', 'authenticated', 'authenticated',
  'concurrency-${check_id}@takosync.invalid', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Concurrency Test Owner"}'
);
update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '${owner_id}';
update public.branch_inventory
set quantity = 10
where branch_id = '${branch_id}' and ingredient_id = 'flour';
insert into public.daily_stock_checks (
  id, reference, branch_id, submitted_by, check_date, remarks, status
) values (
  '${check_id}', '${reference}', '${branch_id}', '${owner_id}',
  current_date, 'Concurrent approval test', 'pending_owner_review'
);
insert into public.daily_stock_count_lines (
  id, daily_stock_check_id, ingredient_id, recorded_quantity,
  physical_quantity, difference, unit
) values (
  '${line_id}', '${check_id}', 'flour', 10, 8, -2, 'kg'
);
create function ${delay_function}()
returns trigger
language plpgsql
as \$\$
begin
  perform pg_sleep(2);
  return new;
end;
\$\$;
create trigger ${delay_trigger}
before insert on public.inventory_discrepancy_adjustments
for each row execute function ${delay_function}();
SQL

run_approval() {
  local output_file=$1
  "${psql_test[@]}" -At \
    -c "select set_config('request.jwt.claim.sub', '${owner_id}', false)" \
    -c "select (public.authorize_inventory_discrepancy_adjustment('${line_id}', 'Concurrent test approval')).id" \
    > "$output_file"
}

run_approval "$first_output" &
first_pid=$!
sleep 0.25
run_approval "$second_output" &
second_pid=$!

wait "$first_pid"
first_pid=
wait "$second_pid"
second_pid=

first_id=$(tail -n 1 "$first_output")
second_id=$(tail -n 1 "$second_output")
if [[ -z "$first_id" || "$first_id" != "$second_id" ]]; then
  echo "Concurrent approval calls did not return the same adjustment record." >&2
  exit 1
fi

result=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select quantity from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select count(*) from public.inventory_discrepancy_adjustments where daily_stock_count_line_id = '${line_id}'),
    (select count(*) from public.inventory_movements where notes = '${movement_note}')
")
if [[ "$result" != "8.000|1|1" ]]; then
  echo "Expected balance 8.000 with one adjustment and one movement; got: ${result}" >&2
  exit 1
fi

echo "PASS: concurrent approvals returned one record and applied one inventory movement."
