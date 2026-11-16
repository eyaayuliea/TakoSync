begin;

alter table public.profiles
  add column if not exists employee_id text;

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create or replace function public.generate_employee_id()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  candidate text;
  random_bytes bytea;
  random_number bigint;
begin
  loop
    random_bytes := extensions.gen_random_bytes(4);
    random_number := (
      get_byte(random_bytes, 0)::bigint * 16777216
      + get_byte(random_bytes, 1)::bigint * 65536
      + get_byte(random_bytes, 2)::bigint * 256
      + get_byte(random_bytes, 3)::bigint
    ) % 1000000;
    candidate := 'EMP-' || to_char(current_date, 'YYYY') || '-' || lpad(random_number::text, 6, '0');

    exit when not exists (
      select 1 from public.profiles where employee_id = candidate
    );
  end loop;
end;
$$;

revoke all on function public.generate_employee_id() from public, anon, authenticated;

update public.profiles
set employee_id = public.generate_employee_id()
where role = 'staff'
  and employee_id is null;

-- Owners are never employees. This is idempotent and prevents older bootstrap
-- data from violating the new role/Employee ID invariant.
update public.profiles
set employee_id = null,
    must_change_password = false
where role = 'owner'
  and (employee_id is not null or must_change_password is distinct from false);

alter table public.profiles
  add constraint profiles_employee_id_format
  check (
    (role = 'owner' and employee_id is null)
    or (role = 'staff' and employee_id ~ '^EMP-[0-9]{4}-[0-9]{6}$')
  );

alter table public.profiles
  add constraint profiles_employee_id_unique unique (employee_id);

create or replace function public.bootstrap_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.profiles (
    id, email, full_name, role, branch_id, active, employee_id, must_change_password
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'staff',
    '00000000-0000-4000-8000-000000000001',
    false,
    public.generate_employee_id(),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

commit;
