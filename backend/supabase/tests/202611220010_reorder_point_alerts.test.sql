-- A2 / US-ROP-05: dynamic reorder point with safety stock, and low-stock alerts.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a2000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rop-owner@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"ROP Owner"}'::jsonb),
  ('a2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rop-staff@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"ROP Staff"}'::jsonb);
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = 'a2000000-0000-4000-8000-000000000001';
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900301',
  branch_id = '00000000-0000-4000-8000-000000000001', active = true, must_change_password = false
where id = 'a2000000-0000-4000-8000-000000000002';
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('a2c00000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', now(), now()),
  ('a2c00000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', now(), now());

select ok(not has_function_privilege('authenticated', 'private.compute_reorder_point(uuid,text,date)', 'execute'),
  'the ROP calculation is internal');
select ok(not has_table_privilege('authenticated', 'public.inventory_stock_alerts', 'insert'),
  'alerts are written only by the database');

-- Start from no alerts for the items under test (seed data may already have opened some).
delete from public.inventory_stock_alerts where ingredient_id = 'flour';

-- Branch 1 flour history. Sales on 16 past Manila days make 16 operating days;
-- the window keeps the latest 14. Daily usage alternates 1.0 and 1.5 kg (mean 1.25).
-- The two oldest days use 50 kg and fall outside the window.
create temporary table rop_days on commit drop as
select n, (now() at time zone 'Asia/Manila')::date - n as day,
  case when n > 14 then 50 when n % 2 = 0 then 1.0 else 1.5 end::numeric as used
from generate_series(1, 16) n;

insert into public.sales (transaction_reference, branch_id, staff_id, total_amount, payment_method, status, created_at)
select 'ROP-SALE-' || n, '00000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002',
  100, 'QR', 'completed', (day + time '12:00') at time zone 'Asia/Manila'
from rop_days;

insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type, quantity, unit,
  movement, before_quantity, after_quantity, transaction_date, created_at)
select 'ROP-USE-' || n, '00000000-0000-4000-8000-000000000001', 'flour', 'a2000000-0000-4000-8000-000000000002',
  'usage'::public.inventory_transaction_type, used, 'kg', -used, 100, 100 - used,
  (day + time '13:00') at time zone 'Asia/Manila', (day + time '13:00') at time zone 'Asia/Manila'
from rop_days;

-- Excluded from usage: waste on an operating day, usage on a day with no sale, and today.
insert into public.inventory_movements (reference, branch_id, ingredient_id, actor_id, type, quantity, unit,
  movement, before_quantity, after_quantity, transaction_date, created_at)
values
  ('ROP-WASTE', '00000000-0000-4000-8000-000000000001', 'flour', 'a2000000-0000-4000-8000-000000000002',
   'waste', 20, 'kg', -20, 100, 80, now() - interval '1 day', now() - interval '1 day'),
  ('ROP-NO-SALE-DAY', '00000000-0000-4000-8000-000000000001', 'flour', 'a2000000-0000-4000-8000-000000000002',
   'usage', 30, 'kg', -30, 100, 70,
   (((now() at time zone 'Asia/Manila')::date - 40) + time '12:00') at time zone 'Asia/Manila',
   (((now() at time zone 'Asia/Manila')::date - 40) + time '12:00') at time zone 'Asia/Manila'),
  ('ROP-TODAY', '00000000-0000-4000-8000-000000000001', 'flour', 'a2000000-0000-4000-8000-000000000002',
   'usage', 40, 'kg', -40, 100, 60, now(), now());

-- Owner: minimum 2 kg; supplier lead time 2 days (the spec's flour illustration).
update public.branch_inventory set minimum_stock = 2, quantity = 10
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
update public.ingredient_replenishment_settings set lead_time_days = 2, shelf_life_days = null where ingredient_id = 'flour';

select results_eq(
  $$select method, operating_days_used, average_daily_usage from public.inventory_reorder_points
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'$$,
  $$values ('DYNAMIC_ROP'::text, 14, 1.2500::numeric(14, 4))$$,
  'AC-ROP-05-01: d̄ uses the last 14 operating days, sales and preparation usage only');

select is(
  (select usage_stddev from public.inventory_reorder_points
   where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  (select round(stddev_samp(used), 4)::numeric(14, 4) from rop_days where n <= 14),
  'AC-ROP-05-01: σd is the sample standard deviation');

select is(
  (select safety_stock from public.inventory_reorder_points
   where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  (select round(1.645 * stddev_samp(used) * sqrt(2::numeric), 3)::numeric(14, 3) from rop_days where n <= 14),
  'AC-ROP-05-01: SS = z × σd × √L');

select is(
  (select effective_rop from public.inventory_reorder_points
   where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  (select round(1.25 * 2 + 1.645 * stddev_samp(used) * sqrt(2::numeric), 3)::numeric(14, 3) from rop_days where n <= 14),
  'AC-ROP-05-01: ROP = d̄ × L + SS, above the 2 kg owner minimum');

select is(
  (select threshold_source from public.inventory_reorder_points
   where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'),
  'DYNAMIC_ROP', 'the alert states that the dynamic ROP is the trigger');

-- Alerts -------------------------------------------------------------------------
select is((select count(*)::int from public.inventory_stock_alerts
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour' and status = 'open'), 0,
  '10 kg is above the reorder point: no alert');

update public.branch_inventory set quantity = 2.9
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
select results_eq(
  $$select severity, expected_stock from public.inventory_stock_alerts
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour' and status = 'open'$$,
  $$values ('LOW_STOCK'::text, 2.900::numeric(12, 3))$$,
  'AC-ROP-05-04: 2.9 kg ≤ ROP opens a LOW_STOCK alert (the spec example)');

update public.branch_inventory set quantity = 0.5
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
select results_eq(
  $$select severity, expected_stock from public.inventory_stock_alerts
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour' and status = 'open'$$,
  $$values ('CRITICAL'::text, 0.500::numeric(12, 3))$$,
  'AC-ROP-05-04: at or below the safety stock the alert becomes CRITICAL');
select is((select count(*)::int from public.inventory_stock_alerts
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'), 1,
  'AC-ROP-05-04: the alert is updated, not duplicated');

update public.branch_inventory set quantity = 5
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
select is((select status from public.inventory_stock_alerts
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'), 'resolved',
  'AC-ROP-05-04: the alert resolves when stock rises above the reorder point');

update public.branch_inventory set quantity = 3
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour';
select results_eq(
  $$select status, count(*)::int from public.inventory_stock_alerts
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour' group by 1 order by 1$$,
  $$values ('open'::text, 1), ('resolved', 1)$$,
  'a later shortage opens a new alert and keeps the resolved one as history');

-- Shelf-life guard (AC-ROP-05-07) ----------------------------------------------------
update public.ingredient_replenishment_settings set shelf_life_days = 1 where ingredient_id = 'flour';
select results_eq(
  $$select reorder_point, effective_rop, config_inconsistent, threshold_source from public.inventory_reorder_points
    where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour'$$,
  $$values (1.250::numeric(14, 3), 2.000::numeric(14, 3), true, 'OWNER_MINIMUM'::text)$$,
  'AC-ROP-05-07: ROP is capped at d̄ × shelf life, shelf life < lead time is flagged, and the owner minimum floor applies');
select is((select status from public.inventory_stock_alerts
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'flour' order by opened_at desc limit 1),
  'resolved', 'changing a setting re-checks stock at once (3 kg is now above 2 kg)');

select ok((select count(*) >= 2 from public.audit_logs where action = 'replenishment.settings_updated'
  and description like 'flour:%'), 'AC-ROP-05-02: every settings change is audited');
select ok(exists (select 1 from public.audit_logs where action = 'replenishment.minimum_stock_updated'
  and description like 'flour minimum stock%'), 'AC-ROP-05-02: owner minimum changes are audited');

-- Cold start and in-house items ------------------------------------------------------
update public.branch_inventory set minimum_stock = 4, quantity = 3.5
where branch_id = '00000000-0000-4000-8000-000000000002' and ingredient_id = 'flour';
select results_eq(
  $$select method, method_reason, effective_rop from public.inventory_reorder_points
    where branch_id = '00000000-0000-4000-8000-000000000002' and ingredient_id = 'flour'$$,
  $$values ('OWNER_MINIMUM'::text, 'COLD_START'::text, 4.000::numeric(14, 3))$$,
  'AC-ROP-05-03: with under 7 operating days the owner minimum is used');
select results_eq(
  $$select severity, threshold_source, method_reason from public.inventory_stock_alerts
    where branch_id = '00000000-0000-4000-8000-000000000002' and ingredient_id = 'flour' and status = 'open'$$,
  $$values ('LOW_STOCK'::text, 'OWNER_MINIMUM'::text, 'COLD_START'::text)$$,
  'AC-ROP-05-03: the alert states that the owner minimum was used (cold start)');
select is((select method_reason from public.inventory_reorder_points
  where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'prepared-batter'),
  'IN_HOUSE_ITEM', 'prepared batter keeps the owner minimum');

select ok(to_regclass('public.purchase_orders') is null and not exists (
  select 1 from information_schema.tables where table_schema = 'public' and table_name ilike '%purchase%'),
  'AC-ROP-05-06: advisory only, there are no purchase orders');

-- Apps -------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-4000-8000-000000000002',
  'role', 'authenticated', 'session_id', 'a2c00000-0000-4000-8000-000000000002')::text, true);

select ok((select count(*) > 0 from public.refresh_reorder_points('00000000-0000-4000-8000-000000000001')),
  'AC-ROP-05-05: staff get their branch''s reorder points');
select throws_ok($$select * from public.refresh_reorder_points('00000000-0000-4000-8000-000000000002')$$,
  '42501', 'Branch access denied', 'staff cannot load another branch');
select is((select count(*)::int from public.inventory_stock_alerts
  where branch_id = '00000000-0000-4000-8000-000000000002'), 0,
  'AC-ROP-05-05: staff see only their own branch''s alerts');
update public.ingredient_replenishment_settings set lead_time_days = 9 where ingredient_id = 'flour';
reset role;
select is((select lead_time_days from public.ingredient_replenishment_settings where ingredient_id = 'flour'),
  2.00::numeric(5, 2), 'staff cannot change replenishment settings');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a2000000-0000-4000-8000-000000000001',
  'role', 'authenticated', 'session_id', 'a2c00000-0000-4000-8000-000000000001')::text, true);
select is((select count(distinct branch_id)::int from public.refresh_reorder_points()),
  (select count(distinct bi.branch_id)::int from public.branch_inventory bi join public.branches b on b.id = bi.branch_id where b.active),
  'AC-ROP-05-05: the owner gets every branch');
reset role;

select * from finish();
rollback;
