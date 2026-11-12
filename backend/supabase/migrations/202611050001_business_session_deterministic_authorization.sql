begin;

create schema if not exists private;
alter schema private owner to postgres;
revoke all on schema private from public, anon, authenticated;

create or replace function private.business_session_is_active_at(
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
          select 1
          from auth.sessions auth_session
          where auth_session.id = p_session_id
            and auth_session.user_id = p_user_id
        )
    );
$$;

create or replace function private.is_active_owner_at(p_now timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id_text text := auth.jwt() ->> 'session_id';
  v_session_id uuid;
begin
  if v_user_id is null
    or v_session_id_text is null
    or v_session_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  v_session_id := v_session_id_text::uuid;

  return private.business_session_is_active_at(v_user_id, v_session_id, p_now)
    and exists (
      select 1
      from public.profiles
      where id = v_user_id
        and role = 'owner'
        and active
    );
end;
$$;

create or replace function private.set_business_day_settings_at(
  p_now timestamptz,
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
  v_today date;
  v_normal_closing_time time without time zone;
begin
  if p_now is null then
    raise exception 'A server timestamp is required';
  end if;

  v_today := (p_now at time zone 'Asia/Manila')::date;

  if not private.is_active_owner_at(p_now) then
    raise exception using
      errcode = '42501',
      message = 'Only an active owner may change business hours';
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

  if p_business_date = v_today then
    select settings.normal_closing_time
    into v_normal_closing_time
    from public.business_day_settings settings
    where settings.business_date = v_today;

    if p_now >= (
      v_today + coalesce(v_normal_closing_time, time '22:00')
    ) at time zone 'Asia/Manila' then
      raise exception using
        errcode = '42501',
        message = 'The normal business closing time has passed; current-date settings cannot be changed';
    end if;
  end if;

  insert into public.business_day_settings (
    business_date, opening_time, normal_closing_time,
    extended_closing_time, extended_closing_enabled, timezone, updated_by, updated_at
  ) values (
    p_business_date, p_opening_time, p_normal_closing_time,
    p_extended_closing_time, p_extended_closing_enabled, 'Asia/Manila', auth.uid(), p_now
  )
  on conflict (business_date) do update
  set opening_time = excluded.opening_time,
      normal_closing_time = excluded.normal_closing_time,
      extended_closing_time = excluded.extended_closing_time,
      extended_closing_enabled = excluded.extended_closing_enabled,
      timezone = 'Asia/Manila',
      updated_by = auth.uid(),
      updated_at = p_now
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function private.business_session_is_active_at(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function private.is_active_owner_at(timestamptz)
  from public, anon, authenticated;
revoke all on function private.set_business_day_settings_at(
  timestamptz, date, time without time zone, time without time zone,
  time without time zone, boolean
) from public, anon, authenticated;

create or replace function public.business_session_is_active_at(
  p_user_id uuid,
  p_session_id uuid,
  p_now timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.business_session_is_active_at(p_user_id, p_session_id, p_now);
$$;

create or replace function public.is_business_session_active()
returns boolean
language plpgsql
volatile
security definer
set search_path = public, private, pg_temp
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

  return private.business_session_is_active_at(auth.uid(), v_session_id, v_now);
end;
$$;

create or replace function public.is_active_owner()
returns boolean
language sql
volatile
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_active_owner_at(clock_timestamp());
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
set search_path = public, private, pg_temp
as $$
declare
  v_settings public.business_day_settings;
  v_now timestamptz := clock_timestamp();
begin
  select *
  into v_settings
  from private.set_business_day_settings_at(
    v_now,
    p_business_date,
    p_opening_time,
    p_normal_closing_time,
    p_extended_closing_time,
    p_extended_closing_enabled
  );

  return v_settings;
end;
$$;

alter function private.business_session_is_active_at(uuid, uuid, timestamptz) owner to postgres;
alter function private.is_active_owner_at(timestamptz) owner to postgres;
alter function private.set_business_day_settings_at(
  timestamptz, date, time without time zone, time without time zone,
  time without time zone, boolean
) owner to postgres;
alter function public.business_session_is_active_at(uuid, uuid, timestamptz) owner to postgres;
alter function public.is_business_session_active() owner to postgres;
alter function public.is_active_owner() owner to postgres;
alter function public.set_business_day_settings(
  date, time without time zone, time without time zone,
  time without time zone, boolean
) owner to postgres;

notify pgrst, 'reload schema';

commit;
