#!/usr/bin/env bash
set -euo pipefail

database_url=${TAKOSYNC_TEST_DATABASE_URL:?Set TAKOSYNC_TEST_DATABASE_URL to an isolated local test database}
confirmed_database=${TAKOSYNC_CONFIRM_DATABASE_NAME:?Set TAKOSYNC_CONFIRM_DATABASE_NAME to the exact disposable database name}
if [[ ${TAKOSYNC_ALLOW_DISPOSABLE_DATABASE:-} != YES ]]; then
  echo "Refusing to mutate a database without TAKOSYNC_ALLOW_DISPOSABLE_DATABASE=YES." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required to run the count validation concurrency test." >&2
  exit 1
fi

node -e '
  const url = new URL(process.argv[1]);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    console.error("Refusing to run the concurrency test against a non-local database.");
    process.exit(1);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database || !/(^|[-_])(test|testing|disposable)([-_]|$)/i.test(database)) {
    console.error("The URL database name must clearly identify a disposable test database.");
    process.exit(1);
  }
  if (database !== process.argv[2]) {
    console.error("The URL database name does not match TAKOSYNC_CONFIRM_DATABASE_NAME.");
    process.exit(1);
  }
' "$database_url" "$confirmed_database"

psql_test=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
actual_database=$("${psql_test[@]}" -Atc 'select current_database()')
if [[ $actual_database != "$confirmed_database" ]]; then
  echo "Refusing to run: current_database() does not match the confirmed disposable database." >&2
  exit 1
fi

original_settings=$("${psql_test[@]}" -AtF '|' -c "
  select opening_time, normal_closing_time, extended_closing_time, extended_closing_enabled
  from public.business_day_settings
  where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date
")
if [[ -z $original_settings ]]; then
  echo "The current business-day settings row is required; no database changes were made." >&2
  exit 1
fi
IFS='|' read -r original_opening original_closing original_extended original_enabled <<< "$original_settings"

owner_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
staff_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
owner_session_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
staff_session_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
branch_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
check_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
line_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
request_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
reference="TEST-COUNT-${check_id}"
movement_note="Validated physical count line ${line_id}"
delay_suffix=${check_id//-/}
delay_function="public.delay_count_validation_${delay_suffix}"
delay_trigger="count_validation_delay_${delay_suffix}"
first_output=$(mktemp)
second_output=$(mktemp)
first_pid=
second_pid=

cleanup() {
  if [[ -n $first_pid ]]; then wait "$first_pid" 2>/dev/null || true; fi
  if [[ -n $second_pid ]]; then wait "$second_pid" 2>/dev/null || true; fi
  "${psql_test[@]}" <<SQL
drop trigger if exists ${delay_trigger} on public.inventory_count_validations;
drop function if exists ${delay_function}();
delete from public.inventory_count_validations where daily_stock_count_line_id = '${line_id}';
delete from public.inventory_discrepancy_adjustments where daily_stock_count_line_id = '${line_id}';
delete from public.inventory_count_correction_requests where daily_stock_count_line_id = '${line_id}';
delete from public.inventory_movements where notes = '${movement_note}';
delete from public.audit_logs where user_id in ('${owner_id}', '${staff_id}');
delete from public.daily_stock_count_lines where id = '${line_id}';
delete from public.daily_stock_checks where id = '${check_id}';
delete from public.branch_inventory where branch_id = '${branch_id}';
delete from public.business_day_sessions where session_id in ('${owner_session_id}', '${staff_session_id}');
delete from auth.sessions where id in ('${owner_session_id}', '${staff_session_id}');
delete from auth.users where id in ('${owner_id}', '${staff_id}');
delete from public.branches where id = '${branch_id}';
update public.business_day_settings
set opening_time = '${original_opening}'::time,
    normal_closing_time = '${original_closing}'::time,
    extended_closing_time = '${original_extended}'::time,
    extended_closing_enabled = '${original_enabled}'::boolean
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
SQL
  rm -f "$first_output" "$second_output"
}
trap cleanup EXIT

"${psql_test[@]}" <<SQL
insert into public.branches (id, code, name, city, active)
values ('${branch_id}', 'TEST-${check_id}', 'Count Validation Test Branch', '', true);
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '${owner_id}', 'authenticated', 'authenticated',
    'count-owner-${check_id}@takosync.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Count Validation Test Owner"}'
  ),
  (
    '${staff_id}', 'authenticated', 'authenticated',
    'count-staff-${check_id}@takosync.invalid', '', now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Count Validation Test Staff"}'
  );
update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '${owner_id}';
update public.profiles
set role = 'staff', branch_id = '${branch_id}', active = true
where id = '${staff_id}';
update public.business_day_settings
set opening_time = time '00:00:00',
    normal_closing_time = time '23:59:58',
    extended_closing_time = time '23:59:59',
    extended_closing_enabled = true
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('${owner_session_id}', '${owner_id}', now(), now()),
  ('${staff_session_id}', '${staff_id}', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date) values
  ('${owner_session_id}', '${owner_id}', (clock_timestamp() at time zone 'Asia/Manila')::date),
  ('${staff_session_id}', '${staff_id}', (clock_timestamp() at time zone 'Asia/Manila')::date);
update public.branch_inventory
set quantity = 10
where branch_id = '${branch_id}' and ingredient_id = 'flour';
SQL

revision=$("${psql_test[@]}" -Atc "
  select inventory_revision from public.branch_inventory
  where branch_id = '${branch_id}' and ingredient_id = 'flour'
")
"${psql_test[@]}" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${staff_id}', true);
select set_config('request.jwt.claims', '{"sub":"${staff_id}","role":"authenticated","session_id":"${staff_session_id}"}', true);
select public.submit_daily_stock_check(
  '${branch_id}',
  gen_random_uuid(),
  current_date,
  'Concurrent Validate Count test',
  jsonb_build_array(jsonb_build_object(
    'ingredient_id', 'flour',
    'recorded_quantity', 10,
    'physical_quantity', 8,
    'inventory_revision', ${revision}
  ))
);
commit;
SQL

line_id=$("${psql_test[@]}" -Atc "
  select line.id
  from public.daily_stock_count_lines line
  join public.daily_stock_checks check_record on check_record.id = line.daily_stock_check_id
  where check_record.branch_id = '${branch_id}'
    and check_record.remarks = 'Concurrent Validate Count test'
")
request_id=$("${psql_test[@]}" -Atc 'select gen_random_uuid()')
"${psql_test[@]}" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${staff_id}', true);
select set_config('request.jwt.claims', '{"sub":"${staff_id}","role":"authenticated","session_id":"${staff_session_id}"}', true);
select public.request_inventory_count_correction(
  '${line_id}', '${request_id}', 8, 'Concurrent validation test recount'
);
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${owner_id}', true);
select set_config('request.jwt.claims', '{"sub":"${owner_id}","role":"authenticated","session_id":"${owner_session_id}"}', true);
select public.decide_inventory_count_correction(
  '${request_id}', 'approved', 'Concurrent test request approved'
);
commit;
SQL

"${psql_test[@]}" <<SQL
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
before insert on public.inventory_count_validations
for each row execute function ${delay_function}();
SQL

run_validation() {
  local output_file=$1
  "${psql_test[@]}" -At > "$output_file" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${owner_id}', true);
select set_config('request.jwt.claims', '{"sub":"${owner_id}","role":"authenticated","session_id":"${owner_session_id}"}', true);
select (public.validate_inventory_count_correction('${request_id}', 'Concurrent Validate Count test')).id;
commit;
SQL
}

run_validation "$first_output" &
first_pid=$!
sleep 0.25
run_validation "$second_output" &
second_pid=$!

wait "$first_pid"
first_pid=
wait "$second_pid"
second_pid=

first_id=$(tail -n 1 "$first_output")
second_id=$(tail -n 1 "$second_output")
if [[ -z $first_id || $first_id != "$second_id" ]]; then
  echo "Concurrent Validate Count calls did not return the same validation record." >&2
  exit 1
fi

result=$("${psql_test[@]}" -AtF '|' -c "
  select
    (select quantity from public.branch_inventory where branch_id = '${branch_id}' and ingredient_id = 'flour'),
    (select count(*) from public.inventory_count_validations where daily_stock_count_line_id = '${line_id}'),
    (select count(*) from public.inventory_discrepancy_adjustments where daily_stock_count_line_id = '${line_id}'),
    (select count(*) from public.inventory_movements where notes = '${movement_note}')
")
if [[ $result != "8.000|1|1|1" ]]; then
  echo "Expected balance 8.000 with one validation, adjustment and movement; got: ${result}" >&2
  exit 1
fi

echo "PASS: concurrent Validate Count calls returned one audit record and applied one inventory movement."
