begin;

-- Verify that the current user has an active staff profile
-- and a valid business session.
create or replace function private.is_active_staff_at(p_now timestamptz)
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

  return private.business_session_is_active_at(
    v_user_id,
    v_session_id,
    p_now
  )
  and exists (
    select 1
    from public.profiles
    where id = v_user_id
      and role = 'staff'
      and active
  );
end;
$$;

-- Narrow public wrapper for RLS policies.
create or replace function public.is_active_staff()
returns boolean
language sql
volatile
security definer
set search_path = public, private, pg_temp
as $$
  select private.is_active_staff_at(clock_timestamp());
$$;

-- Keep the private helper inaccessible to client roles.
revoke all on function private.is_active_staff_at(timestamptz)
  from public, anon, authenticated;

-- Expose only the narrow authorization check to authenticated users.
revoke all on function public.is_active_staff()
  from public, anon, authenticated;

grant execute on function public.is_active_staff()
  to authenticated;

alter function private.is_active_staff_at(timestamptz)
  owner to postgres;

alter function public.is_active_staff()
  owner to postgres;

-- Allow authenticated users to issue SELECT and UPDATE queries.
-- RLS policies restrict reads to active staff/owners and updates to active owners.
grant select, update on public.owner_inventory_settings to authenticated;

-- Replace the policy's direct profiles query with the secure helper.
drop policy if exists owner_inventory_settings_staff_read
  on public.owner_inventory_settings;

create policy owner_inventory_settings_staff_read
on public.owner_inventory_settings
for select to authenticated
using (public.is_active_staff());

notify pgrst, 'reload schema';

commit;
