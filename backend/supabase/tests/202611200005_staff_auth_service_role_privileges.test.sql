begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(4);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service_role can select profiles for staff-auth'
);

select ok(
  has_table_privilege('service_role', 'public.profiles', 'UPDATE'),
  'service_role can update profiles for staff-auth'
);

select ok(
  has_table_privilege('service_role', 'public.branches', 'SELECT'),
  'service_role can select branches for staff-auth'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon cannot select profiles'
);

select * from finish();
rollback;
