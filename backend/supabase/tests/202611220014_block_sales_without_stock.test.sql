-- Decision #11 / ST-02 c6, c9, c10: sales the branch stock cannot make are refused.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(9);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('a5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'stock-block-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Stock Block Staff"}'::jsonb);
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900701',
  branch_id = '00000000-0000-4000-8000-000000000001', active = true, must_change_password = false
where id = 'a5000000-0000-4000-8000-000000000001';
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('a5100000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', now(), now());
insert into public.business_day_sessions (session_id, user_id, business_date)
values ('a5100000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001',
  (clock_timestamp() at time zone 'Asia/Manila')::date);

-- Branch 1 starts with no prepared batter.
update public.branch_inventory set quantity = 0
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'prepared-batter';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a5000000-0000-4000-8000-000000000001',
  'role', 'authenticated', 'session_id', 'a5100000-0000-4000-8000-000000000001')::text, true);

-- Requirements --------------------------------------------------------------------------
create temporary table req on commit drop as
select public.sale_stock_requirements('00000000-0000-4000-8000-000000000001') as body;
select ok((select jsonb_array_length(body -> 'requirements') > 0 from req), 'the POS gets per-unit ingredient needs');
select ok((select (r ->> 'per_unit')::numeric > 0 from req, jsonb_array_elements(body -> 'requirements') r
  where r ->> 'variant_id' = '20000000-0000-4000-8000-000000000001' and r ->> 'ingredient_id' = 'prepared-batter'),
  'a 4-piece variant needs prepared batter');
select is((select (body -> 'stock' ->> 'prepared-batter')::numeric from req), 0::numeric, 'the branch stock is included');
select throws_ok($$select public.sale_stock_requirements('00000000-0000-4000-8000-000000000002')$$,
  '42501', 'Branch access denied', 'staff cannot read another branch''s stock needs');

-- A sale the stock cannot make is refused and nothing is saved ---------------------------
select throws_like(
  $$select public.submit_sale('STOCK-BLOCK-1', '00000000-0000-4000-8000-000000000001', 'Cash', 49,
    '[{"variant_id":"20000000-0000-4000-8000-000000000001","quantity":1,"unit_price":49}]'::jsonb, '[]'::jsonb)$$,
  'Order changed: Insufficient stock for Prepared Takoyaki Batter%',
  'ST-02 c10: a sale without enough stock is refused with "Order changed"');
reset role;
select is((select count(*)::int from public.sales where transaction_reference = 'STOCK-BLOCK-1'), 0,
  'ST-02 c9: nothing is saved for the refused sale');

-- With stock, the same reference succeeds and consumption is recorded --------------------
update public.branch_inventory set quantity = 5
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'prepared-batter';
set local role authenticated;
select lives_ok(
  $$select public.submit_sale('STOCK-BLOCK-1', '00000000-0000-4000-8000-000000000001', 'Cash', 49,
    '[{"variant_id":"20000000-0000-4000-8000-000000000001","quantity":1,"unit_price":49}]'::jsonb, '[]'::jsonb)$$,
  'the same reference can be retried once stock is available');
reset role;
select is((select inventory_processing_status from public.sales where transaction_reference = 'STOCK-BLOCK-1'), 'completed',
  'ST-02 c9: the sale and its consumption are saved together');

select ok(exists (select 1 from public.api_endpoint_permissions where endpoint = 'rpc/sale_stock_requirements'),
  'the new RPC is declared to the API gate');

select * from finish();
rollback;
