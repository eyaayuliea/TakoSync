begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'discrepancy-owner-test@takosync.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Discrepancy Test Owner"}'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'discrepancy-staff-test@takosync.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Discrepancy Test Staff"}'
  );

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles
set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true
where id = '22222222-2222-4222-8222-222222222222';

update public.business_day_settings
set normal_closing_time = time '23:59:58',
    extended_closing_time = time '23:59:59',
    extended_closing_enabled = true
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', '11111111-1111-4111-8111-111111111111', now(), now()),
  ('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', '22222222-2222-4222-8222-222222222222', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date) values
  (
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    (clock_timestamp() at time zone 'Asia/Manila')::date
  ),
  (
    'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    '22222222-2222-4222-8222-222222222222',
    (clock_timestamp() at time zone 'Asia/Manila')::date
  );

update public.branch_inventory
set quantity = 10
where branch_id = '00000000-0000-4000-8000-000000000001'
  and ingredient_id = 'flour';
update public.branch_inventory
set quantity = 50
where branch_id = '00000000-0000-4000-8000-000000000002'
  and ingredient_id = 'flour';

reset role;

insert into public.daily_stock_checks (
  id, reference, branch_id, submitted_by, check_date, remarks, status
) values (
  '33333333-3333-4333-8333-333333333333',
  'TEST-COUNT-OWNER-001',
  '00000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  current_date,
  'Discrepancy workflow test',
  'pending_owner_review'
);

insert into public.daily_stock_count_lines (
  id, daily_stock_check_id, ingredient_id, recorded_quantity,
  physical_quantity, difference, unit
) values (
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'flour',
  10,
  8,
  -2,
  'kg'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.authorize_inventory_discrepancy_adjustment(uuid,text)',
    'execute'
  ),
  'anonymous users cannot execute the adjustment operation'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'INSERT'),
  'authenticated users cannot directly insert adjustment records'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'UPDATE'),
  'authenticated users cannot directly alter adjustment audit records'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_discrepancy_adjustments', 'DELETE'),
  'authenticated users cannot directly delete adjustment audit records'
);
select ok(
  not has_table_privilege('anon', 'public.inventory_discrepancy_adjustments', 'SELECT'),
  'anonymous users cannot read adjustment audit records'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', 'anonymous attempt'
  )$$,
  '42501',
  'permission denied for function authorize_inventory_discrepancy_adjustment',
  'unauthenticated users cannot execute the adjustment operation'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-cccc-4ddd-8eee-ffffffffffff"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', 'staff attempt'
  )$$,
  '42501',
  'Only an active owner may authorize inventory adjustments',
  'staff cannot authorize a discrepancy adjustment'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', '   '
  )$$,
  'P0001',
  'An adjustment reason of 1 to 1000 characters is required',
  'owner must provide a non-empty reason'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
update public.profiles
set active = false
where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', 'inactive owner attempt'
  )$$,
  '42501',
  'Only an active owner may authorize inventory adjustments',
  'inactive owner cannot authorize a discrepancy adjustment'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
update public.profiles
set active = true
where id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);

select lives_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', 'Count verified by owner'
  )$$,
  'active owner can authorize a current discrepancy'
);
select is(
  (
    select jsonb_build_array(recorded_quantity, physical_quantity, difference)
    from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = '44444444-4444-4444-8444-444444444444'
  ),
  '[10, 8, -2]'::jsonb,
  'approval preserves expected, physical, and difference quantities'
);
select is(
  (
    select jsonb_build_array(recorded_quantity, physical_quantity, difference)
    from public.daily_stock_count_lines
    where id = '44444444-4444-4444-8444-444444444444'
  ),
  '[10, 8, -2]'::jsonb,
  'approval leaves the original submitted count unchanged'
);
select ok(
  exists (
    select 1
    from public.inventory_discrepancy_adjustments adjustment
    join public.inventory_movements movement
      on movement.id = adjustment.inventory_movement_id
    where adjustment.daily_stock_count_line_id = '44444444-4444-4444-8444-444444444444'
      and adjustment.approved_by = '11111111-1111-4111-8111-111111111111'
      and adjustment.reason = 'Count verified by owner'
      and adjustment.approved_at is not null
      and movement.type = 'adjustment'
      and movement.movement = -2
  ),
  'approval, reason, timestamp, and resulting movement are linked'
);
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::integer
    from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = '44444444-4444-4444-8444-444444444444'
  ),
  0,
  'staff cannot read owner discrepancy approval records'
);
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000001'
      and ingredient_id = 'flour'
  ),
  8::numeric,
  'authorized discrepancy updates inventory to the counted quantity'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000002'
      and ingredient_id = 'flour'
  ),
  50::numeric,
  'adjustment does not alter inventory in another branch'
);
select lives_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', 'Count verified by owner'
  )$$,
  'retrying authorization is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = '44444444-4444-4444-8444-444444444444'
  ),
  1,
  'retry creates no duplicate adjustment record'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where notes = 'Authorized physical count line 44444444-4444-4444-8444-444444444444'
  ),
  1,
  'retry creates no duplicate inventory movement'
);

reset role;

insert into public.daily_stock_checks (
  id, reference, branch_id, submitted_by, check_date, remarks, status
) values (
  '55555555-5555-4555-8555-555555555555',
  'TEST-COUNT-OWNER-002',
  '00000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  current_date,
  'Stale discrepancy workflow test',
  'pending_owner_review'
);
insert into public.daily_stock_count_lines (
  id, daily_stock_check_id, ingredient_id, recorded_quantity,
  physical_quantity, difference, unit
) values (
  '66666666-6666-4666-8666-666666666666',
  '55555555-5555-4555-8555-555555555555',
  'flour',
  8,
  5,
  -3,
  'kg'
);
update public.branch_inventory
set quantity = 9
where branch_id = '00000000-0000-4000-8000-000000000001'
  and ingredient_id = 'flour';
update public.branch_inventory
set quantity = 8
where branch_id = '00000000-0000-4000-8000-000000000001'
  and ingredient_id = 'flour';

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '66666666-6666-4666-8666-666666666666', 'Stale count attempt'
  )$$,
  'P0001',
  'Inventory changed after this count; submit a new physical count before adjusting',
  'stale count cannot silently overwrite later inventory activity'
);
select is(
  (
    select count(*)::integer
    from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = '66666666-6666-4666-8666-666666666666'
  ),
  0,
  'stale count creates no approval record'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000001'
      and ingredient_id = 'flour'
  ),
  8::numeric,
  'stale count leaves current inventory unchanged'
);

reset role;

insert into public.daily_stock_checks (
  id, reference, branch_id, submitted_by, check_date, remarks, status
) values (
  '99999999-9999-4999-8999-999999999999',
  'TEST-COUNT-OWNER-004',
  '00000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  current_date,
  'Positive discrepancy workflow test',
  'pending_owner_review'
);
insert into public.daily_stock_count_lines (
  id, daily_stock_check_id, ingredient_id, recorded_quantity,
  physical_quantity, difference, unit
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999999',
  'flour',
  8,
  11,
  3,
  'kg'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select lives_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Positive count verified'
  )$$,
  'active owner can authorize a positive discrepancy'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000001'
      and ingredient_id = 'flour'
  ),
  11::numeric,
  'positive discrepancy increases inventory to the counted quantity'
);
select ok(
  exists (
    select 1
    from public.inventory_discrepancy_adjustments adjustment
    join public.inventory_movements movement
      on movement.id = adjustment.inventory_movement_id
    join public.audit_logs log
      on log.branch_id = adjustment.branch_id
     and log.action = 'inventory.adjustment'
     and log.description like '%' || movement.reference || '%'
    where adjustment.daily_stock_count_line_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and movement.movement = 3
  ),
  'positive adjustment links to the conventionally audited inventory movement'
);

reset role;

insert into public.daily_stock_checks (
  id, reference, branch_id, submitted_by, check_date, remarks, status
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'TEST-COUNT-OWNER-005',
  '00000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  current_date,
  'No-op discrepancy workflow test',
  'pending_owner_review'
);
insert into public.daily_stock_count_lines (
  id, daily_stock_check_id, ingredient_id, recorded_quantity,
  physical_quantity, difference, unit
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'flour',
  11,
  11,
  0,
  'kg'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'No-op must not adjust'
  )$$,
  'P0001',
  'The physical count has no discrepancy to adjust',
  'zero discrepancy cannot create an authorized adjustment'
);

reset role;

insert into public.daily_stock_checks (
  id, reference, branch_id, submitted_by, check_date, remarks, status
) values (
  '77777777-7777-4777-8777-777777777777',
  'TEST-COUNT-OWNER-003',
  '00000000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222',
  current_date,
  'Atomic rollback workflow test',
  'pending_owner_review'
);
insert into public.daily_stock_count_lines (
  id, daily_stock_check_id, ingredient_id, recorded_quantity,
  physical_quantity, difference, unit
) values (
  '88888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  'flour',
  11,
  13,
  2,
  'kg'
);

create function public.fail_discrepancy_adjustment_insert()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Forced failure after inventory movement';
end;
$$;
create trigger fail_discrepancy_adjustment_insert
before insert on public.inventory_discrepancy_adjustments
for each row execute function public.fail_discrepancy_adjustment_insert();

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '88888888-8888-4888-8888-888888888888', 'Atomicity test'
  )$$,
  'P0001',
  'Forced failure after inventory movement',
  'database rolls back when discrepancy audit linking fails'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = '00000000-0000-4000-8000-000000000001'
      and ingredient_id = 'flour'
  ),
  11::numeric,
  'failed audit linking rolls back the inventory balance change'
);
select is(
  (
    select count(*)::integer
    from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = '88888888-8888-4888-8888-888888888888'
  ),
  0,
  'failed audit linking leaves no adjustment record'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where notes = 'Authorized physical count line 88888888-8888-4888-8888-888888888888'
  ),
  0,
  'failed audit linking rolls back the inventory movement'
);

select * from finish();
rollback;
