begin;

-- Business hours remain available as Owner configuration/reporting data, but
-- they are no longer an authentication or authorization boundary. Supabase
-- Auth token expiry/refresh and the existing profile/role/branch policies are
-- still the security boundaries.

create or replace function public.is_business_session_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active
  )
  and exists (
    select 1
    from auth.sessions
    where id = case
      when ((select auth.jwt()) ->> 'session_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((select auth.jwt()) ->> 'session_id')::uuid
      else null
    end
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.authorize_business_session()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;
  return jsonb_build_object(
    'active', true,
    'business_date', (clock_timestamp() at time zone 'Asia/Manila')::date,
    'timezone', 'Asia/Manila',
    'expires_at', null,
    'milliseconds_until_expiration', 0
  );
end;
$$;

create or replace function public.business_session_status()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_date date := (clock_timestamp() at time zone 'Asia/Manila')::date;
  v_settings public.business_day_settings%rowtype;
begin
  if not public.is_business_session_active() then
    return jsonb_build_object('active', false);
  end if;
  select * into v_settings
  from public.business_day_settings
  where business_date = v_business_date;
  return jsonb_build_object(
    'active', true,
    'business_date', v_business_date,
    'opening_time', coalesce(v_settings.opening_time, time '16:00'),
    'normal_closing_time', coalesce(v_settings.normal_closing_time, time '22:00'),
    'extended_closing_time', coalesce(v_settings.extended_closing_time, time '23:00'),
    'extended_closing_enabled', coalesce(v_settings.extended_closing_enabled, false),
    'timezone', 'Asia/Manila',
    'expires_at', null,
    'milliseconds_until_expiration', 0
  );
end;
$$;

create or replace function public.is_active_owner()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner' and active
  );
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.branches
    where id = target_branch and active
  )
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and active
      and (
        role = 'owner'
        or (role = 'staff' and not coalesce(must_change_password, false) and branch_id = target_branch)
      )
  );
$$;

-- Remove the business-session restrictive policy and trigger while preserving
-- every pre-existing role and branch policy on the protected tables.
do $$
declare
  v_table record;
begin
  for v_table in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  loop
    execute format('drop policy if exists business_session_required on %I.%I', v_table.schema_name, v_table.table_name);
    execute format('drop trigger if exists enforce_active_business_session on %I.%I', v_table.schema_name, v_table.table_name);
  end loop;
end;
$$;

-- Restore the guarded RPCs to their existing authorization-aware operations.
create or replace function public.authorize_inventory_discrepancy_adjustment(
  p_count_line_id uuid,
  p_reason text
)
returns public.inventory_discrepancy_adjustments
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only an active owner may authorize inventory adjustments';
  end if;
  return public.authorize_inventory_discrepancy_adjustment_unchecked(p_count_line_id, p_reason);
end;
$$;

create or replace function public.process_sale_inventory(p_sale_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  return public.process_sale_inventory_integrity_unchecked(p_sale_id);
end;
$$;

revoke all on function public.is_business_session_active() from public, anon;
grant execute on function public.is_business_session_active() to authenticated;
revoke all on function public.authorize_business_session() from public, anon;
grant execute on function public.authorize_business_session() to authenticated;
revoke all on function public.business_session_status() from public, anon;
grant execute on function public.business_session_status() to authenticated;
alter function public.is_business_session_active() owner to postgres;
alter function public.authorize_business_session() owner to postgres;
alter function public.business_session_status() owner to postgres;
alter function public.is_active_owner() owner to postgres;
alter function public.can_access_branch(uuid) owner to postgres;
alter function public.authorize_inventory_discrepancy_adjustment(uuid, text) owner to postgres;
alter function public.process_sale_inventory(uuid) owner to postgres;

notify pgrst, 'reload schema';
commit;
