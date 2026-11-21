-- ST-01 c3: 5 failed attempts lock a Staff account for 15 minutes.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('91000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'lock-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Lock Staff"}');
update public.profiles set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true
where id = '91000000-0000-4000-8000-000000000001';

select ok(not has_function_privilege('authenticated', 'public.register_staff_login_failure(uuid)', 'execute'),
  'signed-in users cannot count failures themselves');
select ok(not has_function_privilege('anon', 'public.clear_staff_login_failures(uuid)', 'execute'),
  'anonymous users cannot clear a lock');

select is((public.register_staff_login_failure('91000000-0000-4000-8000-000000000001') ->> 'attempts_remaining')::int, 4,
  'the first wrong password leaves 4 attempts');
select public.register_staff_login_failure('91000000-0000-4000-8000-000000000001');
select public.register_staff_login_failure('91000000-0000-4000-8000-000000000001');
select is((public.register_staff_login_failure('91000000-0000-4000-8000-000000000001') ->> 'locked')::boolean, false,
  'four wrong passwords do not lock the account');
select is((public.register_staff_login_failure('91000000-0000-4000-8000-000000000001') ->> 'locked')::boolean, true,
  'the fifth wrong password locks it');

select ok(
  (select locked_until between now() + interval '14 minutes 59 seconds' and now() + interval '15 minutes 1 second'
   from public.profiles where id = '91000000-0000-4000-8000-000000000001'),
  'the lock lasts 15 minutes');
select is((public.staff_login_lock_status('91000000-0000-4000-8000-000000000001') ->> 'locked')::boolean, true,
  'the account reports as locked');

-- An expired lock starts a new count.
update public.profiles set locked_until = now() - interval '1 minute'
where id = '91000000-0000-4000-8000-000000000001';
select is((public.staff_login_lock_status('91000000-0000-4000-8000-000000000001') ->> 'locked')::boolean, false,
  'the lock ends after 15 minutes');
select is((public.register_staff_login_failure('91000000-0000-4000-8000-000000000001') ->> 'failed_attempts')::int, 1,
  'after an expired lock the count starts again');

select public.clear_staff_login_failures('91000000-0000-4000-8000-000000000001');
select is((select failed_login_attempts from public.profiles where id = '91000000-0000-4000-8000-000000000001'), 0,
  'a successful sign-in or owner reset clears the count');

select * from finish();
rollback;
