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

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('92000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date) values
  (
    '92000000-0000-4000-8000-000000000002',
    '90000000-0000-4000-8000-000000000002',
    (clock_timestamp() at time zone 'Asia/Manila')::date
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"92000000-0000-4000-8000-000000000002"}', true);

select extensions.throws_ok(
  $$select public.submit_sale(
    'TEST-PAYLOAD-NULL-ITEMS', '00000000-0000-4000-8000-000000000001',
    'Cash', 0, null::jsonb, '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'At least one sale item is required'::text,
  'submit_sale rejects SQL NULL items before creating a sale'::text
);

select extensions.throws_ok(
  $$select public.submit_sale(
    'TEST-PAYLOAD-EMPTY-ITEMS', '00000000-0000-4000-8000-000000000001',
    'Cash', 0, '[]'::jsonb, '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'At least one sale item is required'::text,
  'submit_sale rejects empty items before creating a sale'::text
);

select extensions.throws_ok(
  $$select public.submit_sale(
    'TEST-PAYLOAD-OBJECT-ITEMS', '00000000-0000-4000-8000-000000000001',
    'Cash', 0, '{}'::jsonb, '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'At least one sale item is required'::text,
  'submit_sale rejects non-array items before creating a sale'::text
);

reset role;

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    null::jsonb, '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Sale items must be a non-empty array'::text,
  'SQL NULL items are rejected explicitly'::text
);

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[]'::jsonb, '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Sale items must be a non-empty array'::text,
  'an empty items array is rejected'::text
);

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '{}'::jsonb, '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Sale items must be a non-empty array'::text,
  'non-array item payloads are rejected'::text
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

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '{}'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Sale add-ons must be an array'::text,
  'non-array add-ons are rejected'::text
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

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":null,"unit_price":10}]'::jsonb,
    '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Each sale item requires a variant, quantity, and price'::text,
  'NULL item quantities are rejected'::text
);

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":null}]'::jsonb,
    '[]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Each sale item requires a variant, quantity, and price'::text,
  'NULL item prices are rejected'::text
);

select extensions.throws_ok(
  $$select public.compute_sale_payload_hash(
    '00000000-0000-4000-8000-000000000001', 'Cash', 10,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":10}]'::jsonb,
    '[{"addon_id":"30000000-0000-4000-8000-000000000001","quantity":1,"unit_price":null}]'::jsonb
  )$$::text,
  'P0001'::character(5),
  'Each add-on requires an add-on ID, quantity, and price'::text,
  'NULL add-on prices are rejected'::text
);

select ok(
  not exists (select 1 from public.sales where transaction_reference like 'TEST-PAYLOAD-%'),
  'hash and validation regression coverage leaves no sales behind'
);

select * from finish();
rollback;
