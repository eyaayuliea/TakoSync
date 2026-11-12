begin;

-- Allow the SECURITY DEFINER function owner to read and maintain
-- business-day settings without granting access to client roles.
grant select, insert, update
on table public.business_day_settings
to postgres;

commit;
