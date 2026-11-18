begin;

create table public.daily_stock_check_drafts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique,
  branch_id uuid not null references public.branches(id),
  staff_id uuid not null references public.profiles(id),
  check_date date not null,
  remarks text not null default '',
  verified boolean not null default false,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create unique index daily_stock_check_drafts_staff_branch_uidx
  on public.daily_stock_check_drafts (staff_id, branch_id);
create index daily_stock_check_drafts_branch_updated_idx
  on public.daily_stock_check_drafts (branch_id, updated_at desc);

alter table public.daily_stock_check_drafts enable row level security;

create policy daily_stock_check_drafts_staff_read
  on public.daily_stock_check_drafts
  for select to authenticated
  using (staff_id = (select auth.uid()) and public.can_access_branch(branch_id));

revoke all on public.daily_stock_check_drafts from public, anon, authenticated;
grant select on public.daily_stock_check_drafts to authenticated;

create or replace function public.save_daily_stock_check_draft(
  p_draft_id uuid,
  p_branch_id uuid,
  p_check_date date,
  p_remarks text,
  p_verified boolean,
  p_lines jsonb
)
returns public.daily_stock_check_drafts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_inventory public.branch_inventory%rowtype;
  v_line jsonb;
  v_draft public.daily_stock_check_drafts%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and active and role = 'staff';
  if not found then
    raise exception using errcode = '42501', message = 'An active Staff account is required';
  end if;
  if p_draft_id is null or p_branch_id is null then
    raise exception 'A draft and assigned branch are required';
  end if;
  if not public.can_access_branch(p_branch_id) or v_profile.branch_id <> p_branch_id then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one inventory line is required';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or v_line ->> 'ingredient_id' is null
      or v_line ->> 'recorded_quantity' is null
      or v_line ->> 'inventory_revision' is null
      or v_line ->> 'unit' is null then
      raise exception 'Each draft line requires an ingredient, recorded quantity, revision, and unit';
    end if;
    select * into v_inventory
    from public.branch_inventory
    where branch_id = p_branch_id and ingredient_id = v_line ->> 'ingredient_id';
    if not found then
      raise exception 'Ingredient is not configured for this branch';
    end if;
    if v_inventory.quantity <> (v_line ->> 'recorded_quantity')::numeric
      or v_inventory.inventory_revision <> (v_line ->> 'inventory_revision')::bigint then
      raise exception 'Inventory changed after this count began; restart the count before saving the draft';
    end if;
  end loop;

  insert into public.daily_stock_check_drafts (
    draft_id, branch_id, staff_id, check_date, remarks, verified, lines
  ) values (
    p_draft_id, p_branch_id, v_profile.id, coalesce(p_check_date, current_date),
    coalesce(p_remarks, ''), coalesce(p_verified, false), p_lines
  )
  on conflict (staff_id, branch_id) do update set
    draft_id = excluded.draft_id,
    check_date = excluded.check_date,
    remarks = excluded.remarks,
    verified = excluded.verified,
    lines = excluded.lines,
    updated_at = clock_timestamp()
  returning * into v_draft;

  return v_draft;
end;
$$;

create or replace function public.delete_daily_stock_check_draft(
  p_draft_id uuid,
  p_branch_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'staff' and branch_id = p_branch_id
  ) or not public.can_access_branch(p_branch_id) then
    raise exception using errcode = '42501', message = 'Branch access denied';
  end if;
  delete from public.daily_stock_check_drafts
  where draft_id = p_draft_id and branch_id = p_branch_id and staff_id = (select auth.uid());
  return true;
end;
$$;

revoke all on function public.save_daily_stock_check_draft(uuid, uuid, date, text, boolean, jsonb) from public, anon;
grant execute on function public.save_daily_stock_check_draft(uuid, uuid, date, text, boolean, jsonb) to authenticated;
revoke all on function public.delete_daily_stock_check_draft(uuid, uuid) from public, anon;
grant execute on function public.delete_daily_stock_check_draft(uuid, uuid) to authenticated;

commit;
