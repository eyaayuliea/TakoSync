-- OM-14 c7, c9 / OW-25 c6, c9: Validate Count keeps later sales; Reject Count
-- asks for a recount. Rolled back at the end.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

create temporary table count_fixture on commit drop as
select
  'a1000000-0000-4000-8000-000000000001'::uuid as owner_id,
  'a2000000-0000-4000-8000-000000000001'::uuid as staff_id,
  'a3000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  gen_random_uuid() as check_id,
  gen_random_uuid() as validate_line_id,
  gen_random_uuid() as reject_line_id,
  gen_random_uuid() as negative_line_id;
grant select on count_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'count-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Count Owner"}' from count_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'count-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Count Staff"}' from count_fixture;
update public.profiles set role = 'owner', branch_id = null, active = true, must_change_password = false
where id = (select owner_id from count_fixture);
update public.profiles set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true, must_change_password = false
where id = (select staff_id from count_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from count_fixture;

-- The count saw flour 10 kg (counted 8), eggs 10 (counted 9), and
-- octopus 10 kg (counted 2). Since then sales used 3 kg flour and 9 kg octopus.
update public.branch_inventory set quantity = 7
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
update public.branch_inventory set quantity = 10
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'eggs';
update public.branch_inventory set quantity = 1
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'octopus';

insert into public.daily_stock_checks (id, reference, branch_id, submitted_by, check_date, status)
select check_id, 'COUNT-TEST', '00000000-0000-4000-8000-000000000001', staff_id, current_date, 'pending_owner_review'
from count_fixture;
insert into public.daily_stock_count_lines (id, daily_stock_check_id, ingredient_id, recorded_quantity, physical_quantity, difference, unit, inventory_revision)
select validate_line_id, check_id, 'flour', 10, 8, -2, 'kg', 0 from count_fixture
union all select reject_line_id, check_id, 'eggs', 10, 9, -1, 'pcs', 0 from count_fixture
union all select negative_line_id, check_id, 'octopus', 10, 2, -8, 'kg', 0 from count_fixture;

select ok(not has_table_privilege('authenticated', 'public.inventory_count_rejections', 'insert'),
  'rejections are written only by RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select owner_id::text from count_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from count_fixture), 'role', 'authenticated',
  'session_id', (select owner_session_id from count_fixture))::text, true);

select is(
  (select (public.validate_submitted_inventory_count(validate_line_id, 'Shortage confirmed')).outcome from count_fixture),
  'adjusted', 'OM-14 c7: a count is validated although stock moved after it');
select is(
  (select quantity from public.branch_inventory
   where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  5.000::numeric(12, 3), 'the −2 kg difference is added to the current 7 kg, so the later sales are kept');

select throws_ok(
  format('select public.reject_submitted_inventory_count(%L, %L)', (select reject_line_id from count_fixture), ''),
  'P0001', 'A reason of 1 to 1000 characters is required to request a recount', 'Reject Count needs a reason');
select is(
  (select (public.reject_submitted_inventory_count(reject_line_id, 'Count the eggs again')).reason from count_fixture),
  'Count the eggs again', 'OM-14 c9: the owner rejects the count');
select is(
  (select quantity from public.branch_inventory
   where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'eggs'),
  10.000::numeric(12, 3), 'Reject Count does not change the expected quantity');
select throws_ok(
  format('select public.validate_submitted_inventory_count(%L, %L)', (select reject_line_id from count_fixture), 'Late'),
  'P0001', 'This count was rejected for a recount and can no longer be validated', 'a rejected count is locked');
select throws_ok(
  format('select public.reject_submitted_inventory_count(%L, %L)', (select validate_line_id from count_fixture), 'Too late'),
  'P0001', 'This count has already been validated and is locked', 'a validated count cannot be rejected');

select throws_like(
  format('select public.validate_submitted_inventory_count(%L, %L)', (select negative_line_id from count_fixture), 'Shortage'),
  'Validating this count would make the expected % negative%',
  'a validation that would make stock negative is refused with a clear message');

select public.reject_submitted_inventory_count(negative_line_id, 'Recount the octopus') from count_fixture;
select is((select status from public.daily_stock_checks where id = (select check_id from count_fixture)), 'validated',
  'the check is closed once every difference is validated or rejected');

select * from finish();
rollback;
