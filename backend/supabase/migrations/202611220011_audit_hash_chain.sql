-- S3: SHA-256 hash-chained, append-only audit log
-- (Algorithm Architecture Specification §2.8 and §3.7; US-AUDIT-02).
--
-- public.audit_logs already gets an event from the database for every stock
-- movement, account change, stock check, void, reversal, daily closing and
-- reorder setting. Each event is now linked into a chain:
--   chain scope   = the event's branch, or 'global' for events with no branch
--                   (one chain per branch, so branches don't wait on each other)
--   H_i           = SHA-256(H_{i-1} || canonical(event_i)), hex
--   H_0's parent  = 64 zeros (genesis)
--   canonical     = JSON with keys in alphabetical order: action, actor_id,
--                   branch_id, chain_scope, description, event_id,
--                   event_timestamp (UTC ISO-8601 with microseconds),
--                   sequence_number. UTF-8; JSON null for a missing value; the
--                   hash fields themselves are excluded.
-- The chain head is locked and updated in the same transaction as the event.
-- Events cannot be updated, deleted or truncated. Passwords, tokens and email
-- addresses are scrubbed from the description before hashing.
-- verify_audit_chain recomputes a chain and reports the first bad position.
-- Checkpoints (sequence and hash of each chain head) let the owner keep a copy
-- outside the database and verify from it later.
-- Known limit (spec §3.7): someone with full database control can rewrite a
-- whole chain and its head. Only a checkpoint kept outside the database
-- detects that.

create extension if not exists pgcrypto with schema extensions;

-- Audit history keeps the original ids even after a user or branch is deleted.
-- The old ON DELETE SET NULL would rewrite history, so those keys are dropped.
alter table public.audit_logs drop constraint if exists audit_logs_user_id_fkey;
alter table public.audit_logs drop constraint if exists audit_logs_branch_id_fkey;

alter table public.audit_logs
  add column if not exists chain_scope text,
  add column if not exists sequence_number bigint,
  add column if not exists previous_hash text,
  add column if not exists event_hash text;

create table if not exists private.audit_chain_heads (
  chain_scope text primary key,
  last_sequence bigint not null default 0,
  last_hash text not null default repeat('0', 64),
  updated_at timestamptz not null default now()
);
revoke all on private.audit_chain_heads from public, anon, authenticated;

create or replace function private.audit_genesis_hash()
returns text
language sql
immutable
as $$ select repeat('0', 64); $$;

-- CANONICALIZE (§2.8).
create or replace function private.audit_canonical(
  p_event_id uuid,
  p_chain_scope text,
  p_sequence_number bigint,
  p_action text,
  p_actor_id uuid,
  p_branch_id uuid,
  p_description text,
  p_event_timestamp timestamptz
)
returns text
language sql
immutable
as $$
  select '{"action":' || coalesce(to_json(p_action)::text, 'null')
    || ',"actor_id":' || coalesce(to_json(p_actor_id::text)::text, 'null')
    || ',"branch_id":' || coalesce(to_json(p_branch_id::text)::text, 'null')
    || ',"chain_scope":' || coalesce(to_json(p_chain_scope)::text, 'null')
    || ',"description":' || coalesce(to_json(p_description)::text, 'null')
    || ',"event_id":' || coalesce(to_json(p_event_id::text)::text, 'null')
    || ',"event_timestamp":' || coalesce(
         to_json(to_char(p_event_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text, 'null')
    || ',"sequence_number":' || coalesce(p_sequence_number::text, 'null')
    || '}';
$$;

create or replace function private.audit_event_hash(p_previous_hash text, p_canonical text)
returns text
language sql
immutable
as $$ select encode(extensions.digest(convert_to(p_previous_hash || p_canonical, 'UTF8'), 'sha256'), 'hex'); $$;

-- Secret and personal-data scrubbing (AC-AUDIT-02-08).
create or replace function private.scrub_audit_text(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_text, ''),
          '(password|passwd|pwd|secret|token|api[_-]?key|authorization)(\s*[:=]\s*)\S+', '\1\2[REDACTED]', 'gi'),
        'bearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]', 'gi'),
      'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED TOKEN]', 'g'),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[REDACTED EMAIL]', 'g');
$$;

-- Backfill the chain for existing events, oldest first, then add the rules.
do $$
declare
  v_row record;
  v_head record;
  v_scope text;
  v_sequence bigint;
  v_previous text;
begin
  for v_row in select * from public.audit_logs where event_hash is null order by created_at, id loop
    v_scope := coalesce(v_row.branch_id::text, 'global');
    insert into private.audit_chain_heads (chain_scope) values (v_scope) on conflict do nothing;
    select * into v_head from private.audit_chain_heads where chain_scope = v_scope for update;
    v_sequence := v_head.last_sequence + 1;
    v_previous := v_head.last_hash;
    update public.audit_logs set
      description = private.scrub_audit_text(v_row.description),
      chain_scope = v_scope,
      sequence_number = v_sequence,
      previous_hash = v_previous,
      event_hash = private.audit_event_hash(v_previous, private.audit_canonical(
        v_row.id, v_scope, v_sequence, v_row.action, v_row.user_id, v_row.branch_id,
        private.scrub_audit_text(v_row.description), v_row.created_at))
    where id = v_row.id
    returning event_hash into v_previous;
    update private.audit_chain_heads set last_sequence = v_sequence, last_hash = v_previous, updated_at = now()
    where chain_scope = v_scope;
  end loop;
end;
$$;

alter table public.audit_logs
  alter column chain_scope set not null,
  alter column sequence_number set not null,
  alter column previous_hash set not null,
  alter column event_hash set not null;
alter table public.audit_logs drop constraint if exists audit_logs_chain_position_key;
alter table public.audit_logs add constraint audit_logs_chain_position_key unique (chain_scope, sequence_number);
alter table public.audit_logs drop constraint if exists audit_logs_hash_format_check;
alter table public.audit_logs add constraint audit_logs_hash_format_check
  check (previous_hash ~ '^[0-9a-f]{64}$' and event_hash ~ '^[0-9a-f]{64}$');

-- APPEND_AUDIT_EVENT (§3.7): runs inside the inserting transaction.
create or replace function private.append_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_head private.audit_chain_heads%rowtype;
begin
  new.id := coalesce(new.id, gen_random_uuid());
  new.created_at := coalesce(new.created_at, now());
  new.description := private.scrub_audit_text(new.description);
  new.chain_scope := coalesce(new.branch_id::text, 'global');

  insert into private.audit_chain_heads (chain_scope) values (new.chain_scope) on conflict do nothing;
  select * into v_head from private.audit_chain_heads where chain_scope = new.chain_scope for update;

  new.sequence_number := v_head.last_sequence + 1;
  new.previous_hash := v_head.last_hash;
  new.event_hash := private.audit_event_hash(new.previous_hash, private.audit_canonical(
    new.id, new.chain_scope, new.sequence_number, new.action, new.user_id, new.branch_id,
    new.description, new.created_at));

  update private.audit_chain_heads
  set last_sequence = new.sequence_number, last_hash = new.event_hash, updated_at = now()
  where chain_scope = new.chain_scope;
  return new;
end;
$$;

drop trigger if exists audit_logs_append_chain on public.audit_logs;
create trigger audit_logs_append_chain
before insert on public.audit_logs
for each row execute function private.append_audit_event();

-- Append-only (AC-AUDIT-02-04).
create or replace function private.reject_audit_change()
returns trigger
language plpgsql
as $$
begin
  raise exception using errcode = '42501', message = 'Audit events are append-only and cannot be changed or deleted';
end;
$$;

drop trigger if exists audit_logs_append_only on public.audit_logs;
create trigger audit_logs_append_only
before update or delete on public.audit_logs
for each row execute function private.reject_audit_change();
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate
before truncate on public.audit_logs
for each statement execute function private.reject_audit_change();

revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated, service_role;
grant select on public.audit_logs to service_role;

-- More events: sales and owner inventory settings ---------------------------------
create or replace function private.audit_sale_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (user_id, branch_id, action, description)
    values (new.staff_id, new.branch_id, 'sale.recorded',
      format('Sale %s %s %s total %s status %s', new.transaction_reference, new.payment_method,
        new.id, trim_scale(new.total_amount), new.status));
  elsif new.status is distinct from old.status then
    insert into public.audit_logs (user_id, branch_id, action, description)
    values (coalesce((select auth.uid()), new.staff_id), new.branch_id, 'sale.status_changed',
      format('Sale %s %s status %s -> %s', new.transaction_reference, new.id, old.status, new.status));
  end if;
  return null;
end;
$$;

drop trigger if exists sales_audit_event on public.sales;
create trigger sales_audit_event
after insert or update of status on public.sales
for each row execute function private.audit_sale_event();

create or replace function private.audit_owner_inventory_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (user_id, branch_id, action, description)
  values ((select auth.uid()), null, 'settings.inventory_updated',
    format('Near expiration %s days; lot colours yellow %s h, red %s h',
      new.near_expiration_days, new.lot_warning_hours, new.lot_critical_hours));
  return null;
end;
$$;

drop trigger if exists owner_inventory_settings_audit on public.owner_inventory_settings;
create trigger owner_inventory_settings_audit
after insert or update on public.owner_inventory_settings
for each row execute function private.audit_owner_inventory_settings();

-- Checkpoints (AC-AUDIT-02-11) -----------------------------------------------------
create table if not exists public.audit_chain_checkpoints (
  id uuid primary key default gen_random_uuid(),
  chain_scope text not null,
  sequence_number bigint not null check (sequence_number >= 0),
  event_hash text not null check (event_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid
);
create index if not exists audit_chain_checkpoints_scope_idx
  on public.audit_chain_checkpoints (chain_scope, sequence_number desc);
alter table public.audit_chain_checkpoints enable row level security;
drop policy if exists audit_chain_checkpoints_owner_read on public.audit_chain_checkpoints;
create policy audit_chain_checkpoints_owner_read on public.audit_chain_checkpoints
for select to authenticated using (public.is_active_owner());
revoke all on public.audit_chain_checkpoints from anon, authenticated;
grant select on public.audit_chain_checkpoints to authenticated;

drop trigger if exists audit_chain_checkpoints_append_only on public.audit_chain_checkpoints;
create trigger audit_chain_checkpoints_append_only
before update or delete on public.audit_chain_checkpoints
for each row execute function private.reject_audit_change();

create or replace function private.require_audit_verifier()
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  -- The owner, the service role (System Administrator, spec §2.7), or a direct
  -- database session with no API sign-in at all (auth.role() is null).
  if not (public.is_active_owner() or (select auth.role()) = 'service_role' or (select auth.role()) is null) then
    raise exception using errcode = '42501', message = 'Only the owner can view or verify the audit chain';
  end if;
end;
$$;

-- Records the current head of every chain. The owner exports the result
-- (share or e-mail) so a copy lives outside the database.
create or replace function public.create_audit_checkpoint()
returns setof public.audit_chain_checkpoints
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
begin
  perform private.require_audit_verifier();
  with created as (
    insert into public.audit_chain_checkpoints (chain_scope, sequence_number, event_hash, created_by)
    select chain_scope, last_sequence, last_hash, (select auth.uid())
    from private.audit_chain_heads
    order by chain_scope
    returning id
  )
  select array_agg(id) into v_ids from created;
  return query select * from public.audit_chain_checkpoints where id = any(coalesce(v_ids, '{}')) order by chain_scope;
end;
$$;

-- VERIFY_AUDIT_CHAIN (§3.7) for one chain.
create or replace function private.verify_audit_chain_scope(
  p_chain_scope text,
  p_from_sequence bigint default 0,
  p_from_hash text default null,
  p_to_sequence bigint default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_started timestamptz := clock_timestamp();
  v_previous text;
  v_expected_sequence bigint;
  v_expected_hash text;
  v_event public.audit_logs%rowtype;
  v_count bigint := 0;
  v_head private.audit_chain_heads%rowtype;
  v_result jsonb;
begin
  if coalesce(p_from_sequence, 0) < 0 then raise exception 'The checkpoint sequence cannot be negative'; end if;
  if coalesce(p_from_sequence, 0) > 0 and (p_from_hash is null or p_from_hash !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = '22023', message = 'Verifying from a checkpoint needs its 64-character hash';
  end if;
  v_previous := case when coalesce(p_from_sequence, 0) = 0 then private.audit_genesis_hash() else p_from_hash end;
  v_expected_sequence := coalesce(p_from_sequence, 0) + 1;

  for v_event in
    select * from public.audit_logs
    where chain_scope = p_chain_scope and sequence_number > coalesce(p_from_sequence, 0)
      and (p_to_sequence is null or sequence_number <= p_to_sequence)
    order by sequence_number
  loop
    if v_event.sequence_number <> v_expected_sequence then
      v_result := jsonb_build_object('status', 'INVALID', 'reason', 'SEQUENCE_GAP',
        'first_invalid_sequence', v_expected_sequence, 'found_sequence', v_event.sequence_number);
      exit;
    end if;
    if v_event.previous_hash <> v_previous then
      v_result := jsonb_build_object('status', 'INVALID', 'reason', 'PREVIOUS_HASH_MISMATCH',
        'first_invalid_sequence', v_event.sequence_number, 'expected_hash', v_previous, 'stored_hash', v_event.previous_hash);
      exit;
    end if;
    v_expected_hash := private.audit_event_hash(v_previous, private.audit_canonical(
      v_event.id, v_event.chain_scope, v_event.sequence_number, v_event.action, v_event.user_id,
      v_event.branch_id, v_event.description, v_event.created_at));
    if v_event.event_hash <> v_expected_hash then
      v_result := jsonb_build_object('status', 'INVALID', 'reason', 'EVENT_HASH_MISMATCH',
        'first_invalid_sequence', v_event.sequence_number, 'expected_hash', v_expected_hash, 'stored_hash', v_event.event_hash);
      exit;
    end if;
    v_previous := v_event.event_hash;
    v_expected_sequence := v_expected_sequence + 1;
    v_count := v_count + 1;
  end loop;

  -- Deleting the newest events leaves no gap, so compare with the chain head.
  if v_result is null and p_to_sequence is null then
    select * into v_head from private.audit_chain_heads where chain_scope = p_chain_scope;
    if coalesce(v_head.last_sequence, 0) <> v_expected_sequence - 1
       or coalesce(v_head.last_hash, private.audit_genesis_hash()) <> v_previous then
      v_result := jsonb_build_object('status', 'INVALID', 'reason', 'HEAD_MISMATCH',
        'first_invalid_sequence', v_expected_sequence, 'expected_hash', v_head.last_hash, 'stored_hash', v_previous);
    end if;
  end if;

  return coalesce(v_result, jsonb_build_object('status', 'VALID', 'first_invalid_sequence', null))
    || jsonb_build_object(
      'chain_scope', p_chain_scope,
      'from_sequence', coalesce(p_from_sequence, 0),
      'verified_event_count', v_count,
      'final_hash', v_previous,
      'execution_time_ms', round(extract(epoch from clock_timestamp() - v_started)::numeric * 1000, 1));
end;
$$;

-- Owner / service entry point. With no scope it checks every chain, starting each
-- from the latest stored checkpoint when p_from_last_checkpoint is set.
create or replace function public.verify_audit_chain(
  p_chain_scope text default null,
  p_from_sequence bigint default 0,
  p_from_hash text default null,
  p_to_sequence bigint default null,
  p_from_last_checkpoint boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_scope text;
  v_checkpoint public.audit_chain_checkpoints%rowtype;
  v_chains jsonb := '[]'::jsonb;
  v_one jsonb;
begin
  perform private.require_audit_verifier();
  for v_scope in
    select chain_scope from private.audit_chain_heads
    where p_chain_scope is null or chain_scope = p_chain_scope
    order by chain_scope
  loop
    if p_from_last_checkpoint then
      select * into v_checkpoint from public.audit_chain_checkpoints
      where chain_scope = v_scope order by sequence_number desc, created_at desc limit 1;
      v_one := private.verify_audit_chain_scope(v_scope,
        coalesce(v_checkpoint.sequence_number, 0), v_checkpoint.event_hash, p_to_sequence);
    else
      v_one := private.verify_audit_chain_scope(v_scope, p_from_sequence, p_from_hash, p_to_sequence);
    end if;
    v_chains := v_chains || jsonb_build_array(v_one);
  end loop;
  return jsonb_build_object(
    'status', case when exists (select 1 from jsonb_array_elements(v_chains) c where c ->> 'status' <> 'VALID')
      then 'INVALID' else 'VALID' end,
    'chains', v_chains,
    'verified_event_count', (select coalesce(sum((c ->> 'verified_event_count')::bigint), 0) from jsonb_array_elements(v_chains) c),
    'verified_at', now());
end;
$$;

revoke all on function private.audit_genesis_hash() from public, anon, authenticated;
revoke all on function private.audit_canonical(uuid, text, bigint, text, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function private.audit_event_hash(text, text) from public, anon, authenticated;
revoke all on function private.scrub_audit_text(text) from public, anon, authenticated;
revoke all on function private.append_audit_event() from public, anon, authenticated;
revoke all on function private.reject_audit_change() from public, anon, authenticated;
revoke all on function private.audit_sale_event() from public, anon, authenticated;
revoke all on function private.audit_owner_inventory_settings() from public, anon, authenticated;
revoke all on function private.require_audit_verifier() from public, anon, authenticated;
revoke all on function private.verify_audit_chain_scope(text, bigint, text, bigint) from public, anon, authenticated;
revoke all on function public.create_audit_checkpoint() from public, anon;
revoke all on function public.verify_audit_chain(text, bigint, text, bigint, boolean) from public, anon;
grant execute on function public.create_audit_checkpoint() to authenticated, service_role;
grant execute on function public.verify_audit_chain(text, bigint, text, bigint, boolean) to authenticated, service_role;
