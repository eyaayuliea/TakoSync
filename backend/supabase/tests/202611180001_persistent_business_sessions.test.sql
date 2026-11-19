begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '11111111-aaaa-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'persistent-owner-test@takosync.invalid',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Persistent Owner"}'
  ),
  (
    '22222222-bbbb-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'persistent-staff-test@takosync.invalid',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Persistent Staff"}'
  );

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '11111111-aaaa-4111-8111-111111111111';
update public.profiles
set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001',
    active = true, must_change_password = true
where id = '22222222-bbbb-4222-8222-222222222222';

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aaaaaaaa-1111-4111-8111-111111111111', '11111111-aaaa-4111-8111-111111111111', now(), now()),
  ('bbbbbbbb-2222-4222-8222-222222222222', '22222222-bbbb-4222-8222-222222222222', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date) values
  ('aaaaaaaa-1111-4111-8111-111111111111', '11111111-aaaa-4111-8111-111111111111',
    (clock_timestamp() at time zone 'Asia/Manila')::date - 1),
  ('bbbbbbbb-2222-4222-8222-222222222222', '22222222-bbbb-4222-8222-222222222222',
    (clock_timestamp() at time zone 'Asia/Manila')::date - 1);

select has_function_privilege(
  'authenticated', 'public.process_sale_inventory(uuid)', 'execute'
);
select ok(
  not has_function_privilege('authenticated', 'public.process_sale_inventory_unchecked(uuid)', 'execute'),
  'the original sale inventory implementation is not directly executable'
);
select ok(
  not has_function_privilege('authenticated', 'public.process_sale_inventory_integrity_unchecked(uuid)', 'execute'),
  'the integrity sale inventory wrapper is not directly executable'
);
select ok(
  position('is_business_session_active' in pg_get_functiondef('public.process_sale_inventory(uuid)'::regprocedure)) > 0,
  'the public sale inventory entry point validates the Auth session'
);
select ok(
  position('process_sale_inventory_integrity_unchecked' in pg_get_functiondef('public.process_sale_inventory(uuid)'::regprocedure)) > 0
    or position('process_sale_inventory_unchecked' in pg_get_functiondef('public.process_sale_inventory(uuid)'::regprocedure)) > 0,
  'the public sale inventory entry point delegates to the existing internal implementation'
);
select ok(
  position('Sale processing access denied' in pg_get_functiondef('public.process_sale_inventory_unchecked(uuid)'::regprocedure)) > 0,
  'the internal sale inventory implementation enforces branch access'
);
select ok(
  position('is_business_session_active' in pg_get_functiondef('public.can_access_branch(uuid)'::regprocedure)) > 0,
  'branch access requires a live Auth session, not a business-hours window'
);
select ok(
  position('is_business_session_active' in pg_get_functiondef('public.is_active_owner()'::regprocedure)) > 0,
  'Owner-only authorization requires a live Auth session'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-aaaa-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-1111-4111-8111-111111111111"}',
  true
);
select is(
  (public.business_session_status() ->> 'active')::boolean,
  true,
  'an active Owner Auth session remains valid after its recorded business date'
);
select is(
  public.business_session_status() -> 'expires_at',
  'null'::jsonb,
  'business session status has no time-based expiration'
);
select is(
  (public.business_session_status() ->> 'milliseconds_until_expiration')::integer,
  0,
  'business session status reports no expiration countdown'
);
select is(
  (public.authorize_business_session() ->> 'active')::boolean,
  true,
  'Owner session authorization does not impose a business-day deadline'
);
select is(
  (select count(*)::integer from public.branches),
  3,
  'an Owner retains cross-branch access after the recorded business date'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000001'),
  true,
  'Owner can access Branch 1'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000002'),
  true,
  'Owner can access Branch 2'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000003'),
  true,
  'Owner can access Branch 3'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-bbbb-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}',
  true
);
select is(
  (public.business_session_status() ->> 'active')::boolean,
  true,
  'an assigned Staff Auth session remains valid after its recorded business date'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000001'),
  true,
  'Staff using the Employee ID initial password retains assigned-branch access'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000002'),
  false,
  'Staff remains restricted from another branch'
);

reset role;
update public.profiles set active = false
where id = '22222222-bbbb-4222-8222-222222222222';
set local role authenticated;
select is(
  (public.business_session_status() ->> 'active')::boolean,
  false,
  'deactivating an account revokes its active business access'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000001'),
  false,
  'deactivated Staff cannot access the assigned branch'
);

reset role;
delete from auth.sessions
where id = 'aaaaaaaa-1111-4111-8111-111111111111';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-aaaa-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-1111-4111-8111-111111111111"}',
  true
);
select is(
  (public.business_session_status() ->> 'active')::boolean,
  false,
  'revoking the Auth session ends access'
);
select is(
  public.can_access_branch('00000000-0000-4000-8000-000000000001'),
  false,
  'revoking the Owner Auth session ends branch access'
);

select * from finish();
rollback;
