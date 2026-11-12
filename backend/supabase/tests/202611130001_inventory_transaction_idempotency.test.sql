begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(50);

create temporary table inventory_idempotency_fixture on commit drop as
select
  gen_random_uuid() as branch_id,
  gen_random_uuid() as inaccessible_branch_id,
  gen_random_uuid() as staff_a_id,
  gen_random_uuid() as staff_b_id;
grant select on inventory_idempotency_fixture to authenticated;

do $$
begin
  if not exists (select 1 from public.ingredients where id = 'flour' and active)
    or not exists (select 1 from public.ingredients where id = 'octopus' and active) then
    raise exception 'Inventory idempotency test requires active flour and octopus ingredient definitions';
  end if;
end;
$$;

insert into public.branches (id, code, name, city)
select branch_id, 'TEST-IDEMPOTENCY-' || branch_id::text,
  'Inventory Idempotency Test Branch', ''
from inventory_idempotency_fixture;

do $$
begin
  if not exists (
    select 1 from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ) or not exists (
    select 1 from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'octopus'
  ) then
    raise exception 'Inventory idempotency test requires branch inventory provisioning for flour and octopus';
  end if;
end;
$$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    (select staff_a_id from inventory_idempotency_fixture),
    'authenticated',
    'authenticated',
    (select 'inventory-idempotency-a-' || staff_a_id::text || '@takosync.invalid'
     from inventory_idempotency_fixture),
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Inventory Idempotency Staff A"}'
  ),
  (
    (select staff_b_id from inventory_idempotency_fixture),
    'authenticated',
    'authenticated',
    (select 'inventory-idempotency-b-' || staff_b_id::text || '@takosync.invalid'
     from inventory_idempotency_fixture),
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Inventory Idempotency Staff B"}'
  );

update public.profiles
set role = 'staff', branch_id = (select branch_id from inventory_idempotency_fixture), active = true
where id in (
  (select staff_a_id from inventory_idempotency_fixture),
  (select staff_b_id from inventory_idempotency_fixture)
);

create temporary table inventory_idempotency_baseline on commit drop as
select quantity
from public.branch_inventory
where branch_id = (select branch_id from inventory_idempotency_fixture)
  and ingredient_id = 'flour';
grant select on inventory_idempotency_baseline to authenticated;

select ok(
  has_function_privilege(
    'authenticated',
    'public.record_inventory_transactions_idempotent(uuid,uuid,jsonb)',
    'execute'
  ),
  'authenticated clients can use the keyed inventory RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_inventory_transactions(uuid,jsonb)',
    'execute'
  ),
  'authenticated clients cannot bypass the keyed inventory RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.record_inventory_transactions_idempotent(uuid,uuid,jsonb)',
    'execute'
  ),
  'anonymous clients cannot use the keyed inventory RPC'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  (select staff_a_id::text from inventory_idempotency_fixture),
  true
);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object('sub', staff_a_id::text, 'role', 'authenticated')::text
   from inventory_idempotency_fixture),
  true
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'a0000000-0000-4000-8000-000000000000',
    null::jsonb
  )$$,
  '22023',
  'A valid non-empty transaction list is required',
  'SQL NULL transaction payload is rejected'
);

select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a1111111-1111-4111-8111-111111111111',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
    )
  ),
  1,
  'first request is saved'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ),
  (select quantity + 2 from inventory_idempotency_baseline),
  'the first stock-in changes inventory once'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and actor_id = (select staff_a_id from inventory_idempotency_fixture)
      and request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'the first stock-in creates one movement'
);
select is(
  (
    select count(*)::integer
    from public.ingredient_batches batch
    join public.inventory_movements movement on movement.batch_id = batch.id
    where movement.request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'the first stock-in creates one expiration batch'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a1111111-1111-4111-8111-111111111111',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
    )
  ),
  1,
  'replay returns the original movement'
);
select is(
  (
    select reference
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a1111111-1111-4111-8111-111111111111',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
    )
  ),
  (
    select reference
    from public.inventory_movements
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and actor_id = (select staff_a_id from inventory_idempotency_fixture)
      and request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'same-key retry returns the original movement reference'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ),
  (select quantity + 2 from inventory_idempotency_baseline),
  'same-key retry does not change inventory again'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  1,
  'same-key retry does not duplicate movement history'
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'a1111111-1111-4111-8111-111111111111',
    '[{"ingredient_id":"flour","type":"stock_in","quantity":3,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
  )$$,
  '22023',
  'This request UUID was already used with a different transaction payload',
  'same request UUID with changed quantity is rejected'
);
reset role;
update public.ingredients set unit = 'kg-idempotency-test' where id = 'flour';
set local role authenticated;
select is(
  (
    select reference
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a1111111-1111-4111-8111-111111111111',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
    )
  ),
  (
    select reference
    from public.inventory_movements
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and actor_id = (select staff_a_id from inventory_idempotency_fixture)
      and request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'same payload replay returns the original movement after its unit configuration changes'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ),
  (select quantity + 2 from inventory_idempotency_baseline),
  'replay after unit configuration changes does not apply inventory again'
);
reset role;
update public.ingredients set unit = 'kg' where id = 'flour';
set local role authenticated;
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'a5555555-5555-4555-8555-555555555555',
    '[{"ingredient_id":"flour","type":"stock_in","quantity":1,"transaction_date":"2026-11-13","reason":"Stock-In","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  '22023',
  'An inventory transaction has missing or unsupported fields',
  'missing payload fields are rejected'
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'a6666666-6666-4666-8666-666666666666',
    '[{"ingredient_id":"flour","type":"stock_in","quantity":1,"unit":"pcs","transaction_date":"2026-11-13","reason":"Stock-In","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  '22023',
  'Inventory item or unit is not configured for this branch',
  'unit mismatch is rejected'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a2222222-2222-4222-8222-222222222222',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
    )
  ),
  1,
  'a new key creates a separate transaction'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ),
  (select quantity + 4 from inventory_idempotency_baseline),
  'same payload with a new UUID is a separate transaction'
);

select set_config('request.jwt.claim.sub', (select staff_b_id::text from inventory_idempotency_fixture), true);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object('sub', staff_b_id::text, 'role', 'authenticated')::text from inventory_idempotency_fixture),
  true
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a1111111-1111-4111-8111-111111111111',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
    )
  ),
  1,
  'the same request key is independent for another actor'
);
select ok(
  (
    select actor_b.reference <> actor_a.reference
    from public.inventory_movements actor_a
    cross join public.inventory_movements actor_b
    where actor_a.branch_id = (select branch_id from inventory_idempotency_fixture)
      and actor_a.actor_id = (select staff_a_id from inventory_idempotency_fixture)
      and actor_a.request_id = 'a1111111-1111-4111-8111-111111111111'
      and actor_b.branch_id = (select branch_id from inventory_idempotency_fixture)
      and actor_b.actor_id = (select staff_b_id from inventory_idempotency_fixture)
      and actor_b.request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  'another Staff actor receives a separate movement rather than the original actor result'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  2,
  'the same UUID is independent for a different Staff actor'
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select inaccessible_branch_id from inventory_idempotency_fixture),
    'a1111111-1111-4111-8111-111111111111',
    '[{"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13","reason":"Stock-In","notes":"Supplier A","batch_reference":null,"expiration_date":"2026-12-01"}]'::jsonb
  )$$,
  '42501',
  'Branch access denied',
  'a Staff member cannot replay a request against another branch'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where branch_id = (select inaccessible_branch_id from inventory_idempotency_fixture)
      and request_id = 'a1111111-1111-4111-8111-111111111111'
  ),
  0,
  'unauthorized branch replay creates no movement'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_a_id::text from inventory_idempotency_fixture), true);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object('sub', staff_a_id::text, 'role', 'authenticated')::text from inventory_idempotency_fixture),
  true
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a3333333-3333-4333-8333-333333333333',
      '[{"ingredient_id":"flour","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Spillage","notes":"Damaged container","batch_reference":null,"expiration_date":null}]'::jsonb
    )
  ),
  1,
  'first waste request is saved'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a3333333-3333-4333-8333-333333333333',
      '[{"ingredient_id":"flour","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Spillage","notes":"Damaged container","batch_reference":null,"expiration_date":null}]'::jsonb
    )
  ),
  1,
  'waste replay returns the original movement'
);
select is(
  (
    select count(*)::integer
    from public.inventory_movements
    where request_id = 'a3333333-3333-4333-8333-333333333333'
      and type = 'waste'
      and movement = -1
  ),
  1,
  'waste retry records one deduction movement'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a6666666-6666-4666-8666-666666666666',
      '[{"ingredient_id":"flour","type":"spoilage","quantity":0.25,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Spoilage","notes":"Expired item","batch_reference":null,"expiration_date":null}]'::jsonb
    )
  ),
  1,
  'an official spoilage category is accepted for a spoilage transaction'
);
select is(
  (
    select jsonb_build_array(reason, movement)
    from public.inventory_movements
    where request_id = 'a6666666-6666-4666-8666-666666666666'
  ),
  '["Spoilage",-0.25]'::jsonb,
  'spoilage category and signed movement are stored'
);

reset role;
create temporary table inventory_idempotency_post_waste_baseline on commit drop as
select
  (select quantity from public.branch_inventory
   where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour') as flour_quantity,
  (select count(*)::integer from public.ingredient_batches
   where branch_id = (select branch_id from inventory_idempotency_fixture)) as batch_count;
grant select on inventory_idempotency_post_waste_baseline to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_a_id::text from inventory_idempotency_fixture), true);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object('sub', staff_a_id::text, 'role', 'authenticated')::text from inventory_idempotency_fixture),
  true
);

select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'b1111111-1111-4111-8111-111111111111',
    '[{"ingredient_id":"flour","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  '22023',
  'An inventory transaction has missing or unsupported fields',
  'missing waste reason is rejected'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'b1111111-1111-4111-8111-111111111111'),
    (select count(*)::integer from public.ingredient_batches
     where branch_id = (select branch_id from inventory_idempotency_fixture))
  ),
  (select jsonb_build_array(flour_quantity, 0, batch_count)
   from inventory_idempotency_post_waste_baseline),
  'missing waste reason leaves inventory, movement, and batch state unchanged'
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'b2222222-2222-4222-8222-222222222222',
    '[{"ingredient_id":"flour","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  '22023',
  'An inventory transaction reason is required',
  'empty waste reason is rejected'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'b2222222-2222-4222-8222-222222222222'),
    (select count(*)::integer from public.ingredient_batches
     where branch_id = (select branch_id from inventory_idempotency_fixture))
  ),
  (select jsonb_build_array(flour_quantity, 0, batch_count)
   from inventory_idempotency_post_waste_baseline),
  'empty waste reason leaves inventory, movement, and batch state unchanged'
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'b3333333-3333-4333-8333-333333333333',
    '[{"ingredient_id":"flour","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":" \t\n ","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  '22023',
  'An inventory transaction reason is required',
  'whitespace-only waste reason is rejected'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'b3333333-3333-4333-8333-333333333333'),
    (select count(*)::integer from public.ingredient_batches
     where branch_id = (select branch_id from inventory_idempotency_fixture))
  ),
  (select jsonb_build_array(flour_quantity, 0, batch_count)
   from inventory_idempotency_post_waste_baseline),
  'whitespace-only waste reason leaves inventory, movement, and batch state unchanged'
);
select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'b4444444-4444-4444-8444-444444444444',
    '[{"ingredient_id":"flour","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Damaged","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  '22023',
  'Waste or spoilage reason must be Waste, Spillage, Spoilage, or Other',
  'unsupported waste reason is rejected'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'b4444444-4444-4444-8444-444444444444'),
    (select count(*)::integer from public.ingredient_batches
     where branch_id = (select branch_id from inventory_idempotency_fixture))
  ),
  (select jsonb_build_array(flour_quantity, 0, batch_count)
   from inventory_idempotency_post_waste_baseline),
  'unsupported waste reason leaves inventory, movement, and batch state unchanged'
);

select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'a4444444-4444-4444-8444-444444444444',
    '[{"ingredient_id":"flour","type":"waste","quantity":999999,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Other","notes":"","batch_reference":null,"expiration_date":null}]'::jsonb
  )$$,
  'P0001',
  'Transaction exceeds available stock',
  'insufficient stock remains rejected by the existing transaction validator'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ),
  (select flour_quantity from inventory_idempotency_post_waste_baseline),
  'insufficient stock leaves expected inventory unchanged'
);
select is(
  jsonb_build_array(
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'a4444444-4444-4444-8444-444444444444'),
    (select count(*)::integer from public.ingredient_batches
     where branch_id = (select branch_id from inventory_idempotency_fixture)),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'a4444444-4444-4444-8444-444444444444'
       and request_payload_hash is not null)
  ),
  jsonb_build_array(
    0,
    (select batch_count from inventory_idempotency_post_waste_baseline),
    0
  ),
  'insufficient stock creates no movement, batch, or completed idempotency metadata'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'a5555555-5555-4555-8555-555555555555',
      '[{"ingredient_id":"flour","type":"stock_in","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Stock-In","notes":"Corrected transaction","batch_reference":null,"expiration_date":null}]'::jsonb
    )
  ),
  1,
  'a corrected new logical transaction succeeds after insufficient stock'
);
select is(
  (
    select quantity
    from public.branch_inventory
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and ingredient_id = 'flour'
  ),
  (select flour_quantity + 1 from inventory_idempotency_post_waste_baseline),
  'the corrected logical transaction applies its inventory increase once'
);

reset role;
create temporary table inventory_idempotency_multiline_baseline on commit drop as
select
  (select quantity from public.branch_inventory
   where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour') as flour_quantity,
  (select quantity from public.branch_inventory
   where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'octopus') as octopus_quantity,
  (select count(*)::integer from public.ingredient_batches
   where branch_id = (select branch_id from inventory_idempotency_fixture)) as batch_count;
grant select on inventory_idempotency_multiline_baseline to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select staff_a_id::text from inventory_idempotency_fixture), true);
select set_config(
  'request.jwt.claims',
  (select jsonb_build_object('sub', staff_a_id::text, 'role', 'authenticated')::text from inventory_idempotency_fixture),
  true
);

select throws_ok(
  $$select * from public.record_inventory_transactions_idempotent(
    (select branch_id from inventory_idempotency_fixture),
    'c1111111-1111-4111-8111-111111111111',
    '[
      {"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Stock-In","notes":"First line","batch_reference":null,"expiration_date":null},
      {"ingredient_id":"octopus","type":"waste","quantity":1,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Waste","notes":"Insufficient second line","batch_reference":null,"expiration_date":null}
    ]'::jsonb
  )$$,
  'P0001',
  'Transaction exceeds available stock',
  'a later insufficient line rejects the complete multi-line transaction'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'octopus'),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'c1111111-1111-4111-8111-111111111111'),
    (select count(*)::integer from public.ingredient_batches
     where branch_id = (select branch_id from inventory_idempotency_fixture))
  ),
  (select jsonb_build_array(flour_quantity, octopus_quantity, 0, batch_count)
   from inventory_idempotency_multiline_baseline),
  'failed multi-line transaction rolls back earlier inventory, movements, metadata, and batches'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'c1111111-1111-4111-8111-111111111111',
      '[
        {"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Stock-In","notes":"Corrected first line","batch_reference":null,"expiration_date":null},
        {"ingredient_id":"octopus","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Stock-In","notes":"Corrected second line","batch_reference":null,"expiration_date":null}
      ]'::jsonb
    )
  ),
  2,
  'the same request UUID can be retried after rollback with a corrected payload'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'octopus')
  ),
  (select jsonb_build_array(flour_quantity + 2, octopus_quantity + 2)
   from inventory_idempotency_multiline_baseline),
  'successful multi-line transaction applies every inventory line once'
);
select is(
  (
    select jsonb_build_array(
      count(*)::integer,
      count(*) filter (where request_payload_hash is not null)::integer,
      count(distinct request_line_index)::integer,
      count(distinct request_payload_hash)::integer,
      array_agg(request_line_index order by request_line_index)
    )
    from public.inventory_movements
    where branch_id = (select branch_id from inventory_idempotency_fixture)
      and actor_id = (select staff_a_id from inventory_idempotency_fixture)
      and request_id = 'c1111111-1111-4111-8111-111111111111'
  ),
  '[2,2,2,1,[1,2]]'::jsonb,
  'each successful multi-line movement has unique request metadata'
);
select is(
  (
    select count(*)::integer
    from public.ingredient_batches batch
    join public.inventory_movements movement on movement.batch_id = batch.id
    where movement.branch_id = (select branch_id from inventory_idempotency_fixture)
      and movement.request_id = 'c1111111-1111-4111-8111-111111111111'
  ),
  2,
  'successful multi-line stock-in creates one batch per line'
);
select is(
  (
    select count(*)::integer
    from public.record_inventory_transactions_idempotent(
      (select branch_id from inventory_idempotency_fixture),
      'c1111111-1111-4111-8111-111111111111',
      '[
        {"ingredient_id":"flour","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Stock-In","notes":"Corrected first line","batch_reference":null,"expiration_date":null},
        {"ingredient_id":"octopus","type":"stock_in","quantity":2,"unit":"kg","transaction_date":"2026-11-13T00:00:00+08:00","reason":"Stock-In","notes":"Corrected second line","batch_reference":null,"expiration_date":null}
      ]'::jsonb
    )
  ),
  2,
  'multi-line replay returns both original movements'
);
select is(
  jsonb_build_array(
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'flour'),
    (select quantity from public.branch_inventory
     where branch_id = (select branch_id from inventory_idempotency_fixture) and ingredient_id = 'octopus'),
    (select count(*)::integer from public.inventory_movements
     where branch_id = (select branch_id from inventory_idempotency_fixture)
       and request_id = 'c1111111-1111-4111-8111-111111111111'),
    (select count(*)::integer from public.ingredient_batches batch
     join public.inventory_movements movement on movement.batch_id = batch.id
     where movement.branch_id = (select branch_id from inventory_idempotency_fixture)
       and movement.request_id = 'c1111111-1111-4111-8111-111111111111')
  ),
  (
    select jsonb_build_array(flour_quantity + 2, octopus_quantity + 2, 2, 2)
    from inventory_idempotency_multiline_baseline
  ),
  'multi-line replay changes neither inventory nor movement and batch counts'
);

reset role;
select * from finish();
rollback;
