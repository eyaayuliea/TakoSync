-- S2 / US-RBAC-04: permission bitmasks, AUTHORIZE, the API gate and audited denials.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a4000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rbac-owner@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"RBAC Owner"}'::jsonb),
  ('a4000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rbac-staff@test.invalid', '', now(),
   '{"provider":"email","providers":["email"],"role":"owner"}'::jsonb, '{"full_name":"RBAC Staff"}'::jsonb),
  ('a4000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rbac-off@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"RBAC Inactive"}'::jsonb);
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = 'a4000000-0000-4000-8000-000000000001';
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900601',
  branch_id = '00000000-0000-4000-8000-000000000001', active = true, must_change_password = false
where id = 'a4000000-0000-4000-8000-000000000002';
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900602',
  branch_id = '00000000-0000-4000-8000-000000000001', active = false, must_change_password = false
where id = 'a4000000-0000-4000-8000-000000000003';

create or replace function pg_temp.act_as(p_user uuid, p_role text default 'authenticated')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', p_role,
    -- A forged claim: the gate must read the role from profiles, not from here.
    'user_role', 'owner', 'app_metadata', json_build_object('role', 'owner'))::text, true);
end;
$$;
create or replace function pg_temp.request(p_method text, p_path text)
returns void language plpgsql as $$
begin
  perform set_config('request.method', p_method, true);
  perform set_config('request.path', p_path, true);
end;
$$;

-- Matrix ---------------------------------------------------------------------------
select is((select count(*)::int from public.permissions), 22, '22 permission bits are defined');
select ok((select bool_and(bit between 0 and 30) and count(distinct bit) = 22 from public.permissions),
  'bits are unique and fit in 31 bits');
select results_eq($$select role, permission_mask from public.role_permissions order by role$$,
  $$values ('owner'::text, 4193822::bigint), ('staff', 2425323), ('system_admin', 32768)$$,
  'role masks match the spec matrix (and the app''s copy)');

-- Deny by default: every API endpoint is declared (AC-RBAC-04-02) ---------------------
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
     and p.proname <> 'api_gate'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and not exists (select 1 from public.api_endpoint_permissions e where e.endpoint = 'rpc/' || p.proname)),
  null, 'AC-RBAC-04-02: every function the API can call declares a permission mask');
select is(
  (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
     and (has_table_privilege('authenticated', c.oid, 'select') or has_any_column_privilege('authenticated', c.oid, 'insert')
       or has_any_column_privilege('authenticated', c.oid, 'update') or has_table_privilege('authenticated', c.oid, 'delete'))
     and not exists (select 1 from public.api_endpoint_permissions e where e.endpoint = 'table/' || c.relname)),
  null, 'AC-RBAC-04-02: every table the API can reach declares a permission mask');
select ok(exists (select 1 from pg_db_role_setting s where s.setrole = 'authenticator'::regrole
  and 'pgrst.db_pre_request=public.api_gate' = any(s.setconfig)), 'the gate is PostgREST''s pre-request hook');

-- AUTHORIZE ---------------------------------------------------------------------------
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select is(public.authorize(private.permission_mask('SALE_CREATE')), 'ALLOW', 'staff may record a sale');
select is(public.authorize(private.permission_mask('SALE_CREATE', 'COUNT_REVIEW')), 'DENY_PERMISSION',
  'AC-RBAC-04-01: every bit of the required mask is needed');
select is(public.authorize(private.permission_mask('AUDIT_VIEW')), 'DENY_PERMISSION',
  'AC-RBAC-04-04: a forged "owner" claim in the token does not give staff owner permissions');
select is(public.authorize(private.permission_mask('INV_VIEW_BRANCH'), '00000000-0000-4000-8000-000000000001'), 'ALLOW',
  'staff may view their own branch');
select is(public.authorize(private.permission_mask('INV_VIEW_BRANCH'), '00000000-0000-4000-8000-000000000002'), 'DENY_BRANCH_SCOPE',
  'AC-RBAC-04-03: staff may not view another branch');
select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
select is(public.authorize(private.permission_mask('INV_VIEW_BRANCH'), '00000000-0000-4000-8000-000000000002'), 'ALLOW',
  'AC-RBAC-04-03: the owner may view every branch');
select is(public.authorize(private.permission_mask('SALE_CREATE')), 'DENY_PERMISSION', 'the owner does not ring up sales');
select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select is(public.authorize(0), 'DENY_INACTIVE', 'AC-RBAC-04-02: an inactive account is always denied');
select pg_temp.act_as(null, 'service_role');
select is(public.authorize(private.permission_mask('AUDIT_VERIFY')), 'ALLOW', 'the system administrator may verify the audit chain');
select is(public.authorize(private.permission_mask('AUDIT_VIEW')), 'DENY_PERMISSION', '…and nothing else');

-- The gate --------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select pg_temp.request('GET', '/sales');
select lives_ok('select public.api_gate()', 'staff may read sales');
select pg_temp.request('GET', '/audit_logs');
select throws_ok('select public.api_gate()', 'PT403', 'Permission denied', 'staff may not read the audit log (HTTP 403)');
select pg_temp.request('PATCH', '/branch_inventory');
select throws_ok('select public.api_gate()', 'PT403', 'Permission denied', 'staff may read inventory but not change minimums');
select pg_temp.request('POST', '/rpc/submit_sale');
select lives_ok('select public.api_gate()', 'staff may call submit_sale');
select is(public.classify_lot_expiry('2026-11-23', '2026-11-22 10:00+08'), 'YELLOW',
  'a signed-in user can call classify_lot_expiry (regression: it needed access to the private schema)');
select is(
  (select array_agg(p.proname::text) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and p.prosrc ilike '%private.%'
     and has_function_privilege('authenticated', p.oid, 'execute')),
  null, 'no API function depends on the private schema without running as definer');
select pg_temp.request('POST', '/rpc/no_such_endpoint');
select throws_ok('select public.api_gate()', 'PT403', 'Permission denied', 'AC-RBAC-04-02: an undeclared endpoint is refused');
select pg_temp.act_as('a4000000-0000-4000-8000-000000000001');
select pg_temp.request('POST', '/rpc/submit_sale');
select throws_ok('select public.api_gate()', 'PT403', 'Permission denied', 'the owner may not call submit_sale');
select pg_temp.request('POST', '/rpc/verify_audit_chain');
select lives_ok('select public.api_gate()', 'the owner may verify the audit chain');
select pg_temp.act_as('a4000000-0000-4000-8000-000000000003');
select pg_temp.request('GET', '/profiles');
select throws_ok('select public.api_gate()', 'PT403', 'Permission denied', 'an inactive account is refused everywhere');
reset role;
set local role anon;
select pg_temp.act_as(null, 'anon');
select pg_temp.request('GET', '/branches');
select throws_ok('select public.api_gate()', 'PT403', 'Permission denied', 'anonymous requests are refused');
reset role;
select pg_temp.act_as(null, 'service_role');
select pg_temp.request('GET', '/audit_logs');
select lives_ok('select public.api_gate()', 'the trusted backend (service role) is not gated');

-- Audited denials (AC-RBAC-04-05) -----------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a4000000-0000-4000-8000-000000000002');
select public.log_access_denial('table/audit_logs', 'DENY_PERMISSION', 'GET');
select public.log_access_denial('table/audit_logs', 'DENY_PERMISSION', 'GET');
reset role;
select results_eq(
  $$select count(*)::int, min(branch_id::text), bool_and(event_hash ~ '^[0-9a-f]{64}$')
    from public.audit_logs where action = 'authz.denied' and user_id = 'a4000000-0000-4000-8000-000000000002'$$,
  $$values (1, '00000000-0000-4000-8000-000000000001'::text, true)$$,
  'a denial is written once (per minute) to the hash-chained log, with the server-side branch');
select ok(not has_function_privilege('authenticated', 'public.log_service_access_denial(uuid,text,text)', 'execute'),
  'only the backend can log a denial on behalf of another user');
select public.log_service_access_denial('a4000000-0000-4000-8000-000000000003', 'staff-auth/change-password', 'DENY_INACTIVE');
select ok(exists (select 1 from public.audit_logs where action = 'authz.denied'
  and user_id = 'a4000000-0000-4000-8000-000000000003' and description like 'Denied staff-auth/change-password%'),
  'denials decided by the staff-auth function are logged too');

select * from finish();
rollback;
