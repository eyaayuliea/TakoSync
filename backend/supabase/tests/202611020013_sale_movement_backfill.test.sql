begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select ok(
  not has_function_privilege(
    'anon', 'public.backfill_historical_sale_movements()', 'execute'
  ),
  'anonymous users cannot execute the maintenance backfill'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.backfill_historical_sale_movements()', 'execute'
  ),
  'authenticated users cannot execute the maintenance backfill'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'sale-backfill-test@takosync.invalid', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sale Backfill Test"}'
);

update public.profiles
set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true
where id = '90000000-0000-4000-8000-000000000001';

insert into public.sales (
  id, transaction_reference, branch_id, staff_id, total_amount, payment_method,
  status, inventory_processing_status
) values
  ('91000000-0000-4000-8000-000000000001', 'TEST-BACKFILL-SAME-BRANCH', '00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 0, 'Cash', 'pending', 'pending'),
  ('91000000-0000-4000-8000-000000000002', 'TEST-BACKFILL-CROSS-BRANCH', '00000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 0, 'Cash', 'pending', 'pending'),
  ('91000000-0000-4000-8000-000000000003', 'TEST-BACKFILL-ALREADY-LINKED', '00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 0, 'Cash', 'pending', 'pending');

update public.branch_inventory
set quantity = 100
where branch_id = '00000000-0000-4000-8000-000000000001'
  and ingredient_id = 'flour';

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('app.sales_processing', 'true', true);

do $$
begin
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000001'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000099'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:not-a-uuid'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000002'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'sale_id', '91000000-0000-4000-8000-000000000003',
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000003'
    ))
  );
end;
$$;

reset role;

select is(
  public.backfill_historical_sale_movements(),
  1,
  'the exact maintenance function links the one safe historical movement'
);

select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000001' and sale_id = '91000000-0000-4000-8000-000000000001'),
  1,
  'same-branch sale references are linked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000099' and sale_id is null),
  1,
  'unmatched sale references remain unlinked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:not-a-uuid' and sale_id is null),
  1,
  'malformed sale references remain unlinked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000002' and sale_id is null),
  1,
  'cross-branch references remain unlinked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000003' and sale_id = '91000000-0000-4000-8000-000000000003'),
  1,
  'already-linked sale IDs are preserved'
);

-- The applied historical-reference index prevents constructing these legacy
-- duplicate rows normally. A savepoint makes the temporary index removal and
-- invalid fixtures fully rollback-safe while exercising the conflict guards.
savepoint duplicate_backfill_fixtures;
drop index public.inventory_movements_sale_consumption_ref_idx;

insert into public.sales (
  id, transaction_reference, branch_id, staff_id, total_amount, payment_method,
  status, inventory_processing_status
) values
  ('91000000-0000-4000-8000-000000000004', 'TEST-BACKFILL-DUPLICATE-CANDIDATES', '00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 0, 'Cash', 'pending', 'pending'),
  ('91000000-0000-4000-8000-000000000005', 'TEST-BACKFILL-CONFLICTING-CANDIDATE', '00000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 0, 'Cash', 'pending', 'pending');

set local role authenticated;
do $$
begin
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000004'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000004'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'sale_id', '91000000-0000-4000-8000-000000000005',
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000005'
    ))
  );
  perform public.record_inventory_transactions(
    '00000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'ingredient_id', 'flour', 'type', 'sales_consumption', 'quantity', 1,
      'reason', 'backfill test', 'notes', 'sale:91000000-0000-4000-8000-000000000005'
    ))
  );
end;
$$;
reset role;

select is(
  public.backfill_historical_sale_movements(),
  0,
  'duplicate and conflicting candidates are skipped without raising a unique violation'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000004' and sale_id is null),
  2,
  'both competing candidate movements remain unlinked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000005' and sale_id is null),
  1,
  'a candidate conflicting with an existing linked movement remains unlinked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000005' and sale_id = '91000000-0000-4000-8000-000000000005'),
  1,
  'the existing conflicting movement remains linked'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes in ('sale:91000000-0000-4000-8000-000000000004', 'sale:91000000-0000-4000-8000-000000000005')),
  4,
  'duplicate/conflict fixtures are not deleted or rewritten'
);
select ok(
  (
    select not exists (
      select 1
      from public.inventory_movements
      where notes in (
        'sale:91000000-0000-4000-8000-000000000004',
        'sale:91000000-0000-4000-8000-000000000005'
      )
        and (quantity <> 1 or unit <> 'kg' or movement <> -1 or reason <> 'backfill test')
    )
  ),
  'duplicate/conflict fixtures preserve their historical fields'
);
select is(
  public.backfill_historical_sale_movements(),
  0,
  'repeating the exact maintenance function is idempotent for unsafe fixtures'
);

rollback to savepoint duplicate_backfill_fixtures;

select is(
  public.backfill_historical_sale_movements(),
  0,
  'repeating the exact maintenance function after cleanup makes no changes'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes = 'sale:91000000-0000-4000-8000-000000000001' and sale_id is not null),
  1,
  'repeating the backfill does not alter existing links or create duplicates'
);
select is(
  (select count(*)::integer from public.inventory_movements where notes in ('sale:91000000-0000-4000-8000-000000000099', 'sale:not-a-uuid', 'sale:91000000-0000-4000-8000-000000000002') and sale_id is null),
  3,
  'repeating the backfill keeps unsafe references unlinked'
);

select * from finish();
rollback;
