begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(3);

select has_column(
  'public',
  'profiles',
  'username',
  'Staff profiles retain the employee username'
);

select has_index(
  'public',
  'profiles',
  'profiles_staff_username_unique',
  'Staff usernames have a case-insensitive uniqueness constraint'
);

insert into public.profiles (id, email, username, full_name, role, branch_id, active)
values (
  gen_random_uuid(),
  'duplicate-username-seed@example.invalid',
  'same employee',
  'Duplicate Username Seed',
  'staff',
  '00000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    insert into public.profiles (id, email, username, full_name, role, branch_id, active)
    values (
      gen_random_uuid(),
      'duplicate-username-test@example.invalid',
      'same employee',
      'Duplicate Username Test',
      'staff',
      '00000000-0000-4000-8000-000000000001',
      true
    )
  $$,
  '23505',
  'Staff username uniqueness rejects a duplicate normalized username'
);

select * from finish();
rollback;
