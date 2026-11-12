#!/usr/bin/env bash
set -euo pipefail

database_url=${TAKOSYNC_TEST_DATABASE_URL:?Set TAKOSYNC_TEST_DATABASE_URL to an isolated local test database}
confirmation=${TAKOSYNC_ALLOW_TEST_DB_MUTATIONS:?Set TAKOSYNC_ALLOW_TEST_DB_MUTATIONS to the explicit disposable-database confirmation}
expected_database=${TAKOSYNC_TEST_DATABASE_NAME:?Set TAKOSYNC_TEST_DATABASE_NAME to the disposable test database name}

if [[ "$confirmation" != "I_UNDERSTAND_THIS_IS_A_DISPOSABLE_LOCAL_TEST_DATABASE" ]]; then
  echo "Refusing to run without explicit disposable-database confirmation." >&2
  exit 1
fi

node -e '
  const { hostname, pathname } = new URL(process.argv[1]);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    console.error("Refusing to run the inventory transaction concurrency test against a non-local database.");
    process.exit(1);
  }
  const database = decodeURIComponent(pathname.replace(/^\/+/, ""));
  if (database !== process.argv[2] || !/(^|[_-])(test|testing|disposable)([_-]|$)/i.test(database)) {
    console.error("Refusing to run: the URL database name must match TAKOSYNC_TEST_DATABASE_NAME and identify a test/disposable database.");
    process.exit(1);
  }
' "$database_url" "$expected_database"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the inventory transaction concurrency test." >&2
  exit 1
fi

psql_test=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
actual_database=$("${psql_test[@]}" -Atc 'select current_database()')
if [[ "$actual_database" != "$expected_database" ]]; then
  echo "Refusing to run: connected to database '${actual_database}', expected '${expected_database}'." >&2
  exit 1
fi

branch_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
staff_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
request_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
branch_code="TEST-INVENTORY-IDEMPOTENCY-${branch_id}"
email="inventory-idempotency-${staff_id}@takosync.invalid"
delay_function="public.inventory_idempotency_delay_${branch_id//-/}"
delay_trigger="inventory_idempotency_delay_${branch_id//-/}"
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

  "${psql_test[@]}" <<SQL
drop trigger if exists ${delay_trigger} on public.branch_inventory;
drop function if exists ${delay_function}();
delete from public.inventory_movements where branch_id = '${branch_id}';
delete from public.audit_logs where branch_id = '${branch_id}';
delete from public.ingredient_batches where branch_id = '${branch_id}';
delete from public.branch_inventory where branch_id = '${branch_id}';
delete from auth.users where id = '${staff_id}';
delete from public.branches where id = '${branch_id}';
SQL
  rm -f "$first_output" "$second_output"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

"${psql_test[@]}" <<SQL
insert into public.branches (id, code, name, city, address, active)
values ('${branch_id}', '${branch_code}', 'Inventory Idempotency Test Branch', '', '', true);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '${staff_id}', 'authenticated', 'authenticated',
  '${email}', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Inventory Idempotency Test Staff"}'
);

update public.profiles
set role = 'staff', branch_id = '${branch_id}', active = true
where id = '${staff_id}';

update public.branch_inventory
set quantity = 10
where branch_id = '${branch_id}' and ingredient_id = 'flour';

create function ${delay_function}()
returns trigger
language plpgsql
as \$\$
begin
  if new.branch_id = '${branch_id}'
    and new.ingredient_id = 'flour'
    and new.quantity is distinct from old.quantity then
    perform pg_sleep(2);
  end if;
  return new;
end;
\$\$;

create trigger ${delay_trigger}
before update on public.branch_inventory
for each row execute function ${delay_function}();
SQL

run_request() {
  local output_file=$1
  "${psql_test[@]}" -At > "$output_file" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${staff_id}', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"${staff_id}","role":"authenticated"}',
  true
);
select reference
from public.record_inventory_transactions_idempotent(
  '${branch_id}',
  '${request_id}',
  '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Concurrent retry test","batch_reference":null,"expiration_date":null}]'::jsonb
);
commit;
SQL
}

run_request "$first_output" &
first_pid=$!
sleep 0.25
run_request "$second_output" &
second_pid=$!

wait "$first_pid"
first_pid=
wait "$second_pid"
second_pid=

first_reference=$(tail -n 1 "$first_output")
second_reference=$(tail -n 1 "$second_output")
if [[ -z "$first_reference" || "$first_reference" != "$second_reference" ]]; then
  echo "Concurrent retries did not return the same movement reference." >&2
  exit 1
fi

result=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select to_char(quantity, 'FM999999990.000')
     from public.branch_inventory
     where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select count(*)
     from public.inventory_movements
     where branch_id = '${branch_id}'
       and actor_id = '${staff_id}'
       and request_id = '${request_id}'),
    (select count(*)
     from public.inventory_movements
     where branch_id = '${branch_id}'
       and actor_id = '${staff_id}'
       and request_id = '${request_id}'
       and reference = '${first_reference}')
")
if [[ "$result" != "12.000|1|1" ]]; then
  echo "Expected balance 12.000 and one original movement; got: ${result}" >&2
  exit 1
fi

echo "PASS: concurrent retries returned one movement and applied inventory once."
