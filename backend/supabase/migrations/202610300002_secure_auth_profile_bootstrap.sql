alter table public.profiles
  drop constraint if exists staff_requires_branch;

alter table public.profiles
  add constraint staff_requires_branch
  check (role <> 'staff' or branch_id is not null or not active);

create or replace function public.bootstrap_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, role, branch_id, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'staff',
    null,
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.protect_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null and not public.is_active_owner() then
      raise exception 'Only an active owner may change user profiles';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT'
    and new.id = auth.uid()
    and new.role = 'staff'
    and new.branch_id is null
    and not new.active then
    return new;
  end if;
  if tg_op = 'INSERT'
    and new.id = auth.uid()
    and new.role = 'staff'
    and new.branch_id = '00000000-0000-4000-8000-000000000001' then
    return new;
  end if;
  if auth.uid() is not null and not public.is_active_owner() then
    raise exception 'Only an active owner may change user profiles';
  end if;
  return new;
end;
$$;
