begin;

grant select, update on table public.profiles to service_role;
grant select on table public.branches to service_role;

commit;
