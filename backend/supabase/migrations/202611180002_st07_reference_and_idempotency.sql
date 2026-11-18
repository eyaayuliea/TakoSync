begin;

create sequence if not exists public.batter_batch_reference_seq;

create or replace function public.next_batter_batch_reference()
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select format(
    'BATCH-%s-%s',
    to_char(current_timestamp at time zone 'Asia/Manila', 'YYYYMMDD'),
    lpad(nextval('public.batter_batch_reference_seq')::text, 4, '0')
  )
$$;

revoke all on function public.next_batter_batch_reference() from public, anon;
grant execute on function public.next_batter_batch_reference() to authenticated;
alter function public.next_batter_batch_reference() owner to postgres;

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
  v_reference text := nullif(btrim(p_batch_reference), '');
  v_batch public.batter_preparation_batches%rowtype;
  v_existing boolean;
begin
  if v_reference is null then
    v_reference := public.next_batter_batch_reference();
  end if;

  select exists(
    select 1 from public.batter_preparation_batches
    where batch_reference = v_reference
  ) into v_existing;

  select * into v_batch
  from public.prepare_batter_batch(p_branch_id, v_reference, 5);

  -- Never rewrite a committed batch's preparation date on a network retry.
  if not v_existing then
    update public.batter_preparation_batches
    set preparation_date = coalesce(p_preparation_date, (current_timestamp at time zone 'Asia/Manila')::date)
    where batch_reference = v_batch.batch_reference
    returning * into v_batch;
  end if;

  return v_batch;
end;
$$;

create or replace function public.prepare_batter_batch(
  p_branch_id uuid,
  p_batch_reference text,
  p_prepared_quantity integer,
  p_preparation_date date
)
returns public.batter_preparation_batches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_prepared_quantity is distinct from 5 then
    raise exception 'Prepared batter batch quantity must be exactly 5 bottles';
  end if;
  return public.prepare_batter_batch(p_branch_id, p_batch_reference, p_preparation_date);
end;
$$;

revoke all on function public.prepare_batter_batch(uuid, text, date) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text, date) to authenticated;
revoke all on function public.prepare_batter_batch(uuid, text, integer, date) from public, anon;
grant execute on function public.prepare_batter_batch(uuid, text, integer, date) to authenticated;
alter function public.prepare_batter_batch(uuid, text, date) owner to postgres;

notify pgrst, 'reload schema';
commit;
