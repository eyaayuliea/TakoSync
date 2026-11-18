alter table public.batter_preparation_batches
  add column if not exists preparation_date date;

update public.batter_preparation_batches
set preparation_date = created_at at time zone 'Asia/Manila'
where preparation_date is null;

alter table public.batter_preparation_batches
  alter column preparation_date set default (current_timestamp at time zone 'Asia/Manila')::date,
  alter column preparation_date set not null;

create or replace function public.prepare_batter_batch(
  p_branch_id uuid,
  p_batch_reference text,
  p_preparation_date date
)
returns public.batter_preparation_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.batter_preparation_batches%rowtype;
begin
  select * into v_batch
  from public.prepare_batter_batch(p_branch_id, p_batch_reference);

  update public.batter_preparation_batches
  set preparation_date = p_preparation_date
  where batch_reference = v_batch.batch_reference
  returning * into v_batch;

  return v_batch;
end;
$$;

revoke all on function public.prepare_batter_batch(uuid, text, date) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text, date) to authenticated;
