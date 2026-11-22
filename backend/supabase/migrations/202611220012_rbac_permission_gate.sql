-- S2: Role-Based Access Control with permission bitmasks and a gate middleware
-- (Algorithm Architecture Specification §2.7 and §3.7; US-RBAC-04).
--
-- Each permission is one bit (22 bits, 0-21, within the 31-bit limit). A role's
-- mask is the OR of its bits. Authorization is the spec's
--   allow(u, R, β) = u.active ∧ ((u.roleMask & R) = R) ∧ (β = null ∨ u.role = OWNER ∨ u.branch_id = β)
-- with role, active and branch read from public.profiles on every call, never
-- from token claims alone (AC-RBAC-04-04).
--
-- The gate is PostgREST's pre-request hook (pgrst.db_pre_request =
-- public.api_gate). It runs before every API request, finds the endpoint in
-- public.api_endpoint_permissions, and allows the request only when one of the
-- endpoint's declared masks is satisfied. An endpoint that is not declared is
-- refused (deny by default), as are inactive accounts and anonymous callers.
-- Denials return HTTP 403 (SQLSTATE PT403).
-- The service role is the trusted backend (Edge Functions). It does its own
-- checks and is not gated. Row-level security and the can_access_branch checks
-- in each function stay as the second layer for branch isolation, as the spec
-- requires.
--
-- Denial audit (AC-RBAC-04-05): a denied request's transaction is rolled back,
-- so the gate cannot keep its own audit row (Postgres has no autonomous
-- transactions). The app reports each 403 through public.log_access_denial,
-- which writes an `authz.denied` event to the hash-chained audit log with the
-- caller's identity taken from the server.

create table if not exists public.permissions (
  bit smallint primary key check (bit between 0 and 30),
  code text not null unique check (code ~ '^[A-Z_]+$'),
  description text not null
);

insert into public.permissions (bit, code, description) values
  (0, 'SALE_CREATE', 'POS sale, receipt, void request, daily closing'),
  (1, 'SALES_VIEW_BRANCH', 'View sales of the assigned branch'),
  (2, 'SALES_VIEW_ALL', 'View sales of every branch'),
  (3, 'INV_VIEW_BRANCH', 'View inventory of the assigned branch'),
  (4, 'INV_VIEW_ALL', 'View inventory of every branch'),
  (5, 'BATCH_PREP_RECORD', 'Record batter preparation'),
  (6, 'STOCKIN_RECORD', 'Record Stock-In'),
  (7, 'WASTE_RECORD', 'Record waste and spillage'),
  (8, 'COUNT_SUBMIT', 'Submit physical counts and correction requests'),
  (9, 'COUNT_REVIEW', 'Review counts and discrepancies'),
  (10, 'ADJUSTMENT_AUTHORIZE', 'Authorize adjustments, voids and reversals'),
  (11, 'CATALOG_CONFIG', 'Configure products, recipes, batter and business hours'),
  (12, 'THRESHOLD_CONFIG', 'Configure minimums, reorder inputs, lead time and expiry windows'),
  (13, 'ACCOUNT_MANAGE', 'Manage staff accounts'),
  (14, 'AUDIT_VIEW', 'View the audit log'),
  (15, 'AUDIT_VERIFY', 'Verify the audit chain and create checkpoints'),
  (16, 'REPORT_BRANCH', 'Reports for the assigned branch'),
  (17, 'REPORT_ALL', 'Reports for every branch'),
  (18, 'ALERT_VIEW_BRANCH', 'Alerts for the assigned branch'),
  (19, 'ALERT_VIEW_ALL', 'Alerts for every branch'),
  (20, 'WEB_PORTAL_ACCESS', 'Owner web portal'),
  (21, 'HISTORY_VIEW_BRANCH', 'Transaction history of the assigned branch')
on conflict (bit) do update set code = excluded.code, description = excluded.description;

create or replace function private.permission_mask(variadic p_codes text[])
returns bigint
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_mask bigint;
  v_found integer;
begin
  select coalesce(bit_or((1::bigint) << bit), 0), count(*) into v_mask, v_found
  from public.permissions where code = any(p_codes);
  if v_found <> cardinality(array(select distinct unnest(p_codes))) then
    raise exception 'Unknown permission code in %', p_codes;
  end if;
  return v_mask;
end;
$$;

create table if not exists public.role_permissions (
  role text primary key check (role in ('owner', 'staff', 'system_admin')),
  permission_mask bigint not null check (permission_mask between 0 and 2147483647),
  description text not null default ''
);

insert into public.role_permissions (role, permission_mask, description) values
  ('staff', private.permission_mask('SALE_CREATE', 'SALES_VIEW_BRANCH', 'INV_VIEW_BRANCH', 'BATCH_PREP_RECORD',
     'STOCKIN_RECORD', 'WASTE_RECORD', 'COUNT_SUBMIT', 'REPORT_BRANCH', 'ALERT_VIEW_BRANCH', 'HISTORY_VIEW_BRANCH'),
   'Branch staff (two per branch)'),
  ('owner', private.permission_mask('SALES_VIEW_BRANCH', 'SALES_VIEW_ALL', 'INV_VIEW_BRANCH', 'INV_VIEW_ALL',
     'COUNT_REVIEW', 'ADJUSTMENT_AUTHORIZE', 'CATALOG_CONFIG', 'THRESHOLD_CONFIG', 'ACCOUNT_MANAGE', 'AUDIT_VIEW',
     'AUDIT_VERIFY', 'REPORT_BRANCH', 'REPORT_ALL', 'ALERT_VIEW_BRANCH', 'ALERT_VIEW_ALL', 'WEB_PORTAL_ACCESS',
     'HISTORY_VIEW_BRANCH'),
   'Owner, cross-branch'),
  ('system_admin', private.permission_mask('AUDIT_VERIFY'), 'Operational service identity; audit verification only')
on conflict (role) do update set permission_mask = excluded.permission_mask, description = excluded.description;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
drop policy if exists permissions_read on public.permissions;
create policy permissions_read on public.permissions for select to authenticated using (true);
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
revoke all on public.permissions, public.role_permissions from anon, authenticated;
grant select on public.permissions, public.role_permissions to authenticated;

-- AUTHORIZE (§3.7) ------------------------------------------------------------------
create or replace function public.authorize(p_required_mask bigint, p_resource_branch uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_mask bigint;
begin
  if (select auth.role()) = 'service_role' then
    select permission_mask into v_mask from public.role_permissions where role = 'system_admin';
    return case when (coalesce(v_mask, 0) & p_required_mask) = p_required_mask then 'ALLOW' else 'DENY_PERMISSION' end;
  end if;
  select * into v_profile from public.profiles where id = (select auth.uid());
  if not found or not v_profile.active then return 'DENY_INACTIVE'; end if;
  select permission_mask into v_mask from public.role_permissions where role = v_profile.role::text;
  if (coalesce(v_mask, 0) & p_required_mask) <> p_required_mask then return 'DENY_PERMISSION'; end if;
  if p_resource_branch is not null and v_profile.role::text <> 'owner' and v_profile.branch_id is distinct from p_resource_branch then
    return 'DENY_BRANCH_SCOPE';
  end if;
  return 'ALLOW';
end;
$$;

-- Raises a 403 unless the caller holds every permission in p_codes (and the branch).
create or replace function private.require_permission(p_codes text[], p_resource_branch uuid default null)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_decision text := public.authorize(private.permission_mask(variadic p_codes), p_resource_branch);
begin
  if v_decision <> 'ALLOW' then
    raise sqlstate 'PT403' using
      message = 'Permission denied',
      detail = json_build_object('reason', v_decision, 'required', p_codes)::text,
      hint = 'PERMISSION_DENIED';
  end if;
end;
$$;

-- Endpoint registry (AC-RBAC-04-01/02) ---------------------------------------------
-- endpoint: 'rpc/<function>' or 'table/<table or view>'. Each array lists
-- alternative masks; a request is allowed when the caller satisfies any one of
-- them. An empty array (or no row) denies. A mask of 0 means "any active
-- account". Writes are POST/PATCH/PUT/DELETE on tables; RPCs use read_masks.
create table if not exists public.api_endpoint_permissions (
  endpoint text primary key check (endpoint ~ '^(rpc|table)/[a-z_0-9]+$'),
  read_masks bigint[] not null default '{}',
  write_masks bigint[] not null default '{}',
  allow_anon boolean not null default false,
  note text not null default ''
);
alter table public.api_endpoint_permissions enable row level security;
drop policy if exists api_endpoint_permissions_read on public.api_endpoint_permissions;
create policy api_endpoint_permissions_read on public.api_endpoint_permissions for select to authenticated using (true);
revoke all on public.api_endpoint_permissions from anon, authenticated;
grant select on public.api_endpoint_permissions to authenticated;

create or replace function private.declare_endpoint(
  p_endpoint text,
  p_read text[][] default '{}',
  p_write text[][] default '{}',
  p_note text default ''
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_read bigint[] := '{}';
  v_write bigint[] := '{}';
  v_alternative text;
begin
  -- Each alternative is a comma-separated list of codes, or '' for "any active account".
  foreach v_alternative in array p_read loop
    v_read := v_read || case when v_alternative = '' then 0::bigint
      else private.permission_mask(variadic string_to_array(v_alternative, ',')) end;
  end loop;
  foreach v_alternative in array p_write loop
    v_write := v_write || case when v_alternative = '' then 0::bigint
      else private.permission_mask(variadic string_to_array(v_alternative, ',')) end;
  end loop;
  insert into public.api_endpoint_permissions (endpoint, read_masks, write_masks, note)
  values (p_endpoint, v_read, v_write, p_note)
  on conflict (endpoint) do update set read_masks = excluded.read_masks, write_masks = excluded.write_masks, note = excluded.note;
end;
$$;

do $$
begin
  -- RPCs -----------------------------------------------------------------------------
  perform private.declare_endpoint('rpc/business_session_status', array[''], '{}', 'session check after sign-in');
  perform private.declare_endpoint('rpc/authorize_business_session', array[''], '{}', 'session check after sign-in');
  perform private.declare_endpoint('rpc/is_business_session_active', array[''], '{}', 'helper');
  perform private.declare_endpoint('rpc/can_access_branch', array[''], '{}', 'helper');
  perform private.declare_endpoint('rpc/is_active_owner', array[''], '{}', 'helper');
  perform private.declare_endpoint('rpc/is_active_staff', array[''], '{}', 'helper');
  perform private.declare_endpoint('rpc/authorize', array[''], '{}', 'permission check for the caller');
  perform private.declare_endpoint('rpc/log_access_denial', array[''], '{}', 'records a denied request');
  perform private.declare_endpoint('rpc/classify_lot_expiry', array['INV_VIEW_BRANCH'], '{}');
  perform private.declare_endpoint('rpc/compute_sale_payload_hash', array['SALE_CREATE']);
  perform private.declare_endpoint('rpc/submit_sale', array['SALE_CREATE']);
  perform private.declare_endpoint('rpc/submit_sale_with_payment', array['SALE_CREATE']);
  perform private.declare_endpoint('rpc/process_sale_inventory', array['SALE_CREATE'], '{}', 'staff retry of a saved sale');
  perform private.declare_endpoint('rpc/request_sale_void', array['SALE_CREATE']);
  perform private.declare_endpoint('rpc/record_daily_closing', array['SALE_CREATE']);
  perform private.declare_endpoint('rpc/inspect_sale_reconciliation', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('rpc/next_batter_batch_reference', array['BATCH_PREP_RECORD']);
  perform private.declare_endpoint('rpc/prepare_batter_batch', array['BATCH_PREP_RECORD']);
  perform private.declare_endpoint('rpc/record_inventory_transactions_idempotent',
    array['STOCKIN_RECORD', 'WASTE_RECORD', 'BATCH_PREP_RECORD', 'ADJUSTMENT_AUTHORIZE'], '{}',
    'Stock-In, waste, usage; the function checks the movement type');
  perform private.declare_endpoint('rpc/record_inventory_transactions',
    array['STOCKIN_RECORD', 'WASTE_RECORD', 'BATCH_PREP_RECORD', 'ADJUSTMENT_AUTHORIZE'], '{}', 'internal; no API grant');
  perform private.declare_endpoint('rpc/request_inventory_entry_reversal', array['STOCKIN_RECORD', 'WASTE_RECORD']);
  perform private.declare_endpoint('rpc/save_daily_stock_check_draft', array['COUNT_SUBMIT']);
  perform private.declare_endpoint('rpc/delete_daily_stock_check_draft', array['COUNT_SUBMIT']);
  perform private.declare_endpoint('rpc/submit_daily_stock_check', array['COUNT_SUBMIT']);
  perform private.declare_endpoint('rpc/request_inventory_count_correction', array['COUNT_SUBMIT']);
  perform private.declare_endpoint('rpc/decide_inventory_count_correction', array['COUNT_REVIEW']);
  perform private.declare_endpoint('rpc/validate_inventory_count_correction', array['COUNT_REVIEW,ADJUSTMENT_AUTHORIZE']);
  perform private.declare_endpoint('rpc/validate_submitted_inventory_count', array['COUNT_REVIEW,ADJUSTMENT_AUTHORIZE']);
  perform private.declare_endpoint('rpc/reject_submitted_inventory_count', array['COUNT_REVIEW']);
  perform private.declare_endpoint('rpc/decide_sale_void', array['ADJUSTMENT_AUTHORIZE']);
  perform private.declare_endpoint('rpc/decide_inventory_entry_reversal', array['ADJUSTMENT_AUTHORIZE']);
  perform private.declare_endpoint('rpc/set_business_day_settings', array['CATALOG_CONFIG']);
  perform private.declare_endpoint('rpc/refresh_reorder_points', array['ALERT_VIEW_BRANCH']);
  perform private.declare_endpoint('rpc/verify_audit_chain', array['AUDIT_VERIFY']);
  perform private.declare_endpoint('rpc/create_audit_checkpoint', array['AUDIT_VERIFY']);

  -- Tables (reads, then writes) --------------------------------------------------------
  perform private.declare_endpoint('table/branches', array[''], array['ACCOUNT_MANAGE']);
  perform private.declare_endpoint('table/profiles', array[''], array['ACCOUNT_MANAGE'], 'own profile; RLS limits rows');
  perform private.declare_endpoint('table/permissions', array[''], '{}');
  perform private.declare_endpoint('table/role_permissions', array[''], '{}');
  perform private.declare_endpoint('table/api_endpoint_permissions', array[''], '{}');

  perform private.declare_endpoint('table/sales', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('table/sale_items', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('table/sale_addons', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('table/sale_void_requests', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('table/sale_consumption_snapshots', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('table/sale_inventory_processing', array['SALES_VIEW_BRANCH']);
  perform private.declare_endpoint('table/daily_closings', array['SALES_VIEW_BRANCH']);

  perform private.declare_endpoint('table/products', array['SALES_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/product_variants', array['SALES_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/menu_addons', array['SALES_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/branch_product_visibility', array['SALES_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/recipes', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/shared_recipes', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/shared_recipe_ingredients', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/shared_recipe_products', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/shared_recipe_versions', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/shared_recipe_version_ingredients', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/ingredients', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/ingredient_categories', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/ingredient_package_sizes', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/units_of_measure', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);
  perform private.declare_endpoint('table/unit_conversions', array['INV_VIEW_BRANCH'], array['CATALOG_CONFIG']);

  perform private.declare_endpoint('table/branch_inventory', array['INV_VIEW_BRANCH'], array['THRESHOLD_CONFIG']);
  perform private.declare_endpoint('table/inventory', array['INV_VIEW_BRANCH'], array['THRESHOLD_CONFIG']);
  perform private.declare_endpoint('table/ingredient_batches', array['INV_VIEW_BRANCH'], array['THRESHOLD_CONFIG'],
    'owner edits expiration date and hold status');
  perform private.declare_endpoint('table/owner_inventory_settings', array['INV_VIEW_BRANCH'], array['THRESHOLD_CONFIG']);
  perform private.declare_endpoint('table/ingredient_replenishment_settings', array['INV_VIEW_BRANCH'], array['THRESHOLD_CONFIG']);
  perform private.declare_endpoint('table/inventory_reorder_points', array['ALERT_VIEW_BRANCH']);
  perform private.declare_endpoint('table/inventory_stock_alerts', array['ALERT_VIEW_BRANCH']);
  perform private.declare_endpoint('table/inventory_movements', array['HISTORY_VIEW_BRANCH']);
  perform private.declare_endpoint('table/inventory_transactions', array['HISTORY_VIEW_BRANCH']);
  perform private.declare_endpoint('table/inventory_fefo_certificates', array['HISTORY_VIEW_BRANCH']);
  perform private.declare_endpoint('table/batter_preparation_batches', array['HISTORY_VIEW_BRANCH']);
  perform private.declare_endpoint('table/inventory_entry_reversal_requests', array['HISTORY_VIEW_BRANCH']);
  perform private.declare_endpoint('table/daily_stock_checks', array['COUNT_SUBMIT', 'COUNT_REVIEW']);
  perform private.declare_endpoint('table/daily_stock_count_lines', array['COUNT_SUBMIT', 'COUNT_REVIEW']);
  perform private.declare_endpoint('table/daily_stock_check_drafts', array['COUNT_SUBMIT']);
  perform private.declare_endpoint('table/inventory_count_correction_requests', array['COUNT_SUBMIT', 'COUNT_REVIEW']);
  perform private.declare_endpoint('table/inventory_count_validations', array['COUNT_SUBMIT', 'COUNT_REVIEW']);
  perform private.declare_endpoint('table/inventory_count_rejections', array['COUNT_SUBMIT', 'COUNT_REVIEW']);
  perform private.declare_endpoint('table/inventory_discrepancy_adjustments', array['HISTORY_VIEW_BRANCH']);

  perform private.declare_endpoint('table/audit_logs', array['AUDIT_VIEW']);
  perform private.declare_endpoint('table/audit_chain_checkpoints', array['AUDIT_VERIFY']);
end;
$$;

-- The gate (pre-request hook) -----------------------------------------------------------
create or replace function public.api_gate()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text := coalesce(current_setting('request.path', true), '');
  v_method text := upper(coalesce(current_setting('request.method', true), 'GET'));
  v_api_role text := coalesce((select auth.role()), current_user);
  v_endpoint text;
  v_rule public.api_endpoint_permissions%rowtype;
  v_masks bigint[];
  v_mask bigint;
  v_reason text := 'DENY_PERMISSION';
  v_decision text;
begin
  -- The trusted backend (Edge Functions with the service key) applies its own checks.
  if v_api_role = 'service_role' then return; end if;
  if v_method = 'OPTIONS' then return; end if;

  v_endpoint := case
    when v_path like '/rpc/%' then 'rpc/' || substr(v_path, 6)
    else 'table/' || ltrim(v_path, '/')
  end;
  select * into v_rule from public.api_endpoint_permissions where endpoint = v_endpoint;
  if not found then
    v_reason := 'DENY_UNDECLARED_ENDPOINT';
  elsif v_api_role = 'anon' and not v_rule.allow_anon then
    v_reason := 'DENY_ANONYMOUS';
  else
    v_masks := case when v_endpoint like 'rpc/%' or v_method in ('GET', 'HEAD') then v_rule.read_masks else v_rule.write_masks end;
    foreach v_mask in array v_masks loop
      v_decision := public.authorize(v_mask, null);
      if v_decision = 'ALLOW' then return; end if;
      -- Report the most specific reason: an inactive account wins.
      if v_decision = 'DENY_INACTIVE' then v_reason := v_decision; end if;
    end loop;
    if cardinality(v_masks) = 0 then v_reason := 'DENY_METHOD'; end if;
  end if;

  raise sqlstate 'PT403' using
    message = 'Permission denied',
    detail = json_build_object('reason', v_reason, 'endpoint', v_endpoint, 'method', v_method)::text,
    hint = 'PERMISSION_DENIED';
end;
$$;

-- Denial audit (AC-RBAC-04-05) ------------------------------------------------------------
create or replace function public.log_access_denial(p_endpoint text, p_reason text, p_method text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := (select auth.uid());
  v_branch uuid;
  v_endpoint text := left(coalesce(p_endpoint, ''), 120);
begin
  if v_user is null then return; end if;
  select branch_id into v_branch from public.profiles where id = v_user;
  -- At most one entry per user and endpoint per minute, so a retry loop cannot flood the log.
  if exists (
    select 1 from public.audit_logs
    where user_id = v_user and action = 'authz.denied' and created_at > now() - interval '1 minute'
      and description like 'Denied ' || v_endpoint || ' %'
  ) then
    return;
  end if;
  insert into public.audit_logs (user_id, branch_id, action, description)
  values (v_user, v_branch, 'authz.denied',
    format('Denied %s %s: %s', v_endpoint, left(coalesce(upper(p_method), 'POST'), 10), left(coalesce(p_reason, 'DENY'), 60)));
end;
$$;

-- Denials decided by the trusted backend (staff-auth Edge Function) are logged
-- by that backend, which passes the caller it verified.
create or replace function public.log_service_access_denial(p_user_id uuid, p_endpoint text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (user_id, branch_id, action, description)
  values (p_user_id, (select branch_id from public.profiles where id = p_user_id), 'authz.denied',
    format('Denied %s: %s', left(coalesce(p_endpoint, ''), 120), left(coalesce(p_reason, 'DENY'), 60)));
end;
$$;
revoke all on function public.log_service_access_denial(uuid, text, text) from public, anon, authenticated;
grant execute on function public.log_service_access_denial(uuid, text, text) to service_role;

revoke all on function private.permission_mask(text[]) from public, anon, authenticated;
revoke all on function private.require_permission(text[], uuid) from public, anon, authenticated;
revoke all on function private.declare_endpoint(text, text[], text[], text) from public, anon, authenticated;
revoke all on function public.authorize(bigint, uuid) from public, anon;
revoke all on function public.log_access_denial(text, text, text) from public, anon;
grant execute on function public.authorize(bigint, uuid) to authenticated, service_role;
grant execute on function public.log_access_denial(text, text, text) to authenticated;
revoke all on function public.api_gate() from public;
grant execute on function public.api_gate() to anon, authenticated, service_role, authenticator;

-- Turn the gate on for the API (Supabase/PostgREST in-database config).
alter role authenticator set pgrst.db_pre_request to 'public.api_gate';
notify pgrst, 'reload config';
