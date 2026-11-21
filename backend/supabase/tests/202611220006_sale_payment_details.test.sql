-- ST-05 c5 / ST-02 c8: cash received and change are saved with the sale.
-- Payment rules are checked before submit_sale runs, so no sale is created.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

select ok(has_function_privilege('authenticated',
  'public.submit_sale_with_payment(text,uuid,text,numeric,jsonb,jsonb,numeric)', 'execute'),
  'signed-in staff can record a sale with payment details');

select throws_ok(
  $$select public.submit_sale_with_payment('PAY-1', '00000000-0000-4000-8000-000000000001', 'Cash', 25,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":25}]'::jsonb, '[]'::jsonb, null)$$,
  'P0001', 'Enter the cash received.', 'a cash sale needs the cash received');

select throws_ok(
  $$select public.submit_sale_with_payment('PAY-2', '00000000-0000-4000-8000-000000000001', 'Cash', 25,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":25}]'::jsonb, '[]'::jsonb, 20)$$,
  'P0001', 'Cash received is less than the total.', 'cash below the total is refused');

select throws_ok(
  $$select public.submit_sale_with_payment('PAY-3', '00000000-0000-4000-8000-000000000001', 'QR', 25,
    '[{"variant_id":"10000000-0000-4000-8000-000000000001","quantity":1,"unit_price":25}]'::jsonb, '[]'::jsonb, 50)$$,
  'P0001', 'Cash received applies only to cash payments.', 'cash received is only for cash payments');

select is((select count(*)::int from public.sales where transaction_reference like 'PAY-%'), 0,
  'refused payments create no sale');

-- The saved details must add up, whoever writes them.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values ('81000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pay-staff@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Pay Staff"}'::jsonb);

select throws_ok(
  $$insert into public.sales (transaction_reference, branch_id, staff_id, total_amount, payment_method, status,
    cash_received, change_amount)
    values ('PAY-BAD-CHANGE', '00000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
    25, 'Cash', 'completed', 50, 20)$$,
  '23514', null, 'change must equal cash received minus the total');

select lives_ok(
  $$insert into public.sales (transaction_reference, branch_id, staff_id, total_amount, payment_method, status,
    cash_received, change_amount, served_by_name)
    values ('PAY-GOOD', '00000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
    25, 'Cash', 'completed', 50, 25, 'Pay Staff')$$,
  'a consistent cash payment is accepted');

select * from finish();
rollback;
