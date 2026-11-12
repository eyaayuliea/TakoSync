alter table public.profiles
  add column if not exists username text;

do $$
declare
  v_conflict text;
begin
  if exists (
    select 1
    from public.profiles
    where role = 'owner'
      and username is not null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Staff username backfill found a non-null Owner username; Owner usernames must remain NULL';
  end if;

  select string_agg(id::text, ', ' order by id)
  into v_conflict
  from public.profiles
  where role = 'staff'
    and nullif(btrim(full_name), '') is null;

  if v_conflict is not null then
    raise exception using
      errcode = '23514',
      message = format(
        'Staff username backfill cannot continue because these Staff profiles have empty employee names: %s',
        v_conflict
      );
  end if;

  with effective_usernames as (
    select
      lower(regexp_replace(
        btrim(full_name),
        '\s+',
        ' ',
        'g'
      )) || '_staff' as normalized_username
    from public.profiles
    where role = 'staff'
  )
  select normalized_username
  into v_conflict
  from effective_usernames
  group by normalized_username
  having count(*) > 1
  limit 1;

  if v_conflict is not null then
    raise exception using
      errcode = '23505',
      message = format(
        'Staff username backfill found duplicate generated usernames after normalization: %s',
        v_conflict
      );
  end if;
end;
$$;

update public.profiles
set username = lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')) || '_staff'
where role = 'staff'
  and nullif(btrim(username), '') is null;

create unique index if not exists profiles_staff_username_unique
  on public.profiles (lower(btrim(username)))
  where username is not null;

comment on column public.profiles.username is
  'Normalized Staff employee name with the _staff suffix used for Staff login; Owner usernames remain null.';
