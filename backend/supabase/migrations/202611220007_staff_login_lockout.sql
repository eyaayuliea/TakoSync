-- ST-01 c2, c3 (Charter Rev 8, #53): a Staff account is locked for 15 minutes
-- after 5 failed password attempts. The staff-auth Edge Function counts
-- failures for login, the lock screen, and password changes, using the
-- service-role functions below. The owner's password reset unlocks the account.
begin;

alter table public.profiles
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

alter table public.profiles drop constraint if exists profiles_failed_login_attempts_check;
alter table public.profiles
  add constraint profiles_failed_login_attempts_check check (failed_login_attempts >= 0);

comment on column public.profiles.failed_login_attempts is
  'ST-01 c3: consecutive failed password attempts since the last successful one or the last lock.';
comment on column public.profiles.locked_until is
  'ST-01 c3: the account cannot sign in until this time (15 minutes after the 5th failed attempt).';

-- The lock state of one profile.
create or replace function public.staff_login_lock_status(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'locked', coalesce(locked_until > now(), false),
    'locked_until', case when locked_until > now() then locked_until end,
    'failed_attempts', case when locked_until is not null and locked_until <= now() then 0 else failed_login_attempts end
  )
  from public.profiles
  where id = p_profile_id;
$$;

-- Counts one failed attempt; the 5th within a lock window locks the account
-- for 15 minutes. An expired lock starts a new count.
create or replace function public.register_staff_login_failure(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
  c_max_attempts constant integer := 5;
  c_lock_minutes constant integer := 15;
begin
  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    return jsonb_build_object('locked', false, 'failed_attempts', 0, 'attempts_remaining', c_max_attempts);
  end if;
  if v_profile.locked_until is not null and v_profile.locked_until > now() then
    return jsonb_build_object('locked', true, 'locked_until', v_profile.locked_until,
      'failed_attempts', v_profile.failed_login_attempts, 'attempts_remaining', 0);
  end if;

  v_attempts := case
    when v_profile.locked_until is not null then 1
    else v_profile.failed_login_attempts + 1
  end;
  v_locked_until := case when v_attempts >= c_max_attempts then now() + make_interval(mins => c_lock_minutes) end;

  update public.profiles
  set failed_login_attempts = v_attempts,
      locked_until = v_locked_until,
      updated_at = now()
  where id = p_profile_id;

  if v_locked_until is not null then
    insert into public.audit_logs (user_id, branch_id, action, description)
    values (p_profile_id, v_profile.branch_id, 'auth.account_locked',
      format('Account locked until %s after %s failed attempts', v_locked_until, v_attempts));
  end if;

  return jsonb_build_object(
    'locked', v_locked_until is not null,
    'locked_until', v_locked_until,
    'failed_attempts', v_attempts,
    'attempts_remaining', greatest(c_max_attempts - v_attempts, 0)
  );
end;
$$;

-- A successful sign-in or an owner password reset clears the count and any lock.
create or replace function public.clear_staff_login_failures(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.profiles
  set failed_login_attempts = 0, locked_until = null, updated_at = now()
  where id = p_profile_id and (failed_login_attempts <> 0 or locked_until is not null);
$$;

-- Only the staff-auth Edge Function (service role) may call these.
revoke all on function public.staff_login_lock_status(uuid) from public, anon, authenticated;
revoke all on function public.register_staff_login_failure(uuid) from public, anon, authenticated;
revoke all on function public.clear_staff_login_failures(uuid) from public, anon, authenticated;
grant execute on function public.staff_login_lock_status(uuid) to service_role;
grant execute on function public.register_staff_login_failure(uuid) to service_role;
grant execute on function public.clear_staff_login_failures(uuid) to service_role;
alter function public.staff_login_lock_status(uuid) owner to postgres;
alter function public.register_staff_login_failure(uuid) owner to postgres;
alter function public.clear_staff_login_failures(uuid) owner to postgres;

notify pgrst, 'reload schema';
commit;
