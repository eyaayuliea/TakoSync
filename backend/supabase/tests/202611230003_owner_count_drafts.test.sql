-- OM-20 c1: the owner can read saved count drafts; staff cannot use the owner read.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

create temporary table draft_fixture on commit drop as
select
  '61000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '62000000-0000-4000-8000-000000000001'::uuid as staff_id,
  '63000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  '63000000-0000-4000-8000-000000000002'::uuid as staff_session_id,
  '64000000-0000-4000-8000-000000000001'::uuid as draft_id;
grant select on draft_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'draft-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Draft Owner"}'::jsonb from draft_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'draft-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Draft Staff"}'::jsonb from draft_fixture;

update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = (select owner_id from draft_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900201', branch_id = '00000000-0000-4000-8000-000000000001'::uuid,
  active = true, must_change_password = false
where id = (select staff_id from draft_fixture);

insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from draft_fixture
union all select staff_session_id, staff_id, now(), now() from draft_fixture;

-- A draft as save_daily_stock_check_draft stores it: one line counted, one not yet.
insert into public.daily_stock_check_drafts (draft_id, branch_id, staff_id, check_date, lines)
select draft_id, '00000000-0000-4000-8000-000000000001'::uuid, staff_id, current_date,
  jsonb_build_array(
    jsonb_build_object('ingredient_id', 'flour', 'recorded_quantity', 10, 'inventory_revision', 1, 'physical_quantity', 9.5, 'unit', 'kg'),
    jsonb_build_object('ingredient_id', 'eggs', 'recorded_quantity', 30, 'inventory_revision', 1, 'physical_quantity', null, 'unit', 'pc'))
from draft_fixture;

-- Staff ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_id::text from draft_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select staff_id from draft_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from draft_fixture))::text, true);

select throws_ok('select * from public.list_owner_count_drafts()', '42501', 'Only the owner can view count drafts',
  'staff cannot use the owner read of count drafts');

-- Owner ------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', (select owner_id::text from draft_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from draft_fixture), 'role', 'authenticated',
  'session_id', (select owner_session_id from draft_fixture))::text, true);

select is((select count(*)::int from public.list_owner_count_drafts() where draft_id = (select draft_id from draft_fixture)), 2,
  'OM-20 c1: the owner sees each line of a saved draft');
select is((select staff_name from public.list_owner_count_drafts() where draft_id = (select draft_id from draft_fixture) limit 1), 'Draft Staff',
  'the draft names the staff member who saved it');
select is((select actual_quantity from public.list_owner_count_drafts() where ingredient_id = 'flour' and draft_id = (select draft_id from draft_fixture)), 9.5::numeric,
  'a counted line carries the quantity counted so far');
select is((select expected_quantity from public.list_owner_count_drafts() where ingredient_id = 'flour' and draft_id = (select draft_id from draft_fixture)), 10::numeric,
  'a line carries the expected quantity saved with the draft');
select ok((select actual_quantity is null from public.list_owner_count_drafts() where ingredient_id = 'eggs' and draft_id = (select draft_id from draft_fixture)),
  'a line not counted yet has no actual quantity');
select is((select count(*)::int from public.list_owner_count_drafts('00000000-0000-4000-8000-000000000002'::uuid) where draft_id = (select draft_id from draft_fixture)), 0,
  'the branch filter leaves out other branches');

select * from finish();
rollback;
