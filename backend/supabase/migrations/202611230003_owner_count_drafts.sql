-- OM-20 c1: the owner's Physical Inventory Count list shows each count with
-- its status, and the statuses include Draft. A count saved as a draft lives in
-- daily_stock_check_drafts, which only the staff member who saved it can read.
--
-- list_owner_count_drafts(branch): the owner reads every saved draft, one row
-- per counted line, with the branch, the staff member, the expected quantity
-- saved with the draft, the quantity counted so far, and when it was saved.
-- Read-only; drafts stay private to staff for every other purpose.
begin;

create or replace function public.list_owner_count_drafts(p_branch_id uuid default null)
returns table (
  draft_id uuid,
  branch_id uuid,
  staff_name text,
  check_date date,
  saved_at timestamptz,
  ingredient_id text,
  ingredient_name text,
  unit text,
  expected_quantity numeric,
  actual_quantity numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_business_session_active() then
    raise exception using errcode = '42501', message = 'Authentication session is not active';
  end if;
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and active and role = 'owner') then
    raise exception using errcode = '42501', message = 'Only the owner can view count drafts';
  end if;

  return query
  select
    d.draft_id,
    d.branch_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Staff account'),
    d.check_date,
    d.updated_at,
    line ->> 'ingredient_id',
    coalesce(i.name, line ->> 'ingredient_id'),
    line ->> 'unit',
    (line ->> 'recorded_quantity')::numeric,
    nullif(line ->> 'physical_quantity', '')::numeric
  from public.daily_stock_check_drafts d
  join public.profiles p on p.id = d.staff_id
  cross join lateral jsonb_array_elements(d.lines) as line
  left join public.ingredients i on i.id = line ->> 'ingredient_id'
  where (p_branch_id is null or d.branch_id = p_branch_id)
    and public.can_access_branch(d.branch_id)
  order by d.updated_at desc, coalesce(i.name, line ->> 'ingredient_id');
end;
$$;

revoke all on function public.list_owner_count_drafts(uuid) from public, anon;
grant execute on function public.list_owner_count_drafts(uuid) to authenticated;
alter function public.list_owner_count_drafts(uuid) owner to postgres;

select private.declare_endpoint('rpc/list_owner_count_drafts', array['COUNT_REVIEW'], '{}', 'Owner reads saved count drafts for the Physical Inventory Count list (OM-20 c1).');

notify pgrst, 'reload schema';
commit;
