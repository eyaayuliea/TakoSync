begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
select set_config('request.jwt.claims', '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}', true);
select is(
  (select near_expiration_days from public.owner_inventory_settings where id = true),
  21,
  'active staff can read the owner-configured expiration window'
);
update public.owner_inventory_settings set near_expiration_days = 22 where id = true;
select is(
  (select near_expiration_days from public.owner_inventory_settings where id = true),
  21,
  'staff cannot change the expiration alert setting'
);

select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
select set_config('request.jwt.claims', '{"sub":"88888888-8888-4888-8888-888888888888","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.owner_inventory_settings),
  0,
  'inactive staff cannot read the expiration alert setting'
);

select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
select set_config('request.jwt.claims', '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}', true);
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
set local role anon;
select ok(
  not has_table_privilege('anon', 'public.owner_inventory_settings', 'SELECT'),
  'anonymous users cannot read expiration alert settings'
);

select * from finish();
rollback;
