-- S3 / US-AUDIT-02: SHA-256 hash-chained, append-only audit log.
begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(29);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a3000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'audit-owner@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Audit Owner"}'::jsonb),
  ('a3000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'audit-staff@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Audit Staff"}'::jsonb);
update public.profiles set role = 'owner', branch_id = null, employee_id = null, active = true, must_change_password = false
where id = 'a3000000-0000-4000-8000-000000000001';
update public.profiles set role = 'staff', employee_id = 'EMP-2026-900401',
  branch_id = '00000000-0000-4000-8000-000000000001', active = true, must_change_password = false
where id = 'a3000000-0000-4000-8000-000000000002';
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('a3c00000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', now(), now()),
  ('a3c00000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000002', now(), now());

-- Canonical form and hash (AC-AUDIT-02-01/02/03) -------------------------------------
select is(
  private.audit_canonical('00000000-0000-4000-8000-0000000000a1', 'global', 1, 'test.action', null, null,
    E'Hello "Tako" ñ\n', '2026-11-22 10:00:00.123456+08'),
  '{"action":"test.action","actor_id":null,"branch_id":null,"chain_scope":"global","description":"Hello \"Tako\" ñ\n","event_id":"00000000-0000-4000-8000-0000000000a1","event_timestamp":"2026-11-22T02:00:00.123456Z","sequence_number":1}',
  'AC-AUDIT-02-01: canonical JSON has sorted keys, UTF-8 text, a UTC ISO-8601 time, and JSON null');
select is(
  private.audit_event_hash(repeat('0', 64), private.audit_canonical('00000000-0000-4000-8000-0000000000a1', 'global', 1,
    'test.action', null, null, E'Hello "Tako" ñ\n', '2026-11-22 10:00:00.123456+08')),
  'e06f0b3b2a97d69093354e11e702c7ea987cfadf9359a764e90b50cc8297cfcf',
  'AC-AUDIT-02-02: SHA-256(previous || canonical) matches an independently computed digest');

-- Appending ------------------------------------------------------------------------
create temporary table audit_before on commit drop as
select chain_scope, last_sequence, last_hash from private.audit_chain_heads;

update public.branch_inventory set minimum_stock = minimum_stock + 1
where branch_id = '00000000-0000-4000-8000-000000000001' and ingredient_id = 'eggs';
insert into public.audit_logs (user_id, branch_id, action, description)
values ('a3000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'test.secret',
  'login password=hunter2 token: abc123 header Bearer abc.def jwt eyJhbGc.eyJzdWI.sig mail me@example.com done');

create temporary table audit_new on commit drop as
select * from public.audit_logs
where chain_scope = '00000000-0000-4000-8000-000000000001'
  and sequence_number > coalesce((select last_sequence from audit_before where chain_scope = '00000000-0000-4000-8000-000000000001'), 0)
order by sequence_number;

select is((select count(*)::int from audit_new), 2, 'two new events were appended to the branch chain');
select is((select min(sequence_number) from audit_new),
  coalesce((select last_sequence from audit_before where chain_scope = '00000000-0000-4000-8000-000000000001'), 0) + 1,
  'the sequence continues from the chain head');
select is((select previous_hash from audit_new order by sequence_number limit 1),
  coalesce((select last_hash from audit_before where chain_scope = '00000000-0000-4000-8000-000000000001'), repeat('0', 64)),
  'AC-AUDIT-02-03: the first new event links to the previous chain head');
select is((select previous_hash from audit_new order by sequence_number desc limit 1),
  (select event_hash from audit_new order by sequence_number limit 1),
  'AC-AUDIT-02-03: each event links to the one before it');
select is(
  (select event_hash from audit_new order by sequence_number desc limit 1),
  (select encode(digest(convert_to(previous_hash || private.audit_canonical(id, chain_scope, sequence_number, action,
     user_id, branch_id, description, created_at), 'UTF8'), 'sha256'), 'hex') from audit_new order by sequence_number desc limit 1),
  'AC-AUDIT-02-02: the stored hash is SHA-256 of the previous hash and the canonical event');
select is((select last_hash from private.audit_chain_heads where chain_scope = '00000000-0000-4000-8000-000000000001'),
  (select event_hash from audit_new order by sequence_number desc limit 1),
  'AC-AUDIT-02-05: the chain head moves in the same transaction');
select ok((select bool_and(previous_hash = repeat('0', 64)) from public.audit_logs where sequence_number = 1),
  'AC-AUDIT-02-03: every chain starts from the all-zero genesis hash');
select ok((select count(*) = count(distinct chain_scope) from private.audit_chain_heads)
  and exists (select 1 from private.audit_chain_heads where chain_scope = 'global'),
  'one chain per branch plus a global chain');

select is((select description from audit_new where action = 'test.secret'),
  'login password=[REDACTED] token: [REDACTED] header Bearer [REDACTED] jwt [REDACTED TOKEN] mail [REDACTED EMAIL] done',
  'AC-AUDIT-02-08: passwords, tokens, auth headers and emails are scrubbed before hashing');

-- More events ------------------------------------------------------------------------
insert into public.sales (transaction_reference, branch_id, staff_id, total_amount, payment_method, status)
values ('AUDIT-SALE-1', '00000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', 50, 'QR', 'completed');
select ok(exists (select 1 from public.audit_logs where action = 'sale.recorded' and description like 'Sale AUDIT-SALE-1 %'),
  'sales are logged');
update public.owner_inventory_settings set near_expiration_days = near_expiration_days where id;
select ok(exists (select 1 from public.audit_logs where action = 'settings.inventory_updated'),
  'configuration changes are logged');

-- Append-only (AC-AUDIT-02-04) --------------------------------------------------------
select throws_ok($$update public.audit_logs set description = 'edited' where action = 'test.secret'$$,
  '42501', 'Audit events are append-only and cannot be changed or deleted', 'events cannot be updated, even by the database owner');
select throws_ok($$delete from public.audit_logs where action = 'test.secret'$$,
  '42501', 'Audit events are append-only and cannot be changed or deleted', 'events cannot be deleted');
select throws_ok($$truncate public.audit_logs$$,
  '42501', 'Audit events are append-only and cannot be changed or deleted', 'the log cannot be truncated');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'insert')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'update')
  and not has_table_privilege('service_role', 'public.audit_logs', 'delete'),
  'apps and the service role have no write access to events');

-- Verification (AC-AUDIT-02-06/07) ------------------------------------------------------
select is(public.verify_audit_chain() ->> 'status', 'VALID', 'AC-AUDIT-02-06: the untouched chains verify');

-- Tampering needs trigger bypass (session_replication_role), i.e. full database control.
savepoint tamper;
set local session_replication_role = replica;
update public.audit_logs set description = 'login was fine' where action = 'test.secret';
set local session_replication_role = origin;
select results_eq(
  $$select c ->> 'status', c ->> 'reason', (c ->> 'first_invalid_sequence')::bigint
    from jsonb_array_elements(public.verify_audit_chain('00000000-0000-4000-8000-000000000001') -> 'chains') c$$,
  format($$values ('INVALID'::text, 'EVENT_HASH_MISMATCH'::text, %s::bigint)$$,
    (select sequence_number from audit_new where action = 'test.secret')),
  'AC-AUDIT-02-07: an edited event is found at its exact position');
rollback to savepoint tamper;

savepoint tamper;
set local session_replication_role = replica;
delete from public.audit_logs where id = (select id from audit_new order by sequence_number limit 1);
set local session_replication_role = origin;
select is(public.verify_audit_chain('00000000-0000-4000-8000-000000000001') -> 'chains' -> 0 ->> 'reason',
  'SEQUENCE_GAP', 'AC-AUDIT-02-07: a deleted event leaves a sequence gap');
rollback to savepoint tamper;

savepoint tamper;
set local session_replication_role = replica;
delete from public.audit_logs where chain_scope = '00000000-0000-4000-8000-000000000001'
  and sequence_number = (select max(sequence_number) from public.audit_logs where chain_scope = '00000000-0000-4000-8000-000000000001');
set local session_replication_role = origin;
select is(public.verify_audit_chain('00000000-0000-4000-8000-000000000001') -> 'chains' -> 0 ->> 'reason',
  'HEAD_MISMATCH', 'deleting the newest event is caught by the chain head');
rollback to savepoint tamper;

savepoint tamper;
set local session_replication_role = replica;
update public.audit_logs set sequence_number = -sequence_number where id in (select id from audit_new);
update public.audit_logs set sequence_number = case
  when id = (select id from audit_new order by sequence_number limit 1) then (select max(sequence_number) from audit_new)
  else (select min(sequence_number) from audit_new) end
where id in (select id from audit_new);
set local session_replication_role = origin;
select is(public.verify_audit_chain('00000000-0000-4000-8000-000000000001') -> 'chains' -> 0 ->> 'status',
  'INVALID', 'reordering two events is detected');
rollback to savepoint tamper;

-- Checkpoints (AC-AUDIT-02-11) ------------------------------------------------------------
create temporary table audit_checkpoint on commit drop as select * from public.create_audit_checkpoint();
select is((select count(*)::int from audit_checkpoint), (select count(*)::int from private.audit_chain_heads),
  'a checkpoint records the head of every chain');
insert into public.audit_logs (user_id, branch_id, action, description)
values (null, '00000000-0000-4000-8000-000000000001', 'test.after_checkpoint', 'after');
select results_eq(
  $$select c ->> 'status', (c ->> 'verified_event_count')::int
    from jsonb_array_elements(public.verify_audit_chain('00000000-0000-4000-8000-000000000001', 0, null, null, true) -> 'chains') c$$,
  $$values ('VALID'::text, 1)$$,
  'verification can start from the last checkpoint and checks only newer events');

-- Rewriting the whole chain is invisible inside the database but not against an exported checkpoint.
savepoint tamper;
set local session_replication_role = replica;
do $$
declare
  v_row record;
  v_prev text := repeat('0', 64);
begin
  update public.audit_logs set description = 'rewritten' where action = 'test.secret';
  for v_row in select * from public.audit_logs where chain_scope = '00000000-0000-4000-8000-000000000001' order by sequence_number loop
    update public.audit_logs set previous_hash = v_prev,
      event_hash = private.audit_event_hash(v_prev, private.audit_canonical(v_row.id, v_row.chain_scope, v_row.sequence_number,
        v_row.action, v_row.user_id, v_row.branch_id, v_row.description, v_row.created_at))
    where id = v_row.id returning event_hash into v_prev;
  end loop;
  update private.audit_chain_heads set last_hash = v_prev where chain_scope = '00000000-0000-4000-8000-000000000001';
end;
$$;
set local session_replication_role = origin;
select is(public.verify_audit_chain('00000000-0000-4000-8000-000000000001') ->> 'status', 'VALID',
  'known limit: a full rewrite with database control verifies internally');
select isnt(
  public.verify_audit_chain('00000000-0000-4000-8000-000000000001', 0, null,
    (select sequence_number from audit_checkpoint where chain_scope = '00000000-0000-4000-8000-000000000001')) -> 'chains' -> 0 ->> 'final_hash',
  (select event_hash from audit_checkpoint where chain_scope = '00000000-0000-4000-8000-000000000001'),
  'AC-AUDIT-02-11: the exported checkpoint hash exposes the rewrite');
rollback to savepoint tamper;

-- Access (AC-AUDIT-02-09) ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a3000000-0000-4000-8000-000000000002',
  'role', 'authenticated', 'session_id', 'a3c00000-0000-4000-8000-000000000002')::text, true);
select throws_ok($$select public.verify_audit_chain()$$, '42501',
  'Only the owner can view or verify the audit chain', 'AC-AUDIT-02-09: staff cannot verify the chain');
select is((select count(*)::int from public.audit_logs), 0, 'AC-AUDIT-02-09: staff cannot read audit events');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', json_build_object('sub', 'a3000000-0000-4000-8000-000000000001',
  'role', 'authenticated', 'session_id', 'a3c00000-0000-4000-8000-000000000001')::text, true);
select is(public.verify_audit_chain() ->> 'status', 'VALID', 'the owner can verify every chain');
reset role;

select * from finish();
rollback;
