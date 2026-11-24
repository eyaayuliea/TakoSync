-- ST-13 / OW-26 c7 / OM-15: entry reversal requests and owner approval.
-- Runs inside one transaction that is rolled back.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

create temporary table rev_fixture on commit drop as
select
  '61000000-0000-4000-8000-000000000001'::uuid as owner_id,
  '62000000-0000-4000-8000-000000000001'::uuid as staff_id,
  '62000000-0000-4000-8000-000000000002'::uuid as other_staff_id,
  '63000000-0000-4000-8000-000000000001'::uuid as owner_session_id,
  '63000000-0000-4000-8000-000000000002'::uuid as staff_session_id,
  gen_random_uuid() as stock_in_id,
  gen_random_uuid() as spillage_id,
  gen_random_uuid() as old_stock_in_id,
  gen_random_uuid() as other_stock_in_id,
  gen_random_uuid() as used_stock_in_id,
  gen_random_uuid() as stock_lot_id,
  gen_random_uuid() as used_lot_id;
grant select on rev_fixture to authenticated;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'rev-owner@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Rev Owner"}'::jsonb from rev_fixture
union all
select staff_id, 'authenticated', 'authenticated', 'rev-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Rev Staff"}'::jsonb from rev_fixture
union all
select other_staff_id, 'authenticated', 'authenticated', 'rev-other@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Rev Other"}'::jsonb from rev_fixture;

update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = (select owner_id from rev_fixture);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-' || case when id = (select staff_id from rev_fixture) then '900001' else '900002' end, branch_id = '00000000-0000-4000-8000-000000000001'::uuid, active = true, must_change_password = false
where id in (select staff_id from rev_fixture union all select other_staff_id from rev_fixture);

insert into auth.sessions (id, user_id, created_at, updated_at)
select owner_session_id, owner_id, now(), now() from rev_fixture
union all select staff_session_id, staff_id, now(), now() from rev_fixture;

-- Branch 1 flour: 10 g on an older lot, then today's 3 g Stock-In on its own
-- lot, then 1 g spilled from the older lot. 12 g on hand.
update public.branch_inventory set quantity = 12
where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour';
insert into public.ingredient_batches (id, branch_id, ingredient_id, batch_reference, received_date, quantity_received, quantity_remaining)
select gen_random_uuid(), '00000000-0000-4000-8000-000000000001'::uuid, 'flour', 'REV-OLD-LOT', current_date - 3, 10, 9 from rev_fixture
union all
select stock_lot_id, '00000000-0000-4000-8000-000000000001'::uuid, 'flour', 'REV-STOCK-LOT', current_date, 3, 3 from rev_fixture
union all
select used_lot_id, '00000000-0000-4000-8000-000000000001'::uuid, 'flour', 'REV-USED-LOT', current_date, 2, 1 from rev_fixture;

insert into public.inventory_movements (id, reference, branch_id, ingredient_id, actor_id, type, quantity, unit,
  movement, before_quantity, after_quantity, reason, notes, batch_id, created_at)
select stock_in_id, 'REV-STOCK-IN', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', staff_id, 'stock_in'::public.inventory_transaction_type,
  3, 'g', 3, 10, 13, '', '', stock_lot_id, now() from rev_fixture
union all
select spillage_id, 'REV-SPILL', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', staff_id, 'waste'::public.inventory_transaction_type,
  1, 'g', -1, 13, 12, 'Spillage', 'Dropped a bag', null, now() from rev_fixture
union all
select old_stock_in_id, 'REV-OLD-STOCK-IN', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', staff_id, 'stock_in'::public.inventory_transaction_type,
  1, 'g', 1, 9, 10, '', '', null, now() - interval '2 days' from rev_fixture
union all
select other_stock_in_id, 'REV-OTHER-STOCK-IN', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', other_staff_id, 'stock_in'::public.inventory_transaction_type,
  1, 'g', 1, 9, 10, '', '', null, now() from rev_fixture
union all
select used_stock_in_id, 'REV-USED-STOCK-IN', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', staff_id, 'stock_in'::public.inventory_transaction_type,
  2, 'g', 2, 8, 10, '', '', used_lot_id, now() from rev_fixture;

select ok(not has_table_privilege('authenticated', 'public.inventory_entry_reversal_requests', 'insert'),
  'reversal requests are written only by RPC');

-- Staff ------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_id::text from rev_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select staff_id from rev_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from rev_fixture))::text, true);

select throws_ok(
  format('select public.request_inventory_entry_reversal(%L, %L, %L)', (select stock_in_id from rev_fixture), '', gen_random_uuid()),
  'P0001', 'Enter the reason for reversing this entry.', 'ST-13 c3: the reason is required');

select throws_ok(
  format('select public.request_inventory_entry_reversal(%L, %L, %L)', (select other_stock_in_id from rev_fixture), 'Typo', gen_random_uuid()),
  'P0001', 'You can only reverse your own entries.', 'ST-13 c9: another employee''s entry cannot be reversed');

select throws_ok(
  format('select public.request_inventory_entry_reversal(%L, %L, %L)', (select old_stock_in_id from rev_fixture), 'Typo', gen_random_uuid()),
  'P0001', 'Only entries from the current business day can be reversed.', 'ST-13 c9: an earlier business day cannot be reversed');

select throws_ok(
  format('select public.request_inventory_entry_reversal(%L, %L, %L)', (select used_stock_in_id from rev_fixture), 'Typo', gen_random_uuid()),
  'P0001', 'Part of this entry has already been used, so it cannot be reversed. Ask the owner to record an authorized adjustment instead.',
  'a Stock-In whose lot was partly used cannot be reversed');

select is(
  (select (public.request_inventory_entry_reversal(stock_in_id, 'Entered 3 g instead of 0', gen_random_uuid())).entry_type from rev_fixture),
  'stock_in', 'ST-13 c4: a Stock-In reversal is requested');

select throws_ok(
  format('select public.request_inventory_entry_reversal(%L, %L, %L)', (select stock_in_id from rev_fixture), 'Again', gen_random_uuid()),
  'P0001', 'A reversal request for this entry is already pending.', 'ST-13 c6: a second pending request is rejected');

select is(
  (select (public.request_inventory_entry_reversal(spillage_id, 'It was not spilled', gen_random_uuid())).entry_type from rev_fixture),
  'spillage', 'a Waste entry recorded as Spillage is reversed as Spillage');

select is(
  (select quantity from public.branch_inventory
   where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour'),
  12.000::numeric(12, 3), 'ST-13 c5: stock is unchanged while requests are pending');

-- Owner ------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', (select owner_id::text from rev_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select owner_id from rev_fixture), 'role', 'authenticated',
  'session_id', (select owner_session_id from rev_fixture))::text, true);

select throws_ok(
  format('select public.decide_inventory_entry_reversal(%L, %L, %L)',
    (select id from public.inventory_entry_reversal_requests where entry_key = (select spillage_id::text from rev_fixture)), 'reject', ''),
  'P0001', 'Enter the reason for rejecting this request.', 'OM-15 c8: rejecting needs a reason');

select is(
  (select (public.decide_inventory_entry_reversal(id, 'reject', 'The spillage did happen')).status
   from public.inventory_entry_reversal_requests where entry_key = (select spillage_id::text from rev_fixture)),
  'rejected', 'ST-13 c8: the owner rejects the spillage reversal');

select is(
  (select (public.decide_inventory_entry_reversal(id, 'approve', null)).status
   from public.inventory_entry_reversal_requests where entry_key = (select stock_in_id::text from rev_fixture)),
  'approved', 'OM-15 c7: the owner approves the Stock-In reversal');

select is(
  (select quantity from public.branch_inventory
   where branch_id = '00000000-0000-4000-8000-000000000001'::uuid and ingredient_id = 'flour'),
  9.000::numeric(12, 3), 'the 3 g Stock-In is taken back out of stock');

select is(
  (select quantity_remaining from public.ingredient_batches where id = (select stock_lot_id from rev_fixture)),
  0.000::numeric(12, 3), 'it is taken from the Stock-In''s own lot');

select results_eq(
  format($$select type::text, movement, reverses_movement_id from public.inventory_movements
    where reverses_movement_id = %L$$, (select stock_in_id from rev_fixture)),
  format($$values ('entry_reversal', -3.000::numeric(12, 3), %L::uuid)$$, (select stock_in_id from rev_fixture)),
  'ST-13 c7: one Entry Reversal movement is linked to the original');

select is(
  (select movement from public.inventory_movements where id = (select stock_in_id from rev_fixture)),
  3.000::numeric(12, 3), 'ST-13 c7: the original entry stays unchanged in the history');

-- Staff again ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', (select staff_id::text from rev_fixture), true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select staff_id from rev_fixture), 'role', 'authenticated',
  'session_id', (select staff_session_id from rev_fixture))::text, true);

select throws_ok(
  format('select public.request_inventory_entry_reversal(%L, %L, %L)', (select stock_in_id from rev_fixture), 'Again', gen_random_uuid()),
  'P0001', 'This entry has already been reversed.', 'a reversed entry cannot be reversed again');

-- Database owner: Entry Reversal movements only come from an approved request.
reset role;
select throws_ok(
  format($$insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type,
    reverses_movement_id, quantity, unit, movement, before_quantity, after_quantity)
    values ('REV-FORGED', '00000000-0000-4000-8000-000000000001'::uuid, 'flour', %L, 'entry_reversal', %L,
    1, 'g', 1, 9, 10)$$, (select owner_id from rev_fixture), (select spillage_id from rev_fixture)),
  'P0001', 'This movement type requires an approved atomic workflow',
  'Entry Reversal movements cannot be written outside an approved request');

select * from finish();
rollback;
