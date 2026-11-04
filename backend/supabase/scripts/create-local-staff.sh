#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node is required." >&2
  exit 1
fi
if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required." >&2
  exit 1
fi

staff_email='staff.test@takosync.local'
staff_password="${STAFF_PASSWORD:-}"
if [[ -z "$staff_password" ]]; then
  echo "Set STAFF_PASSWORD for the local test account before running this script." >&2
  exit 1
fi

status_json="$(npx --no-install supabase status --output json 2>/dev/null)" || {
  echo "The local Supabase stack is unavailable. Start it with: npx supabase start" >&2
  exit 1
}

json_field() {
  node - "$1" "$2" <<'NODE'
const fs = require('fs');
const [json, field] = process.argv.slice(2);
const value = JSON.parse(json)[field];
if (value !== undefined && value !== null) process.stdout.write(String(value));
NODE
}

api_url="$(json_field "$status_json" API_URL)"
service_role_key="$(json_field "$status_json" SECRET_KEY)"
if [[ -z "$service_role_key" ]]; then
  service_role_key="$(json_field "$status_json" SERVICE_ROLE_KEY)"
fi
database_url="$(json_field "$status_json" DB_URL)"

case "$api_url" in
  http://127.0.0.1:54321|http://localhost:54321) ;;
  *) echo "Refusing non-local Supabase API URL: ${api_url:-<missing>}" >&2; exit 1 ;;
esac
case "$database_url" in
  postgresql://postgres:postgres@127.0.0.1:54322/postgres|postgresql://postgres:postgres@localhost:54322/postgres) ;;
  *) echo "Refusing non-local database URL: ${database_url:-<missing>}" >&2; exit 1 ;;
esac
if [[ -z "$service_role_key" ]]; then
  echo "The local Supabase service-role key was not returned by supabase status." >&2
  exit 1
fi

response_file="$(mktemp)"
created_user_id=''
keep_user=0
cleanup() {
  rm -f "$response_file"
  if [[ -n "$created_user_id" && "$keep_user" -eq 0 ]]; then
    curl -sS -o /dev/null \
      -X DELETE \
      -H "apikey: $service_role_key" \
      -H "Authorization: Bearer $service_role_key" \
      "$api_url/auth/v1/admin/users/$created_user_id" || true
  fi
}
trap cleanup EXIT

create_payload="$(STAFF_EMAIL="$staff_email" STAFF_PASSWORD="$staff_password" node <<'NODE'
process.stdout.write(JSON.stringify({
  email: process.env.STAFF_EMAIL,
  password: process.env.STAFF_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: 'Local Test Staff' },
}));
NODE
)"
http_code="$(curl -sS -o "$response_file" -w '%{http_code}' \
  -X POST \
  -H "apikey: $service_role_key" \
  -H "Authorization: Bearer $service_role_key" \
  -H 'Content-Type: application/json' \
  --data "$create_payload" \
  "$api_url/auth/v1/admin/users")"
if [[ "$http_code" != '200' && "$http_code" != '201' ]]; then
  echo "Local Auth user creation failed (HTTP $http_code):" >&2
  cat "$response_file" >&2
  exit 1
fi

created_user_id="$(node - "$response_file" <<'NODE'
const fs = require('fs');
const response = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (response.id) {
  process.stdout.write(response.id);
} else {
  process.exit(1);
}
NODE
)" || {
  echo "Local Auth did not return a user id." >&2
  exit 1
}

if [[ ! "$created_user_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "The local Auth API returned an invalid user id." >&2
  exit 1
fi

psql_args=(psql "$database_url" -X -q -v ON_ERROR_STOP=1 -v user_id="$created_user_id" -v staff_email="$staff_email")
"${psql_args[@]}" <<'SQL'
begin;

select id as selected_branch_id
from public.branches
where active
order by created_at, id
limit 1
\gset

\if :{?selected_branch_id}
\else
  \echo 'No active branch exists for the local Staff fixture'
  \quit 1
\endif

update public.profiles
set full_name = 'Local Test Staff',
    role = 'staff',
    branch_id = :'selected_branch_id'::uuid,
    active = true
where id = :'user_id'::uuid
  and lower(email) = lower(:'staff_email')
  and role = 'staff'
  and active = false
  and branch_id is null
returning id as updated_profile_id
\gset

\if :{?updated_profile_id}
\else
  \echo 'The newly-created local Auth user or bootstrap Staff profile could not be verified'
  \quit 1
\endif

commit;
SQL

keep_user=1
echo "Created local Staff account $staff_email assigned to the first active branch."
