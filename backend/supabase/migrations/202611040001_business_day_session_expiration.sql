-- Gate all authenticated business access on a server-recorded Auth session
-- and the configured closing time for the current Manila business date.
-- Paste this entire file into the intended Supabase project's SQL Editor.
-- The preflight and migration run in one transaction; missing prerequisites
-- abort the transaction before any feature changes are made.
begin;

do $$
declare
  v_missing_versions text;
  v_required_object text;
begin
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'Supabase migration history is unavailable; stop and confirm this is the correct project with Supabase migrations enabled';
  end if;

  execute $query$
    select string_agg(expected.version, ', ' order by expected.version)
    from unnest(array[
      '202610280001',
      '202610280002',
      '202610300001',
      '202610300002',
      '202610310001',
      '202611020000',
      '202611020001',
      '202611020002',
      '202611020003',
      '202611020005',
      '202611020006'
    ]) as expected(version)
    where not exists (
      select 1
      from supabase_migrations.schema_migrations applied
      where applied.version::text = expected.version
    )
  $query$ into v_missing_versions;

  if v_missing_versions is not null then
    raise exception
      'Required existing migrations are not recorded as applied: %. No feature changes were made.',
      v_missing_versions;
  end if;

  foreach v_required_object in array array['public.profiles', 'auth.sessions']
  loop
    if to_regclass(v_required_object) is null then
      raise exception
        'Required prerequisite relation % is missing. No feature changes were made.',
        v_required_object;
    end if;
  end loop;

  if to_regprocedure('public.is_active_owner()') is null
    or to_regprocedure('public.can_access_branch(uuid)') is null
    or to_regprocedure('public.authorize_inventory_discrepancy_adjustment(uuid,text)') is null
    or to_regprocedure('public.process_sale_inventory(uuid)') is null then
    raise exception
      'Required existing authorization or business RPC functions are missing. No feature changes were made.';
  end if;
end;
$$;

create table if not exists public.business_day_settings (
  business_date date primary key,
  opening_time time without time zone not null default time '16:00',
  normal_closing_time time without time zone not null default time '22:00',
  extended_closing_time time without time zone not null default time '23:00',
  extended_closing_enabled boolean not null default false,
  timezone text not null default 'Asia/Manila',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint business_day_settings_timezone check (timezone = 'Asia/Manila'),
  constraint business_day_settings_order check (
    opening_time < normal_closing_time
    and normal_closing_time < extended_closing_time
  )
);

create table if not exists public.business_day_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  business_date date not null,
  created_at timestamptz not null default now()
);

insert into public.business_day_settings (business_date)
values ((clock_timestamp() at time zone 'Asia/Manila')::date)
on conflict (business_date) do nothing;

create index if not exists business_day_sessions_user_date_idx
  on public.business_day_sessions (user_id, business_date);

alter table public.business_day_settings enable row level security;
alter table public.business_day_sessions enable row level security;

revoke all on public.business_day_settings, public.business_day_sessions
  from public, anon, authenticated;

create or replace function public.business_day_closing_at(p_business_date date)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    p_business_date + coalesce(
      (
        select case
          when settings.extended_closing_enabled then settings.extended_closing_time
          else settings.normal_closing_time
        end
        from public.business_day_settings settings
        where settings.business_date = p_business_date
      ),
      time '22:00'
    )
  ) at time zone coalesce(
    (
      select settings.timezone
      from public.business_day_settings settings
      where settings.business_date = p_business_date
    ),
    'Asia/Manila'
  );
$$;

create or replace function public.business_session_is_active_at(
  p_user_id uuid,
  p_session_id uuid,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_now < public.business_day_closing_at(
      (p_now at time zone 'Asia/Manila')::date
    )
    and exists (
      select 1
      from public.business_day_sessions session_record
      join public.profiles profile on profile.id = session_record.user_id
      where session_record.session_id = p_session_id
        and session_record.user_id = p_user_id
        and session_record.business_date = (p_now at time zone 'Asia/Manila')::date
        and profile.active
        and exists (
          select 1 from auth.sessions auth_session
          where auth_session.id = p_session_id
            and auth_session.user_id = p_user_id
        )
    );
$$;

create or replace function public.is_business_session_active()
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_id_text text;
  v_session_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if auth.uid() is null then
    return false;
  end if;

  v_session_id_text := auth.jwt() ->> 'session_id';
  if v_session_id_text is null
    or v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_session_id := v_session_id_text::uuid;
  return public.business_session_is_active_at(auth.uid(), v_session_id, v_now);
end;
$$;

create or replace function public.authorize_business_session()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id_text text;
  v_session_id uuid;
  v_profile public.profiles%rowtype;
  v_existing_session public.business_day_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_business_date date;
  v_timezone text := 'Asia/Manila';
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required';
  end if;

  v_session_id_text := auth.jwt() ->> 'session_id';
  if v_session_id_text is null
    or v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '42501', message = 'The Auth session has no valid session identifier';
  end if;
  v_session_id := v_session_id_text::uuid;

  select * into v_profile
  from public.profiles
  where id = v_user_id and active;
  if not found then
    raise exception using errcode = '42501', message = 'An active TakoSync profile is required';
  end if;

  v_business_date := (v_now at time zone v_timezone)::date;
  select settings.timezone
  into v_timezone
  from public.business_day_settings settings
  where settings.business_date = v_business_date;
  v_timezone := coalesce(v_timezone, 'Asia/Manila');
  v_expires_at := public.business_day_closing_at(v_business_date);

  if v_now >= v_expires_at then
    raise exception using
      errcode = '42501',
      message = 'The business session has closed; sign in again when the next session is available';
  end if;

  if not exists (
    select 1
    from auth.sessions auth_session
    where auth_session.id = v_session_id
      and auth_session.user_id = v_user_id
      and (auth_session.created_at at time zone v_timezone)::date = v_business_date
  ) then
    raise exception using
      errcode = '42501',
      message = 'Sign in again to start a session for this business date';
  end if;

  select * into v_existing_session
  from public.business_day_sessions
  where session_id = v_session_id
  for update;
  if found then
    if v_existing_session.user_id <> v_user_id
      or v_existing_session.business_date <> v_business_date then
      raise exception using
        errcode = '42501',
        message = 'This Auth session cannot be reused for another business date';
    end if;
  else
    insert into public.business_day_sessions (session_id, user_id, business_date)
    values (v_session_id, v_user_id, v_business_date);
  end if;

  return jsonb_build_object(
    'active', true,
    'business_date', v_business_date,
    'timezone', v_timezone,
    'expires_at', v_expires_at,
    'milliseconds_until_expiration',
      greatest(0, floor(extract(epoch from (v_expires_at - v_now)) * 1000))::bigint
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
  v_now timestamptz := clock_timestamp();
  v_business_date date := (v_now at time zone 'Asia/Manila')::date;
  v_session_id_text text := auth.jwt() ->> 'session_id';
  v_session_id uuid;
  v_opening_time time without time zone;
  v_normal_closing_time time without time zone;
  v_extended_closing_time time without time zone;
  v_extended_closing_enabled boolean;
  v_timezone text;
  v_expires_at timestamptz;
begin
  if auth.uid() is null
    or v_session_id_text is null
    or v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('active', false);
  end if;
  v_session_id := v_session_id_text::uuid;

  select
    settings.opening_time,
    settings.normal_closing_time,
    settings.extended_closing_time,
    settings.extended_closing_enabled,
    settings.timezone
  into
    v_opening_time,
    v_normal_closing_time,
    v_extended_closing_time,
    v_extended_closing_enabled,
    v_timezone
  from public.business_day_settings settings
  where settings.business_date = v_business_date;
  v_opening_time := coalesce(v_opening_time, time '16:00');
  v_normal_closing_time := coalesce(v_normal_closing_time, time '22:00');
  v_extended_closing_time := coalesce(v_extended_closing_time, time '23:00');
  v_extended_closing_enabled := coalesce(v_extended_closing_enabled, false);
  v_timezone := coalesce(v_timezone, 'Asia/Manila');
  v_expires_at := public.business_day_closing_at(v_business_date);

  if not public.is_business_session_active() then
    return jsonb_build_object(
      'active', false,
      'business_date', v_business_date,
      'opening_time', v_opening_time,
      'normal_closing_time', v_normal_closing_time,
      'extended_closing_time', v_extended_closing_time,
      'extended_closing_enabled', v_extended_closing_enabled,
      'timezone', v_timezone,
      'expires_at', v_expires_at,
      'milliseconds_until_expiration', 0
    );
  end if;

  return jsonb_build_object(
    'active', true,
    'business_date', v_business_date,
    'opening_time', v_opening_time,
    'normal_closing_time', v_normal_closing_time,
    'extended_closing_time', v_extended_closing_time,
    'extended_closing_enabled', v_extended_closing_enabled,
    'timezone', v_timezone,
    'expires_at', v_expires_at,
    'milliseconds_until_expiration',
      greatest(0, floor(extract(epoch from (v_expires_at - v_now)) * 1000))::bigint
  );
end;
$$;

create or replace function public.set_business_day_settings(
  p_business_date date,
  p_opening_time time without time zone,
  p_normal_closing_time time without time zone,
  p_extended_closing_time time without time zone,
  p_extended_closing_enabled boolean
)
returns public.business_day_settings
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings public.business_day_settings%rowtype;
  v_today date := (clock_timestamp() at time zone 'Asia/Manila')::date;
begin
  if not public.is_active_owner() then
    raise exception using errcode = '42501', message = 'Only an active owner may change business hours';
  end if;
  if p_business_date is null or p_business_date < v_today then
    raise exception 'Business hours can only be configured for today or a future business date';
  end if;
  if p_opening_time is null or p_normal_closing_time is null
    or p_extended_closing_time is null or p_extended_closing_enabled is null then
    raise exception 'All business-day settings are required';
  end if;
  if not (p_opening_time < p_normal_closing_time
    and p_normal_closing_time < p_extended_closing_time) then
    raise exception 'Business hours must be ordered: opening, normal closing, extended closing';
  end if;

  insert into public.business_day_settings (
    business_date, opening_time, normal_closing_time,
    extended_closing_time, extended_closing_enabled, timezone, updated_by, updated_at
  ) values (
    p_business_date, p_opening_time, p_normal_closing_time,
    p_extended_closing_time, p_extended_closing_enabled, 'Asia/Manila', auth.uid(), clock_timestamp()
  )
  on conflict (business_date) do update
  set opening_time = excluded.opening_time,
      normal_closing_time = excluded.normal_closing_time,
      extended_closing_time = excluded.extended_closing_time,
      extended_closing_enabled = excluded.extended_closing_enabled,
      timezone = 'Asia/Manila',
      updated_by = auth.uid(),
      updated_at = clock_timestamp()
  returning * into v_settings;

  return v_settings;
end;
$$;

-- These existing helpers are used throughout RLS policies and RPCs. Including
-- the server session check preserves the current role and branch rules.
create or replace function public.is_active_owner()
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select public.is_business_session_active() and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'owner' and active
  );
$$;

create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select public.is_business_session_active()
    and exists (
      select 1 from public.branches
      where id = target_branch and active
    )
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid())
        and active
        and (role = 'owner' or branch_id = target_branch)
    );
$$;

do $$
begin
  if to_regprocedure(
    'public.authorize_inventory_discrepancy_adjustment_unchecked(uuid,text)'
  ) is null then
    execute 'alter function public.authorize_inventory_discrepancy_adjustment(uuid, text) rename to authorize_inventory_discrepancy_adjustment_unchecked';
  end if;
end;
$$;

revoke all on function public.authorize_inventory_discrepancy_adjustment_unchecked(uuid, text)
  from public, anon, authenticated;

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
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'owner'
      and active
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active owner may authorize inventory adjustments';
  end if;
  if not public.is_business_session_active() then
    raise exception using
      errcode = '42501',
      message = 'The business session has expired; authenticate again for the next business date';
  end if;

  return public.authorize_inventory_discrepancy_adjustment_unchecked(
    p_count_line_id,
    p_reason
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.process_sale_inventory_unchecked(uuid)') is null then
    execute 'alter function public.process_sale_inventory(uuid) rename to process_sale_inventory_unchecked';
  end if;
end;
$$;

revoke all on function public.process_sale_inventory_unchecked(uuid)
  from public, anon, authenticated;

create or replace function public.process_sale_inventory(p_sale_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_business_session_active() then
    raise exception using
      errcode = '42501',
      message = 'The business session has expired; authenticate again for the next business date';
  end if;

  return public.process_sale_inventory_unchecked(p_sale_id);
end;
$$;

create or replace function public.enforce_active_business_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
    and coalesce(auth.role(), '') <> 'service_role'
    and not public.is_business_session_active() then
    raise exception using
      errcode = '42501',
      message = 'The business session has expired; authenticate again for the next business date';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Add a restrictive policy so it combines with, rather than replaces, every
-- existing branch and role policy on each currently protected table.
do $$
declare
  v_table record;
begin
  for v_table in
    select relation.relname
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relrowsecurity
      and relation.relname not in ('business_day_settings', 'business_day_sessions')
  loop
    execute format(
      'drop policy if exists business_session_required on public.%I',
      v_table.relname
    );
    execute format(
      'create policy business_session_required on public.%I as restrictive for all to authenticated using (public.is_business_session_active()) with check (public.is_business_session_active())',
      v_table.relname
    );
    execute format(
      'drop trigger if exists enforce_active_business_session on public.%I',
      v_table.relname
    );
    execute format(
      'create trigger enforce_active_business_session before insert or update or delete on public.%I for each row execute function public.enforce_active_business_session()',
      v_table.relname
    );
  end loop;
end;
$$;

revoke all on function public.is_business_session_active() from public, anon;
revoke all on function public.business_day_closing_at(date) from public, anon, authenticated;
revoke all on function public.business_session_is_active_at(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.authorize_business_session() from public, anon;
revoke all on function public.business_session_status() from public, anon;
revoke all on function public.set_business_day_settings(date, time without time zone, time without time zone, time without time zone, boolean)
  from public, anon;
revoke all on function public.authorize_inventory_discrepancy_adjustment_unchecked(uuid, text)
  from public, anon, authenticated;
revoke all on function public.authorize_inventory_discrepancy_adjustment(uuid, text)
  from public, anon;
revoke all on function public.process_sale_inventory_unchecked(uuid)
  from public, anon, authenticated;
revoke all on function public.process_sale_inventory(uuid)
  from public, anon;
revoke all on function public.enforce_active_business_session() from public, anon, authenticated;
grant execute on function public.is_business_session_active() to authenticated;
grant execute on function public.authorize_business_session() to authenticated;
grant execute on function public.business_session_status() to authenticated;
grant execute on function public.set_business_day_settings(date, time without time zone, time without time zone, time without time zone, boolean)
  to authenticated;
grant execute on function public.authorize_inventory_discrepancy_adjustment(uuid, text)
  to authenticated;
grant execute on function public.process_sale_inventory(uuid) to authenticated;

alter function public.is_business_session_active() owner to postgres;
alter function public.business_day_closing_at(date) owner to postgres;
alter function public.business_session_is_active_at(uuid, uuid, timestamptz) owner to postgres;
alter function public.authorize_business_session() owner to postgres;
alter function public.business_session_status() owner to postgres;
alter function public.set_business_day_settings(date, time without time zone, time without time zone, time without time zone, boolean)
  owner to postgres;
alter function public.is_active_owner() owner to postgres;
alter function public.can_access_branch(uuid) owner to postgres;
alter function public.enforce_active_business_session() owner to postgres;
alter function public.authorize_inventory_discrepancy_adjustment_unchecked(uuid, text) owner to postgres;
alter function public.authorize_inventory_discrepancy_adjustment(uuid, text) owner to postgres;
alter function public.process_sale_inventory_unchecked(uuid) owner to postgres;
alter function public.process_sale_inventory(uuid) owner to postgres;

-- Auth refresh may continue to issue a Supabase JWT; the session registration
-- is deliberately immutable to clients, so refreshed tokens cannot renew
-- business access or re-register an old Auth session for another business date.
notify pgrst, 'reload schema';

commit;

-- One-row verification summary. All values should be true except the two
-- bypass privileges, which must be false. The final JSON shows the live
-- effective schedule for today's Manila business date.
select
  to_regclass('public.business_day_settings') is not null as settings_table_exists,
  to_regclass('public.business_day_sessions') is not null as sessions_table_exists,
  to_regclass('public.business_day_sessions_user_date_idx') is not null as session_index_exists,
  (
    select count(*) = 2
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in ('business_day_settings', 'business_day_sessions')
      and relation.relrowsecurity
  ) as new_tables_have_rls,
  (
    select count(*) = 0
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relrowsecurity
      and relation.relname not in ('business_day_settings', 'business_day_sessions')
      and (
        not exists (
          select 1 from pg_policy policy
          where policy.polrelid = relation.oid
            and policy.polname = 'business_session_required'
            and not policy.polpermissive
        )
        or not exists (
          select 1 from pg_trigger trigger_record
          where trigger_record.tgrelid = relation.oid
            and trigger_record.tgname = 'enforce_active_business_session'
            and not trigger_record.tgisinternal
        )
      )
  ) as all_existing_protected_tables_gated,
  has_function_privilege('authenticated', 'public.authorize_business_session()', 'EXECUTE')
    as authenticated_can_register_session,
  not has_function_privilege('anon', 'public.authorize_business_session()', 'EXECUTE')
    as anonymous_cannot_register_session,
  not has_table_privilege('authenticated', 'public.business_day_sessions', 'UPDATE')
    as clients_cannot_change_session_records,
  not has_table_privilege('authenticated', 'public.business_day_settings', 'UPDATE')
    as clients_cannot_directly_change_settings,
  not has_function_privilege(
    'authenticated',
    'public.authorize_inventory_discrepancy_adjustment_unchecked(uuid,text)',
    'EXECUTE'
  ) as adjustment_bypass_is_blocked,
  not has_function_privilege(
    'authenticated',
    'public.process_sale_inventory_unchecked(uuid)',
    'EXECUTE'
  ) as sale_processing_bypass_is_blocked,
  exists (
    select 1
    from public.business_day_settings settings
    where settings.business_date = (clock_timestamp() at time zone 'Asia/Manila')::date
      and settings.opening_time = time '16:00'
      and settings.normal_closing_time = time '22:00'
      and settings.extended_closing_time = time '23:00'
      and settings.timezone = 'Asia/Manila'
  ) as default_schedule_is_present,
  (
    select jsonb_build_object(
      'business_date', settings.business_date,
      'opening_time', settings.opening_time,
      'normal_closing_time', settings.normal_closing_time,
      'extended_closing_time', settings.extended_closing_time,
      'extended_closing_enabled', settings.extended_closing_enabled,
      'timezone', settings.timezone,
      'effective_closing_at',
        public.business_day_closing_at(settings.business_date)
    )
    from public.business_day_settings settings
    where settings.business_date = (clock_timestamp() at time zone 'Asia/Manila')::date
  ) as todays_business_schedule;
