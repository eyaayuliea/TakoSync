begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '11111111-aaaa-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'business-day-owner-test@takosync.invalid',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Business Day Owner"}'
  ),
  (
    '22222222-bbbb-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'business-day-staff-test@takosync.invalid',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Business Day Staff"}'
  );

update public.profiles
set role = 'owner', branch_id = null, active = true
where id = '11111111-aaaa-4111-8111-111111111111';
update public.profiles
set role = 'staff', branch_id = '00000000-0000-4000-8000-000000000001', active = true
where id = '22222222-bbbb-4222-8222-222222222222';

update public.business_day_settings
set normal_closing_time = time '23:59:58',
    extended_closing_time = time '23:59:59',
    extended_closing_enabled = true
where business_date = (clock_timestamp() at time zone 'Asia/Manila')::date;

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aaaaaaaa-1111-4111-8111-111111111111', '11111111-aaaa-4111-8111-111111111111', now(), now()),
  ('bbbbbbbb-2222-4222-8222-222222222222', '22222222-bbbb-4222-8222-222222222222', now(), now()),
  ('cccccccc-3333-4333-8333-333333333333', '11111111-aaaa-4111-8111-111111111111', now(), now()),
  ('dddddddd-4444-4444-8444-444444444444', '11111111-aaaa-4111-8111-111111111111', now(), now());

insert into public.business_day_settings (
  business_date, opening_time, normal_closing_time, extended_closing_time,
  extended_closing_enabled, timezone
) values (
  date '2031-02-04', time '16:00', time '22:00', time '23:00', false, 'Asia/Manila'
);
insert into public.business_day_sessions (session_id, user_id, business_date) values
  (
    'aaaaaaaa-1111-4111-8111-111111111111',
    '11111111-aaaa-4111-8111-111111111111',
    date '2031-02-04'
  ),
  (
    'bbbbbbbb-2222-4222-8222-222222222222',
    '22222222-bbbb-4222-8222-222222222222',
    date '2031-02-04'
  ),
  (
    'dddddddd-4444-4444-8444-444444444444',
    '11111111-aaaa-4111-8111-111111111111',
    date '2031-02-03'
  );

select is(
  public.business_day_closing_at(date '2031-02-03'),
  '2031-02-03 22:00:00 Asia/Manila'::timestamptz,
  'an unconfigured business date uses the normal 10 PM Manila close'
);
select is(
  public.business_day_closing_at(date '2031-02-04'),
  '2031-02-04 22:00:00 Asia/Manila'::timestamptz,
  'a configured normal schedule closes at 10 PM Manila time'
);
select ok(
  public.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 21:59:59.999999 Asia/Manila'::timestamptz
  ),
  'a normal session is active immediately before 10 PM'
);
select ok(
  not public.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 22:00:00 Asia/Manila'::timestamptz
  ),
  'a normal session is inactive at exactly 10 PM'
);
select ok(
  not public.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 22:00:00.000001 Asia/Manila'::timestamptz
  ),
  'a normal session remains inactive after 10 PM'
);

update public.business_day_settings
set extended_closing_enabled = true
where business_date = date '2031-02-04';
select is(
  public.business_day_closing_at(date '2031-02-04'),
  '2031-02-04 23:00:00 Asia/Manila'::timestamptz,
  'an owner-enabled extension moves the effective close to 11 PM'
);
select ok(
  public.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 22:30:00 Asia/Manila'::timestamptz
  ),
  'an extended session remains active after the normal close'
);
select ok(
  not public.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 23:00:00 Asia/Manila'::timestamptz
  ),
  'an extended session is inactive at exactly 11 PM'
);
select ok(
  public.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 22:59:59.999999 Asia/Manila'::timestamptz
  ),
  'an extension remains active through the final microsecond before 11 PM'
);
select is(
  public.business_day_closing_at(date '2031-02-04'),
  '2031-02-04 15:00:00+00'::timestamptz,
  'the stored 11 PM deadline converts to the correct UTC instant'
);
select ok(
  not has_table_privilege('authenticated', 'public.business_day_sessions', 'UPDATE'),
  'clients cannot update business session records or their authorization deadline'
);
select ok(
  not has_table_privilege('authenticated', 'public.business_day_settings', 'UPDATE'),
  'clients cannot directly update business closing settings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-bbbb-4222-8222-222222222222', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-bbbb-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}',
  true
);
select is(
  (select count(*)::integer from public.branches),
  0,
  'RLS rejects protected data access for a session from another business date'
);
select throws_ok(
  $$select public.set_business_day_settings(
    date '2031-02-05', time '16:00', time '22:00', time '23:00', true
  )$$,
  '42501',
  'Only an active owner may change business hours',
  'staff cannot change business closing settings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-aaaa-4111-8111-111111111111', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-aaaa-4111-8111-111111111111","role":"authenticated","session_id":"cccccccc-3333-4333-8333-333333333333"}',
  true
);
select is(
  (public.authorize_business_session() ->> 'active')::boolean,
  true,
  'an owner can register a same-day Supabase Auth session'
);
select lives_ok(
  $$select public.set_business_day_settings(
    date '2031-02-05', time '16:00', time '22:00', time '23:00', true
  )$$,
  'an active owner can configure an extended close for a business date'
);
select is(
  (public.business_session_status() ->> 'extended_closing_enabled')::boolean,
  true,
  'the Owner RPC reports the persisted extension setting for the current session'
);

reset role;
select is(
  public.business_day_closing_at(date '2031-02-05'),
  '2031-02-05 23:00:00 Asia/Manila'::timestamptz,
  'the Owner RPC persists the 11 PM extension for the requested business date'
);
set local role authenticated;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-aaaa-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-1111-4111-8111-111111111111"}',
  true
);
reset role;
select ok(
  private.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 21:59:59.999999 Asia/Manila'::timestamptz
  ),
  'the Owner session is valid immediately before normal closing'
);
select lives_ok(
  $$select private.set_business_day_settings_at(
    '2031-02-04 21:59:59.999999 Asia/Manila'::timestamptz,
    date '2031-02-04', time '16:00', time '22:00', time '23:00', true
  )$$,
  'the Owner can enable the current-date extension before normal closing'
);
select ok(
  not private.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'dddddddd-4444-4444-8444-444444444444',
    '2031-02-03 22:00:00 Asia/Manila'::timestamptz
  ),
  'a normal Owner session is expired at exactly 10 PM'
);
select throws_ok(
  $$select private.set_business_day_settings_at(
    '2031-02-04 22:00:00 Asia/Manila'::timestamptz,
    date '2031-02-04', time '16:00', time '22:00', time '23:00', false
  )$$,
  '42501',
  'The normal business closing time has passed; current-date settings cannot be changed',
  'current-date mutation is rejected exactly at normal closing'
);
select ok(
  private.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 22:30:00 Asia/Manila'::timestamptz
  ),
  'an Owner session remains valid after 10 PM while the extension is enabled'
);
select throws_ok(
  $$select private.set_business_day_settings_at(
    '2031-02-04 22:30:00 Asia/Manila'::timestamptz,
    date '2031-02-04', time '16:00', time '22:00', time '23:00', false
  )$$,
  '42501',
  'The normal business closing time has passed; current-date settings cannot be changed',
  'current-date mutation is rejected after normal closing while the extension is active'
);
select ok(
  private.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 22:59:59.999999 Asia/Manila'::timestamptz
  ),
  'the extended Owner session is valid through the final microsecond before 11 PM'
);
select ok(
  not private.business_session_is_active_at(
    '11111111-aaaa-4111-8111-111111111111',
    'aaaaaaaa-1111-4111-8111-111111111111',
    '2031-02-04 23:00:00 Asia/Manila'::timestamptz
  ),
  'the extended Owner session is expired at exactly 11 PM'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-aaaa-4111-8111-111111111111","role":"authenticated","session_id":"aaaaaaaa-1111-4111-8111-111111111111"}',
  true
);
select throws_ok(
  $$select public.authorize_inventory_discrepancy_adjustment(
    '44444444-4444-4444-8444-444444444444', 'Expired session attempt'
  )$$,
  '42501',
  'The business session has expired; authenticate again for the next business date',
  'an expired business session cannot call a protected RPC'
);

select * from finish();
rollback;
