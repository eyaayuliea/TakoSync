begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '90000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'sale-payload-test@takosync.invalid', '', now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Sale Payload Test"}'
);

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '90000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.submit_sale(
    'TEST-PAYLOAD-NULL-ITEMS', '00000000-0000-4000-8000-000000000001',
    'Cash', 0, null::jsonb, '[]'::jsonb
  )$$,
  'P0001',
  'At least one sale item is required',
  'submit_sale rejects SQL NULL items before creating a sale'
);

select throws_ok(
  $$select public.submit_sale(
    'TEST-PAYLOAD-EMPTY-ITEMS', '00000000-0000-4000-8000-000000000001',
    'Cash', 0, '[]'::jsonb, '[]'::jsonb
  )$$,
  'P0001',
  'At least one sale item is required',
  'submit_sale rejects empty items before creating a sale'
);

select throws_ok(
  $$select public.submit_sale(
    'TEST-PAYLOAD-OBJECT-ITEMS', '00000000-0000-4000-8000-000000000001',
    'Cash', 0, '{}'::jsonb, '[]'::jsonb
  )$$,
  'P0001',
  'At least one sale item is required',
  'submit_sale rejects non-array items before creating a sale'
);

reset role;

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    null::jsonb, '[]'::jsonb
  )$$,
  'P0001',
  'Sale items must be a non-empty array',
  'SQL NULL items are rejected explicitly'
);

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[]'::jsonb, '[]'::jsonb
  )$$,
  'P0001',
  'Sale items must be a non-empty array',
  'an empty items array is rejected'
);

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '{}'::jsonb, '[]'::jsonb
  )$$,
  'P0001',
  'Sale items must be a non-empty array',
  'non-array item payloads are rejected'
);

select is(
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    null::jsonb
  ),
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  ),
  'SQL NULL add-ons normalize to the optional empty-array contract'
);

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '{}'::jsonb
  )$$,
  'P0001',
  'Sale add-ons must be an array',
  'non-array add-ons are rejected'
);

select is(
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  ),
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'cash', 10.00,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1.000,"unit_price":10.00}]'::jsonb,
    '[]'::jsonb
  ),
  'integer and three-decimal equivalent item quantities hash identically'
);

select is(
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 30,
    '[{"variant_id":"10000000-0000-4000-8000-000000000002","quantity":1,"unit_price":20},{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  ),
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 30,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1.000,"unit_price":10.00},{"variant_id":"10000000-0000-4000-8000-000000000002","quantity":1.000,"unit_price":20.00}]'::jsonb,
    '[]'::jsonb
  ),
  'item ordering and numeric formatting do not change the canonical hash'
);

select is(
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 30,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[{"addon_id":"30000000-0000-4000-8000-000000000002","quantity":1,"unit_price":20},{"addon_id":"30000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb
  ),
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 30,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1.000,"unit_price":10.00}]'::jsonb,
    '[{"addon_id":"30000000-0000-4000-8000-000000000001","quantity":1.000,"unit_price":10.00},{"addon_id":"30000000-0000-4000-8000-000000000002","quantity":1.000,"unit_price":20.00}]'::jsonb
  ),
  'add-on ordering and numeric formatting do not change the canonical hash'
);

select isnt(
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  ),
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 20,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":2,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  ),
  'different totals and quantities remain different payloads'
);

select isnt(
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  ),
  public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 11,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":11}]'::jsonb,
    '[]'::jsonb
  ),
  'different prices remain different payloads'
);

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":null,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  )$$,
  'P0001',
  'Each sale item requires a variant, quantity, and price',
  'NULL item quantities are rejected'
);

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":null}]'::jsonb,
    '[]'::jsonb
  )$$,
  'P0001',
  'Each sale item requires a variant, quantity, and price',
  'NULL item prices are rejected'
);

select throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[{"addon_id":"30000000-0000-4000-8000-000000000001","quantity":1,"unit_price":null}]'::jsonb
  )$$,
  'P0001',
  'Each add-on requires an add-on ID, quantity, and price',
  'NULL add-on prices are rejected'
);

select ok(
  not exists (select 1 from public.sales where transaction_reference like 'TEST-PAYLOAD-%'),
  'hash and validation regression coverage leaves no sales behind'
);

select * from finish();
rollback;
