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

owner_email='owner.test@takosync.local'
owner_password="${OWNER_PASSWORD:-}"
if [[ -z "$owner_password" ]]; then
  echo "Set OWNER_PASSWORD for the local test account before running this script." >&2
  exit 1
fi

status_json="$(npx --no-install supabase status --output json 2>/dev/null)" || {
  echo "The local Supabase stack is unavailable. Start it with: npx supabase start" >&2
  exit 1
}

json_field() {
  node - "$1" "$2" <<'NODE'
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

sql_literal() {
  case "$1" in
    *"'"*|*$'\n'*|*$'\r'*)
      echo "Unsafe value cannot be used as a SQL literal." >&2
      return 1
      ;;
  esac
  printf "'%s'" "$1"
}

psql_args=(psql "$database_url" -X -q -v ON_ERROR_STOP=1)
owner_email_sql="$(sql_literal "$owner_email")"
existing_user_id="$(
  "${psql_args[@]}" -Atc \
    "select id from auth.users where lower(email) = lower($owner_email_sql) order by id limit 1"
)"

if [[ -n "$existing_user_id" ]]; then
  if [[ ! "$existing_user_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "The local Auth lookup returned an invalid user id." >&2
    exit 1
  fi
  existing_user_id_sql="$(sql_literal "$existing_user_id")"
  configured_count="$(
    "${psql_args[@]}" -Atc \
      "select count(*) from public.profiles where id = ${existing_user_id_sql}::uuid and lower(email) = lower($owner_email_sql) and role = 'owner' and branch_id is null and active"
  )"
  if [[ "$configured_count" == '1' ]]; then
    echo "Local Owner account is already configured: $owner_email"
    exit 0
  fi
  echo "Refusing to modify the existing Auth user with email $owner_email; its profile is not the expected active Owner profile." >&2
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

create_payload="$(OWNER_EMAIL="$owner_email" OWNER_PASSWORD="$owner_password" node <<'NODE'
process.stdout.write(JSON.stringify({
  email: process.env.OWNER_EMAIL,
  password: process.env.OWNER_PASSWORD,
  email_confirm: true,
  user_metadata: { full_name: 'Local Test Owner' },
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
created_user_id_sql="$(sql_literal "$created_user_id")"
updated_profile_id="$(
  "${psql_args[@]}" -Atc "
    begin;
    update public.profiles
    set full_name = 'Local Test Owner',
        role = 'owner',
        branch_id = null,
        active = true
    where id = ${created_user_id_sql}::uuid
      and lower(email) = lower($owner_email_sql)
      and role = 'staff'
      and active = false
      and branch_id is null
    returning id;
    commit;
  "
)"
if [[ ! "$updated_profile_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo "The newly-created local Auth user or bootstrap profile could not be verified." >&2
  exit 1
fi

keep_user=1
echo "Created local Owner account $owner_email with no branch assignment."
