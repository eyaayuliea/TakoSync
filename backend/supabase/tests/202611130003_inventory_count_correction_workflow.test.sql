begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

select set_config('st11.owner_id', gen_random_uuid()::text, true);
select set_config('st11.staff_id', gen_random_uuid()::text, true);
select set_config('st11.other_staff_id', gen_random_uuid()::text, true);
select set_config('st11.owner_session_id', gen_random_uuid()::text, true);
select set_config('st11.staff_session_id', gen_random_uuid()::text, true);
select set_config('st11.other_session_id', gen_random_uuid()::text, true);
select set_config('st11.branch_id', gen_random_uuid()::text, true);
select set_config('st11.other_branch_id', gen_random_uuid()::text, true);
select set_config('st11.ingredient_category_id', 'st11_' || replace(gen_random_uuid()::text, '-', ''), true);
select set_config('st11.flour_id', 'st11_flour_' || replace(gen_random_uuid()::text, '-', ''), true);
select set_config('st11.other_ingredient_id', 'st11_other_' || replace(gen_random_uuid()::text, '-', ''), true);
select set_config('st11.move_flour_id', gen_random_uuid()::text, true);
select set_config('st11.move_other_id', gen_random_uuid()::text, true);
select set_config('st11.daily_request', gen_random_uuid()::text, true);
select set_config('st11.correction_a', gen_random_uuid()::text, true);
select set_config('st11.correction_b', gen_random_uuid()::text, true);
select set_config('st11.correction_c', gen_random_uuid()::text, true);
select set_config('st11.correction_d', gen_random_uuid()::text, true);
select set_config('st11.correction_f', gen_random_uuid()::text, true);

insert into public.branches (id, code, name, city) values
  (
    current_setting('st11.branch_id')::uuid,
    'ST11-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    'ST-11 isolated test branch',
    'Test'
  ),
  (
    current_setting('st11.other_branch_id')::uuid,
    'ST11-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    'ST-11 other isolated test branch',
    'Test'
  );

insert into public.ingredient_categories (id, name)
values (
  current_setting('st11.ingredient_category_id'),
  'ST-11 test ' || current_setting('st11.ingredient_category_id')
);
insert into public.ingredients (id, category_id, name, unit, quantity_precision, active)
values
  (
    current_setting('st11.flour_id'),
    current_setting('st11.ingredient_category_id'),
    'ST-11 flour ' || current_setting('st11.flour_id'),
    'pcs',
    0,
    true
  ),
  (
    current_setting('st11.other_ingredient_id'),
    current_setting('st11.ingredient_category_id'),
    'ST-11 other ' || current_setting('st11.other_ingredient_id'),
    'pcs',
    0,
    true
  );

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    current_setting('st11.owner_id')::uuid,
    'authenticated',
    'authenticated',
    current_setting('st11.owner_id') || '@st11.test.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"ST-11 Owner"}'
  ),
  (
    current_setting('st11.staff_id')::uuid,
    'authenticated',
    'authenticated',
    current_setting('st11.staff_id') || '@st11.test.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"ST-11 Staff"}'
  ),
  (
    current_setting('st11.other_staff_id')::uuid,
    'authenticated',
    'authenticated',
    current_setting('st11.other_staff_id') || '@st11.test.invalid',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"ST-11 Other Staff"}'
  );

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = current_setting('st11.owner_id')::uuid;
update public.profiles
set role = 'staff', branch_id = current_setting('st11.branch_id')::uuid, active = true
where id = current_setting('st11.staff_id')::uuid;
update public.profiles
set role = 'staff', branch_id = current_setting('st11.other_branch_id')::uuid, active = true
where id = current_setting('st11.other_staff_id')::uuid;

insert into auth.sessions (id, user_id, created_at, updated_at) values
  (
    current_setting('st11.owner_session_id')::uuid,
    current_setting('st11.owner_id')::uuid,
    now(),
    now()
  ),
  (
    current_setting('st11.staff_session_id')::uuid,
    current_setting('st11.staff_id')::uuid,
    now(),
    now()
  ),
  (
    current_setting('st11.other_session_id')::uuid,
    current_setting('st11.other_staff_id')::uuid,
    now(),
    now()
  );
insert into public.business_day_sessions (session_id, user_id, business_date) values
  (
    current_setting('st11.owner_session_id')::uuid,
    current_setting('st11.owner_id')::uuid,
    (clock_timestamp() at time zone 'Asia/Manila')::date
  ),
  (
    current_setting('st11.staff_session_id')::uuid,
    current_setting('st11.staff_id')::uuid,
    (clock_timestamp() at time zone 'Asia/Manila')::date
  ),
  (
    current_setting('st11.other_session_id')::uuid,
    current_setting('st11.other_staff_id')::uuid,
    (clock_timestamp() at time zone 'Asia/Manila')::date
  );

update public.business_day_settings
set opening_time = time '00:00:00',
    normal_closing_time = time '23:59:58',
    extended_closing_time = time '23:59:59',
    extended_closing_enabled = true
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;
update public.branch_inventory
set quantity = 10
where branch_id = current_setting('st11.branch_id')::uuid
  and ingredient_id = current_setting('st11.flour_id');
update public.branch_inventory
set quantity = 4
where branch_id = current_setting('st11.branch_id')::uuid
  and ingredient_id = current_setting('st11.other_ingredient_id');
update public.branch_inventory
set quantity = 20
where branch_id = current_setting('st11.other_branch_id')::uuid
  and ingredient_id = current_setting('st11.flour_id');
select set_config(
  'st11.initial_flour_revision',
  (
    select inventory_revision::text
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.flour_id')
  ),
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);

select lives_ok(
  $$select public.record_inventory_transactions_idempotent(
    current_setting('st11.branch_id')::uuid,
    current_setting('st11.move_flour_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.flour_id'),
      'type', 'stock_in',
      'quantity', 1,
      'unit', 'pcs',
      'transaction_date', now()::text,
      'reason', 'ST-11 movement test',
      'notes', '',
      'batch_reference', null,
      'expiration_date', null
    ))
  )$$,
  'a relevant movement is recorded after the count snapshot'
);
select throws_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.branch_id')::uuid,
    current_setting('st11.daily_request')::uuid,
    current_date,
    'stale expected quantity',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.flour_id'),
      'recorded_quantity', 10,
      'physical_quantity', 8,
      'inventory_revision', current_setting('st11.initial_flour_revision')::bigint
    ))
  )$$::text,
  'P0001'::character(5),
  'Inventory changed after this count began; restart the count before submitting'::text,
  'a relevant movement after count start blocks submission'
);

select lives_ok(
  $$select public.record_inventory_transactions_idempotent(
    current_setting('st11.branch_id')::uuid,
    current_setting('st11.move_other_id')::uuid,
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.other_ingredient_id'),
      'type', 'stock_out',
      'quantity', 1,
      'unit', 'pcs',
      'transaction_date', now()::text,
      'reason', 'ST-11 unrelated movement test',
      'notes', '',
      'batch_reference', null,
      'expiration_date', null
    ))
  )$$,
  'an unrelated item movement is recorded'
);
select lives_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.branch_id')::uuid,
    current_setting('st11.daily_request')::uuid,
    current_date,
    'pinned count with unrelated movement',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.flour_id'),
      'recorded_quantity', 11,
      'physical_quantity', 10,
      'inventory_revision', (
        select inventory_revision from public.branch_inventory
        where branch_id = current_setting('st11.branch_id')::uuid
          and ingredient_id = current_setting('st11.flour_id')
      )
    ))
  )$$,
  'an unrelated item movement does not invalidate this count line'
);
select set_config(
  'st11.check_id',
  (select id::text from public.daily_stock_checks
   where branch_id = current_setting('st11.branch_id')::uuid
     and remarks = 'pinned count with unrelated movement'),
  true
);
select lives_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.branch_id')::uuid,
    current_setting('st11.daily_request')::uuid,
    current_date,
    'pinned count with unrelated movement',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.flour_id'),
      'recorded_quantity', 11,
      'physical_quantity', 10,
      'inventory_revision', (
        select inventory_revision from public.branch_inventory
        where branch_id = current_setting('st11.branch_id')::uuid
          and ingredient_id = current_setting('st11.flour_id')
      )
    ))
  )$$,
  'replaying an identical daily count returns the original result'
);
select throws_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.branch_id')::uuid,
    current_setting('st11.daily_request')::uuid,
    current_date,
    'changed retry payload',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.flour_id'),
      'recorded_quantity', 11,
      'physical_quantity', 9,
      'inventory_revision', (
        select inventory_revision from public.branch_inventory
        where branch_id = current_setting('st11.branch_id')::uuid
          and ingredient_id = current_setting('st11.flour_id')
      )
    ))
  )$$::text,
  '22023'::character(5),
  'The daily count request ID is already associated with a different submission'::text,
  'reusing a daily count request ID with changed payload is rejected'
);
select is(
  (
    select count(*)::integer
    from public.daily_stock_checks
    where request_id = current_setting('st11.daily_request')::uuid
  ),
  1,
  'an identical daily count replay creates one physical count'
);
select throws_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.other_branch_id')::uuid,
    current_setting('st11.daily_request')::uuid,
    current_date,
    'pinned count with unrelated movement',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.flour_id'),
      'recorded_quantity', 11,
      'physical_quantity', 10,
      'inventory_revision', 0
    ))
  )$$::text,
  '42501'::character(5),
  'Branch access denied'::text,
  'a Staff account cannot submit a count for another branch'
);
select set_config(
  'st11.count_line_id',
  (select id::text from public.daily_stock_count_lines
   where daily_stock_check_id = current_setting('st11.check_id')::uuid
     and ingredient_id = current_setting('st11.flour_id')),
  true
);
select is(
  (
    select recorded_quantity
    from public.daily_stock_count_lines
    where id = current_setting('st11.count_line_id')::uuid
  ),
  11::numeric,
  'the count retains the expected quantity pinned when counting began'
);
select is(
  (
    select inventory_revision
    from public.daily_stock_count_lines
    where id = current_setting('st11.count_line_id')::uuid
  ),
  (
    select inventory_revision
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.flour_id')
  ),
  'the count retains the item-specific inventory revision snapshot'
);

select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_a')::uuid,
    11,
    'Recount confirmed expected quantity'
  )$$,
  'Staff can submit an authenticated count correction request'
);
select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_a')::uuid,
    11,
    'Recount confirmed expected quantity'
  )$$,
  'retrying the same request ID and payload is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.inventory_count_correction_requests
    where request_id = current_setting('st11.correction_a')::uuid
  ),
  1,
  'a retried request creates one correction history record'
);
select throws_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_a')::uuid,
    12,
    'Changed retry payload'
  )$$::text,
  'P0001'::character(5),
  'Correction request ID was already used with a different payload'::text,
  'changed payload under the same request ID is rejected'
);
select throws_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_b')::uuid,
    12,
    'Must wait for the pending request decision'
  )$$::text,
  'P0001'::character(5),
  'A correction request is already pending for this count line'::text,
  'only one pending correction is allowed for a count line'
);

select set_config('request.jwt.claim.sub', current_setting('st11.other_staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.other_staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.other_session_id')
  )::text,
  true
);
select throws_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_b')::uuid,
    12,
    'Cross-branch attempt'
  )$$::text,
  '42501'::character(5),
  'This count line does not belong to the authenticated Staff account'::text,
  'Staff from another branch cannot request corrections for this count'
);
select ok(
  not has_table_privilege('authenticated', 'public.inventory_count_correction_requests', 'INSERT'),
  'Staff cannot bypass the secured request RPC with direct table writes'
);

select set_config('request.jwt.claim.sub', current_setting('st11.owner_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.owner_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.owner_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.decide_inventory_count_correction(
    current_setting('st11.correction_a')::uuid,
    'approved',
    'Owner approves the recount'
  )$$,
  'Owner can approve a pending correction request'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.flour_id')
  ),
  11::numeric,
  'approval alone does not adjust inventory'
);

select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_b')::uuid,
    12,
    'A second correction after the first decision'
  )$$,
  'Staff may submit another request after a decision but before validation'
);
select set_config('request.jwt.claim.sub', current_setting('st11.owner_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.owner_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.owner_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.decide_inventory_count_correction(
    current_setting('st11.correction_b')::uuid,
    'rejected',
    'Owner rejects the second recount'
  )$$,
  'Owner can reject a correction request'
);
select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_c')::uuid,
    11,
    'A third correction after rejection'
  )$$,
  'Staff may submit another request after rejection'
);
select set_config('request.jwt.claim.sub', current_setting('st11.owner_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.owner_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.owner_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.decide_inventory_count_correction(
    current_setting('st11.correction_c')::uuid,
    'approved',
    'Owner approves the final recount'
  )$$,
  'Owner can approve a later correction request'
);
select lives_ok(
  $$select public.validate_inventory_count_correction(
    current_setting('st11.correction_c')::uuid,
    'Recount matches expected stock'
  )$$,
  'Owner can separately Validate Count after approval'
);
select is(
  (
    select outcome
    from public.inventory_count_validations
    where correction_request_id = (
      select id from public.inventory_count_correction_requests
      where request_id = current_setting('st11.correction_c')::uuid
    )
  ),
  'no_change',
  'corrected actual equal to expected resolves as a no-change outcome'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.flour_id')
  ),
  11::numeric,
  'no-change validation leaves inventory unchanged'
);
select is(
  (
    select count(*)::integer
    from public.inventory_count_validations
    where daily_stock_count_line_id = current_setting('st11.count_line_id')::uuid
      and validated_by = current_setting('st11.owner_id')::uuid
      and reason = 'Recount matches expected stock'
  ),
  1,
  'no-change validation retains an auditable Owner resolution'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where notes = 'Validated physical count line ' || current_setting('st11.count_line_id')
  ),
  0,
  'no-change resolution creates no inventory movement'
);
select lives_ok(
  $$select public.validate_inventory_count_correction(
    current_setting('st11.correction_c')::uuid,
    'Recount matches expected stock'
  )$$,
  'retrying Validate Count is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.inventory_count_validations
    where daily_stock_count_line_id = current_setting('st11.count_line_id')::uuid
  ),
  1,
  'retry creates no duplicate validation'
);
select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_c')::uuid,
    11,
    'A third correction after rejection'
  )$$,
  'a saved request retry remains idempotent after validation'
);
select throws_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.count_line_id')::uuid,
    current_setting('st11.correction_d')::uuid,
    12,
    'A new request after Validate Count'
  )$$::text,
  'P0001'::character(5),
  'This count line has already been validated'::text,
  'new correction requests are blocked after Validate Count'
);

select lives_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.branch_id')::uuid,
    gen_random_uuid(),
    current_date,
    'second count for an actual adjustment',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.other_ingredient_id'),
      'recorded_quantity', 3,
      'physical_quantity', 4,
      'inventory_revision', (
        select inventory_revision from public.branch_inventory
        where branch_id = current_setting('st11.branch_id')::uuid
          and ingredient_id = current_setting('st11.other_ingredient_id')
      )
    ))
  )$$,
  'a new count can be submitted after an unrelated inventory movement'
);
select set_config(
  'st11.other_count_line_id',
  (
    select line.id::text
    from public.daily_stock_count_lines line
    join public.daily_stock_checks check_record on check_record.id = line.daily_stock_check_id
    where check_record.remarks = 'second count for an actual adjustment'
      and line.ingredient_id = current_setting('st11.other_ingredient_id')
  ),
  true
);
select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.other_count_line_id')::uuid,
    current_setting('st11.correction_d')::uuid,
    2,
    'Recount confirms two pieces'
  )$$,
  'Staff can request a correction that requires an inventory adjustment'
);
select set_config('request.jwt.claim.sub', current_setting('st11.owner_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.owner_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.owner_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.decide_inventory_count_correction(
    current_setting('st11.correction_d')::uuid,
    'approved',
    'Owner approves final actual quantity'
  )$$,
  'Owner can approve the adjustment request'
);
select lives_ok(
  $$select public.validate_inventory_count_correction(
    current_setting('st11.correction_d')::uuid,
    'Physical quantity verified'
  )$$,
  'Validate Count records the authorized adjustment'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.other_ingredient_id')
  ),
  2::numeric,
  'validation adjusts inventory exactly to the corrected actual quantity'
);
select lives_ok(
  $$select public.validate_inventory_count_correction(
    current_setting('st11.correction_d')::uuid,
    'Physical quantity verified'
  )$$,
  'retrying an adjustment validation does not apply the adjustment again'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where notes = 'Validated physical count line ' || current_setting('st11.other_count_line_id')
  ),
  1,
  'retry creates only one validated inventory movement'
);

select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.submit_daily_stock_check(
    current_setting('st11.branch_id')::uuid,
    gen_random_uuid(),
    current_date,
    'count for adjustment rollback test',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', current_setting('st11.ingredient_id'),
      'recorded_quantity', 10,
      'physical_quantity', 9,
      'inventory_revision', (
        select inventory_revision from public.branch_inventory
        where branch_id = current_setting('st11.branch_id')::uuid
          and ingredient_id = current_setting('st11.ingredient_id')
      )
    ))
  )$$,
  'a separate count can be submitted for adjustment rollback coverage'
);
select set_config(
  'st11.rollback_count_line_id',
  (
    select line.id::text
    from public.daily_stock_count_lines line
    join public.daily_stock_checks check_record on check_record.id = line.daily_stock_check_id
    where check_record.remarks = 'count for adjustment rollback test'
      and line.ingredient_id = current_setting('st11.ingredient_id')
  ),
  true
);
select lives_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.rollback_count_line_id')::uuid,
    current_setting('st11.correction_e')::uuid,
    9,
    'Rollback test confirms nine'
  )$$,
  'Staff can request the rollback-test correction'
);
select set_config('request.jwt.claim.sub', current_setting('st11.owner_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.owner_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.owner_session_id')
  )::text,
  true
);
select lives_ok(
  $$select public.decide_inventory_count_correction(
    current_setting('st11.correction_e')::uuid,
    'approved',
    'Approve rollback-test correction'
  )$$,
  'Owner can approve the rollback-test correction'
);
reset role;
create function public.st11_fail_count_adjustment()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ST-11 injected adjustment failure';
end;
$$;
create trigger st11_fail_count_adjustment
before insert on public.inventory_discrepancy_adjustments
for each row execute function public.st11_fail_count_adjustment();
set local role authenticated;
select throws_ok(
  $$select public.validate_inventory_count_correction(
    current_setting('st11.correction_e')::uuid,
    'Inject adjustment write failure'
  )$$,
  'P0001',
  'ST-11 injected adjustment failure',
  'failed adjustment recording aborts count validation'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.ingredient_id')
  ),
  10::numeric,
  'failed validation rolls back the inventory movement'
);
select is(
  (
    select count(*)::integer
    from public.inventory_discrepancy_adjustments
    where daily_stock_count_line_id = current_setting('st11.rollback_count_line_id')::uuid
  ),
  0,
  'failed validation leaves no adjustment audit row'
);
select is(
  (
    select count(*)::integer
    from public.inventory_count_validations
    where daily_stock_count_line_id = current_setting('st11.rollback_count_line_id')::uuid
  ),
  0,
  'failed validation leaves no resolution audit row'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where notes = 'Validated physical count line ' || current_setting('st11.rollback_count_line_id')
  ),
  0,
  'failed validation leaves no inventory movement'
);
reset role;
drop trigger st11_fail_count_adjustment on public.inventory_discrepancy_adjustments;
drop function public.st11_fail_count_adjustment();
set local role authenticated;
select lives_ok(
  $$select public.validate_inventory_count_correction(
    current_setting('st11.correction_e')::uuid,
    'Retry after adjustment write recovery'
  )$$,
  'approved correction can be validated after the adjustment failure is removed'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = current_setting('st11.branch_id')::uuid
      and ingredient_id = current_setting('st11.ingredient_id')
  ),
  9::numeric,
  'successful retry applies the correction once'
);

reset role;
delete from public.inventory_count_validations
where daily_stock_count_line_id = current_setting('st11.rollback_count_line_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('st11.staff_id'), true);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', current_setting('st11.staff_id'),
    'role', 'authenticated',
    'session_id', current_setting('st11.staff_session_id')
  )::text,
  true
);
select throws_ok(
  $$select public.request_inventory_count_correction(
    current_setting('st11.rollback_count_line_id')::uuid,
    current_setting('st11.correction_f')::uuid,
    8,
    'New request after a legacy adjustment'
  )$$::text,
  'P0001'::character(5),
  'This count line has already been validated or adjusted'::text,
  'a legacy inventory adjustment blocks new correction requests'
);

reset role;
select * from finish();
rollback;
