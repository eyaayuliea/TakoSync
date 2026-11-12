begin;

grant insert, update
on table public.business_day_settings
to postgres;

commit;
