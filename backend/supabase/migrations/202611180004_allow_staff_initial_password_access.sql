begin;

-- Active Staff may use the Employee ID initial password without being forced
-- to change it. Branch access remains limited to their assigned active branch.
create or replace function public.can_access_branch(target_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.branches
    where id = target_branch and active
  )
  and exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active
      and (
        role = 'owner'
        or (role = 'staff' and branch_id = target_branch)
      )
  );
$$;

revoke all on function public.can_access_branch(uuid) from public, anon;
grant execute on function public.can_access_branch(uuid) to authenticated;
alter function public.can_access_branch(uuid) owner to postgres;

notify pgrst, 'reload schema';
commit;
