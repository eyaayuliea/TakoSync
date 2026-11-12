begin;

-- Keep internal business-session helpers inaccessible to client roles.
revoke all on function private.business_session_is_active_at(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function private.is_active_owner_at(timestamptz)
  from public, anon, authenticated;
revoke all on function private.set_business_day_settings_at(
  timestamptz, date, time without time zone, time without time zone,
  time without time zone, boolean
) from public, anon, authenticated;

-- Public timestamp-based helper is internal and must not be callable by clients.
revoke all on function public.business_session_is_active_at(uuid, uuid, timestamptz)
  from public, anon, authenticated;

-- Preserve authenticated access to application/RLS functions.
revoke all on function public.is_business_session_active()
  from public, anon, authenticated;
grant execute on function public.is_business_session_active()
  to authenticated;

revoke all on function public.is_active_owner()
  from public, anon, authenticated;
grant execute on function public.is_active_owner()
  to authenticated;

revoke all on function public.set_business_day_settings(
  date, time without time zone, time without time zone,
  time without time zone, boolean
) from public, anon, authenticated;
grant execute on function public.set_business_day_settings(
  date, time without time zone, time without time zone,
  time without time zone, boolean
) to authenticated;

-- Restore the intended function ownership.
alter function private.business_session_is_active_at(uuid, uuid, timestamptz)
  owner to postgres;
alter function private.is_active_owner_at(timestamptz)
  owner to postgres;
alter function private.set_business_day_settings_at(
  timestamptz, date, time without time zone, time without time zone,
  time without time zone, boolean
) owner to postgres;

alter function public.business_session_is_active_at(uuid, uuid, timestamptz)
  owner to postgres;
alter function public.is_business_session_active()
  owner to postgres;
alter function public.is_active_owner()
  owner to postgres;
alter function public.set_business_day_settings(
  date, time without time zone, time without time zone,
  time without time zone, boolean
) owner to postgres;

notify pgrst, 'reload schema';

commit;
