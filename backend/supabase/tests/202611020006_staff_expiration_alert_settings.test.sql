begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '66666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'expiration-owner-test@takosync.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Expiration Test Owner"}'
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    'authenticated',
    'authenticated',
    'expiration-staff-test@takosync.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Expiration Test Staff"}'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    'authenticated',
    'authenticated',
    'expiration-inactive-staff-test@takosync.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Expiration Inactive Staff"}'
  );

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '66666666-6666-4666-8666-666666666666';
update public.profiles
set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true
where id = '77777777-7777-4777-8777-777777777777';
update public.profiles
set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = false
where id = '88888888-8888-4888-8888-888888888888';
update public.owner_inventory_settings set near_expiration_days = 21 where id = true;
update public.business_day_settings
set normal_closing_time = time '23:59:58',
    extended_closing_time = time '23:59:59',
    extended_closing_enabled = true
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', '66666666-6666-4666-8666-666666666666', now(), now()),
  ('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', '77777777-7777-4777-8777-777777777777', now(), now()),
  ('cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date) values
  (
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    '66666666-6666-4666-8666-666666666666',
    (clock_timestamp() at time zone 'Asia/Manila')::date
  ),
  (
    'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    '77777777-7777-4777-8777-777777777777',
    (clock_timestamp() at time zone 'Asia/Manila')::date
  ),
  (
    'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
    '88888888-8888-4888-8888-888888888888',
    (clock_timestamp() at time zone 'Asia/Manila')::date
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated","session_id":"bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"}', true);
select is(
  (select near_expiration_days from public.owner_inventory_settings where id = true),
  21,
  'active staff can read the owner-configured expiration window'
);
with changed as (
  update public.owner_inventory_settings
  set near_expiration_days = 22
  where id = true
  returning 1
)
select is(
  (select count(*)::integer from changed),
  0,
  'staff cannot update the expiration alert setting'
);
select is(
  (select near_expiration_days from public.owner_inventory_settings where id = true),
  21,
  'expiration alert setting remains unchanged after staff update attempt'
);

select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated","session_id":"cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa"}', true);
select is(
  (select count(*)::integer from public.owner_inventory_settings),
  0,
  'inactive staff cannot read the expiration alert setting'
);

select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}', true);
select is(
  (select near_expiration_days from public.owner_inventory_settings where id = true),
  21,
  'owner can read the configured expiration window'
);
update public.owner_inventory_settings set near_expiration_days = 14 where id = true;
select is(
  (select near_expiration_days from public.owner_inventory_settings where id = true),
  14,
  'owner can update the expiration alert setting'
);

reset role;
select ok(
  not has_table_privilege('anon', 'public.owner_inventory_settings', 'SELECT'),
  'anonymous users cannot read expiration alert settings'
);

select * from finish();
rollback;
