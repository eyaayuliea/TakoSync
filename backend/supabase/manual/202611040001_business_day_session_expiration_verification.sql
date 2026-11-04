-- Read-only verification queries for migration 202611040001.
-- Run in the Supabase SQL Editor after applying the complete migration script.

-- Required relations.
select
  to_regclass('public.business_day_settings') as settings_table,
  to_regclass('public.business_day_sessions') as sessions_table;

-- Required setting columns.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('business_day_settings', 'business_day_sessions')
order by table_name, ordinal_position;

-- Required indexes.
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'business_day_sessions_user_date_idx';

-- Required function signatures, ownership, security mode, and search paths.
select
  routine.oid::regprocedure as function_signature,
  role_record.rolname as function_owner,
  routine.prosecdef as security_definer,
  routine.proconfig as function_settings
from pg_proc routine
join pg_namespace namespace on namespace.oid = routine.pronamespace
join pg_roles role_record on role_record.oid = routine.proowner
where namespace.nspname = 'public'
  and routine.proname in (
    'business_day_closing_at',
    'business_session_is_active_at',
    'is_business_session_active',
    'authorize_business_session',
    'business_session_status',
    'set_business_day_settings',
    'enforce_active_business_session',
    'authorize_inventory_discrepancy_adjustment',
    'process_sale_inventory'
  )
order by routine.proname, routine.oid;

-- RLS must be enabled on both new tables. The business session table should
-- have no client policies; settings are changed only through the owner RPC.
select
  relation.relname as table_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in ('business_day_settings', 'business_day_sessions')
order by relation.relname;

-- Existing RLS-protected relations should have the restrictive session gate
-- and the write guard trigger.
select
  relation.relname as table_name,
  exists (
    select 1 from pg_policy policy
    where policy.polrelid = relation.oid
      and policy.polname = 'business_session_required'
      and policy.polpermissive = false
  ) as has_restrictive_session_policy,
  exists (
    select 1 from pg_trigger trigger_record
    where trigger_record.tgrelid = relation.oid
      and trigger_record.tgname = 'enforce_active_business_session'
      and not trigger_record.tgisinternal
  ) as has_session_write_guard
from pg_class relation
join pg_namespace namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relkind = 'r'
  and relation.relrowsecurity
  and relation.relname not in ('business_day_settings', 'business_day_sessions')
order by relation.relname;

-- Client grants: settings/session tables are not directly readable or writable;
-- the session registration and owner-settings RPCs are authenticated-only.
select
  has_table_privilege('authenticated', 'public.business_day_settings', 'SELECT') as auth_can_read_settings,
  has_table_privilege('authenticated', 'public.business_day_settings', 'UPDATE') as auth_can_update_settings,
  has_table_privilege('authenticated', 'public.business_day_sessions', 'SELECT') as auth_can_read_sessions,
  has_table_privilege('authenticated', 'public.business_day_sessions', 'UPDATE') as auth_can_update_sessions,
  has_function_privilege('anon', 'public.authorize_business_session()', 'EXECUTE') as anon_can_register,
  has_function_privilege('authenticated', 'public.authorize_business_session()', 'EXECUTE') as auth_can_register,
  has_function_privilege('authenticated', 'public.set_business_day_settings(date,time without time zone,time without time zone,time without time zone,boolean)', 'EXECUTE') as auth_can_call_owner_settings,
  has_function_privilege('authenticated', 'public.authorize_inventory_discrepancy_adjustment_unchecked(uuid,text)', 'EXECUTE') as auth_can_bypass_adjustment_guard,
  has_function_privilege('authenticated', 'public.process_sale_inventory_unchecked(uuid)', 'EXECUTE') as auth_can_bypass_sale_guard;

-- The migration preserves an explicit default row for the current Manila date.
select
  business_date,
  opening_time,
  normal_closing_time,
  extended_closing_time,
  extended_closing_enabled,
  timezone,
  public.business_day_closing_at(business_date) as effective_closing_timestamp
from public.business_day_settings
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;

-- Expected boundary examples, with no production data changes.
select
  (date '2031-02-04' + time '22:00') at time zone 'Asia/Manila' as normal_close_at,
  (date '2031-02-04' + time '23:00') at time zone 'Asia/Manila' as extended_close_at;
