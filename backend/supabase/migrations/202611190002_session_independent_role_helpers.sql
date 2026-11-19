begin;

-- 202611180000 removed business-hours expiration as an authentication
-- boundary and stopped creating public.business_day_sessions rows, but two
-- helpers still required such a row for the current business date:
--   * private.is_active_staff_at  (RLS: owner_inventory_settings_staff_read)
--   * private.is_active_owner_at  (public.set_business_day_settings)
-- With no session row they always returned false, so Staff could not read the
-- Owner-configured expiration alert settings (Staff Inventory failed to load)
-- and Owners could not save business-day settings. Both helpers now validate
-- only the live Supabase Auth session and the active profile role, consistent
-- with public.is_business_session_active(), public.is_active_owner() and
-- public.can_access_branch(). Signatures, owners and grants are unchanged.

create or replace function private.is_active_staff_at(p_now timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_business_session_active()
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'staff'
        and active
    );
$$;

create or replace function private.is_active_owner_at(p_now timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_business_session_active()
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role = 'owner'
        and active
    );
$$;

notify pgrst, 'reload schema';

commit;
