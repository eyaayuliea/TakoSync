-- A1 / US-FEFO-01: FEFO lot allocation with a min-heap, certificates and lot expiry classes.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fefo-owner@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"FEFO Owner"}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'fefo-staff2@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"FEFO Staff Two"}'::jsonb);
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = 'a1000000-0000-4000-8000-000000000001';
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900201',
  branch_id = '00000000-0000-4000-8000-000000000002', active = true, must_change_password = false
where id = 'a1000000-0000-4000-8000-000000000002';

select ok(not has_function_privilege('authenticated', 'private.fefo_allocate(uuid,text,numeric,timestamptz,boolean)', 'execute'),
  'AC-FEFO-01-05: the allocator is internal; apps cannot call it directly');
select ok(not has_table_privilege('authenticated', 'public.inventory_fefo_certificates', 'insert'),
  'certificates are written only by the inventory function');

-- Branch 1 flour: only these lots, 15 kg on hand.
update public.ingredient_batches set quantity_remaining = 0
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
update public.branch_inventory set quantity = 15
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
insert into public.ingredient_batches (id, branch_id, ingredient_id, batch_reference, received_date, expiration_date,
  quantity_received, quantity_remaining, status)
values
  ('a1b00000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'flour', 'FEFO-EXPIRED',
   current_date - 10, (now() at time zone 'Asia/Manila')::date - 1, 2, 2, 'active'),
  ('a1b00000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'flour', 'FEFO-TODAY',
   current_date - 9, (now() at time zone 'Asia/Manila')::date, 1, 1, 'active'),
  ('a1b00000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'flour', 'FEFO-LATER',
   current_date - 1, (now() at time zone 'Asia/Manila')::date + 5, 5, 5, 'active'),
  ('a1b00000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'flour', 'FEFO-HELD',
   current_date - 2, (now() at time zone 'Asia/Manila')::date + 1, 3, 3, 'quarantined'),
  ('a1b00000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000001', 'flour', 'FEFO-NO-EXPIRY',
   current_date - 3, null, 4, 4, 'active'),
  ('a1b00000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', 'flour', 'FEFO-BRANCH2-HELD',
   current_date - 3, null, 1, 1, 'reserved');

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('a1c00000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', now(), now()),
  ('a1c00000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', now(), now());
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-000000000001',
  'role', 'authenticated', 'session_id', 'a1c00000-0000-4000-8000-000000000001')::text, true);

create temporary table fefo_moves (step text, movement_id uuid) on commit drop;

insert into fefo_moves
select 'use3', id from public.record_inventory_transactions('00000000-0000-4000-8000-000000000001',
  '[{"type":"usage","ingredient_id":"flour","quantity":3}]'::jsonb);

select results_eq(
  $$select a ->> 'batch_reference', (a ->> 'quantity')::numeric
    from public.inventory_fefo_certificates c, jsonb_array_elements(c.allocations) with ordinality as e(a, n)
    where c.movement_id = (select movement_id from fefo_moves where step = 'use3') order by n$$,
  $$values ('FEFO-TODAY', 1.000::numeric), ('FEFO-LATER', 2.000::numeric)$$,
  'AC-FEFO-01-03/04: the lot expiring today goes first, then the next; expired and held lots are skipped');

select is((select status from public.inventory_fefo_certificates where movement_id = (select movement_id from fefo_moves where step = 'use3')),
  'COMPLETED', 'AC-FEFO-01-10: a fully covered request is COMPLETED');
select is((select quantity_remaining from public.ingredient_batches where id = 'a1b00000-0000-4000-8000-000000000001'),
  2.000::numeric(12, 3), 'the expired lot is not used for normal consumption');
select is((select quantity_remaining from public.ingredient_batches where id = 'a1b00000-0000-4000-8000-000000000004'),
  3.000::numeric(12, 3), 'a quarantined lot is not used');

insert into fefo_moves
select 'use9', id from public.record_inventory_transactions('00000000-0000-4000-8000-000000000001',
  '[{"type":"usage","ingredient_id":"flour","quantity":9}]'::jsonb);

select results_eq(
  $$select status, allocated_quantity, shortfall_quantity from public.inventory_fefo_certificates
    where movement_id = (select movement_id from fefo_moves where step = 'use9')$$,
  $$values ('PARTIAL'::text, 7.000::numeric(12, 3), 2.000::numeric(12, 3))$$,
  'AC-FEFO-01-07: when usable lots run out the rest is reported as a shortfall');
select results_eq(
  $$select a ->> 'batch_reference' from public.inventory_fefo_certificates c,
    jsonb_array_elements(c.allocations) with ordinality as e(a, n)
    where c.movement_id = (select movement_id from fefo_moves where step = 'use9') order by n$$,
  $$values ('FEFO-LATER'), ('FEFO-NO-EXPIRY')$$,
  'a lot with no expiration date is used last');
select is((select quantity from public.branch_inventory
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  3.000::numeric(12, 3), 'the branch balance still records the full usage');
select ok((select bool_and(quantity_remaining >= 0) from public.ingredient_batches
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  'AC-FEFO-01-06: no lot goes below zero');

insert into fefo_moves
select 'waste', id from public.record_inventory_transactions('00000000-0000-4000-8000-000000000001',
  '[{"type":"waste","ingredient_id":"flour","quantity":1,"reason":"Spoilage"}]'::jsonb);
select results_eq(
  $$select a ->> 'batch_reference', c.included_expired from public.inventory_fefo_certificates c,
    jsonb_array_elements(c.allocations) as e(a)
    where c.movement_id = (select movement_id from fefo_moves where step = 'waste')$$,
  $$values ('FEFO-EXPIRED'::text, true)$$,
  'spoilage is recorded against the expired lot');

insert into fefo_moves
select 'none', id from public.record_inventory_transactions('00000000-0000-4000-8000-000000000001',
  '[{"type":"usage","ingredient_id":"flour","quantity":0.5}]'::jsonb);
select results_eq(
  $$select status, allocated_quantity, jsonb_array_length(allocations) from public.inventory_fefo_certificates
    where movement_id = (select movement_id from fefo_moves where step = 'none')$$,
  $$values ('INSUFFICIENT_STOCK'::text, 0.000::numeric(12, 3), 0)$$,
  'with only expired and held lots left nothing is allocated');

select throws_ok(
  $$select * from public.record_inventory_transactions('00000000-0000-4000-8000-000000000001',
    '[{"type":"usage","ingredient_id":"flour","quantity":100}]'::jsonb)$$,
  '22023', null, 'AC-FEFO-01-06: the branch balance still cannot go below zero');

select is((select count(*)::int from public.inventory_fefo_certificates
  where movement_id in (select movement_id from fefo_moves)), 4,
  'AC-FEFO-01-08: every decrease has exactly one certificate');

insert into fefo_moves
select 'stock', id from public.record_inventory_transactions('00000000-0000-4000-8000-000000000001',
  '[{"type":"stock_in","ingredient_id":"flour","quantity":2}]'::jsonb);
select is((select count(*)::int from public.inventory_fefo_certificates
  where movement_id = (select movement_id from fefo_moves where step = 'stock')), 0,
  'a Stock-In creates a lot, not an allocation');

select throws_ok(
  $$update public.inventory_fefo_certificates set shortfall_quantity = 0, allocated_quantity = requested_quantity$$,
  'P0001', 'FEFO allocation certificates cannot be changed or deleted', 'certificates cannot be edited');
select throws_ok(
  $$delete from public.inventory_fefo_certificates$$,
  'P0001', 'FEFO allocation certificates cannot be changed or deleted', 'certificates cannot be deleted');

-- The heap returns the exact FEFO order for many lots with ties.
update public.ingredient_batches set quantity_remaining = 0
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'dashi';
insert into public.ingredient_batches (branch_id, ingredient_id, batch_reference, received_date, expiration_date,
  quantity_received, quantity_remaining)
select '00000000-0000-4000-8000-000000000001', 'dashi', 'HEAP-' || n,
  current_date - (n % 4), case when n % 9 = 0 then null else current_date + 2 + (n * 37 % 11) end, 1, 1
from generate_series(1, 60) n;
create temporary table heap_result on commit drop as
select private.fefo_allocate('00000000-0000-4000-8000-000000000001', 'dashi', 60) as certificate;
select is(
  (select array_agg(a ->> 'batch_reference' order by n) from heap_result, jsonb_array_elements(certificate -> 'allocations') with ordinality e(a, n)),
  (select array_agg(batch_reference order by coalesce(expiration_date, 'infinity'), received_date, created_at, id)
   from public.ingredient_batches where branch_id = '00000000-0000-4000-8000-000000000001'
     and ingredient_id = 'dashi' and batch_reference like 'HEAP-%'),
  'AC-FEFO-01-04: the min-heap gives the same order as a full sort on (expiry, received, created, id)');
select is((select certificate ->> 'status' from heap_result), 'COMPLETED', 'all 60 lots are allocated');

select throws_ok(
  $$select private.fefo_allocate('00000000-0000-4000-8000-000000000001', 'dashi', 0)$$,
  '22023', 'The quantity to allocate must be greater than zero.', 'AC-FEFO-01-02: the quantity must be positive');

-- Lot expiry classes (AC-FEFO-01-11). 22 Nov 2026 10:00 in Manila.
select results_eq(
  $$select public.classify_lot_expiry(d, '2026-11-22 10:00+08') from (values
    ('2026-11-21'::date), ('2026-11-22'), ('2026-11-23'), ('2026-11-24'), (null)) v(d)$$,
  $$values ('EXPIRED'), ('RED'), ('YELLOW'), ('GREEN'), ('NO_EXPIRY')$$,
  'AC-FEFO-01-11: EXPIRED, RED (<24 h), YELLOW (24-48 h), GREEN, and no expiry');
select is(public.classify_lot_expiry('2026-11-24', '2026-11-22 10:00+08', 72, 24), 'YELLOW',
  'the owner can widen the warning window');
select throws_ok(
  $$update public.owner_inventory_settings set lot_warning_hours = 12, lot_critical_hours = 24$$,
  '23514', null, 'the red window cannot be longer than the yellow window');

-- The owner can hold a lot; staff cannot.
set local role authenticated;
select lives_ok(
  $$update public.ingredient_batches set status = 'quarantined' where id = 'a1b00000-0000-4000-8000-000000000003'$$,
  'the owner can put a lot on hold');
select is((select status from public.ingredient_batches where id = 'a1b00000-0000-4000-8000-000000000003'),
  'quarantined', 'the hold is saved');

-- Staff of another branch cannot read branch 1 certificates.
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a1000000-0000-4000-8000-000000000002',
  'role', 'authenticated', 'session_id', 'a1c00000-0000-4000-8000-000000000002')::text, true);
select is((select count(*)::int from public.inventory_fefo_certificates
  where branch_id = '00000000-0000-4000-8000-000000000001'), 0,
  'AC-FEFO-01-01: certificates are branch-scoped');
update public.ingredient_batches set status = 'active' where id = 'a1b00000-0000-4000-8000-000000000006';
reset role;
select is((select status from public.ingredient_batches where id = 'a1b00000-0000-4000-8000-000000000006'),
  'reserved', 'staff cannot change a lot''s hold status, even in their own branch');

select * from finish();
rollback;
