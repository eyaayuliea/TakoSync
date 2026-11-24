-- OW-04 c9 / OW-13 c4 with OW-28 c5: after an opening entry the balance equals the ledger sum,
-- also for stock that existed before the ledger.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(5);

create temporary table recon_fixture on commit drop as
select '94000000-0000-4000-8000-000000000001'::uuid as owner_id, '95000000-0000-4000-8000-000000000001'::uuid as session_id,
  '00000000-0000-4000-8000-000000000002'::uuid as branch_id;
grant select on recon_fixture to authenticated;
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select owner_id, 'authenticated', 'authenticated', 'recon-owner@test.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Recon Owner"}'::jsonb from recon_fixture;
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false where id = (select owner_id from recon_fixture);
insert into auth.sessions (id, user_id, created_at, updated_at) select session_id, owner_id, now(), now() from recon_fixture;
delete from public.business_go_live;
delete from public.opening_stock_entries where branch_id = (select branch_id from recon_fixture);

-- Balances that exist without any ledger movement (as seeded before the ledger).
delete from public.inventory_movements where branch_id = (select branch_id from recon_fixture) and ingredient_id in ('salt', 'flour', 'eggs');
update public.branch_inventory set quantity = 7 where branch_id = (select branch_id from recon_fixture) and ingredient_id in ('salt', 'flour', 'eggs');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from recon_fixture), 'role', 'authenticated', 'session_id', (select session_id from recon_fixture))::text, true);
select lives_ok(format($$ select public.record_opening_stock(%L, 'salt', 20) $$, (select branch_id from recon_fixture)), 'higher than the unrecorded balance');
select lives_ok(format($$ select public.record_opening_stock(%L, 'flour', 3) $$, (select branch_id from recon_fixture)), 'lower than the unrecorded balance');
select lives_ok(format($$ select public.record_opening_stock(%L, 'eggs', 7) $$, (select branch_id from recon_fixture)), 'equal to the unrecorded balance');
reset role;

select is((select string_agg(bi.ingredient_id || '=' || trim_scale(bi.quantity) || '/' || trim_scale(coalesce((select sum(m.movement) from public.inventory_movements m
    where m.branch_id = bi.branch_id and m.ingredient_id = bi.ingredient_id), 0)), ',' order by bi.ingredient_id)
  from public.branch_inventory bi where bi.branch_id = (select branch_id from recon_fixture) and bi.ingredient_id in ('salt', 'flour', 'eggs')),
  'eggs=7/7,flour=3/3,salt=20/20', 'balance = entered opening stock = sum of the ledger for each item');
select is((select count(*)::int from public.inventory_movements where branch_id = (select branch_id from recon_fixture)
  and reason = 'Opening stock (balance recorded before the ledger)'), 3, 'each unrecorded balance is recorded once, before the opening movement');

select * from finish();
rollback;
