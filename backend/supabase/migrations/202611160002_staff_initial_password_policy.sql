begin;

-- Staff who still have their generated Employee ID password may authenticate
-- only far enough to complete the required password change. The permanent
-- Employee ID is not changed by this policy.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

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
        and (
          role = 'owner'
          or (role = 'staff' and not coalesce(must_change_password, false) and branch_id = target_branch)
        )
    );
$$;

revoke all on function public.can_access_branch(uuid) from public, anon;
grant execute on function public.can_access_branch(uuid) to authenticated;
alter function public.can_access_branch(uuid) owner to postgres;

commit;
