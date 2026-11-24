// @ts-nocheck
type AccountInput = {
  id?: string;
  username?: string;
  branchId?: string;
  active?: boolean;
};

type HandlerOptions = {
  createClient: (...args: any[]) => any;
  getEnv: (name: string) => string | undefined;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeUsername(value: string) {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!normalized) return '';
  return normalized.endsWith('_staff') ? normalized : `${normalized}_staff`;
}

function normalizeOwnerUsername(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function normalizeOwnerEmail(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function usernameHash(value: string) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function authAlias(username: string) {
  return `staff-${usernameHash(username)}@auth.takosync.internal`;
}

function inputString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isEmployeeId(value: unknown): value is string {
  return typeof value === 'string' && /^EMP-[0-9]{4}-[0-9]{6}$/.test(value);
}

/**
 * A throwaway password for the moment between creating the Auth user and setting
 * the Employee ID as the initial password. Supabase Auth hashes with bcrypt,
 * which refuses passwords over 72 bytes, so this stays at 62 characters
 * (a UUID plus 16 random hex digits).
 */
export function temporaryPassword() {
  const extra = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `TakoSync-${crypto.randomUUID()}-${extra}`;
}

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
}

function getClients(options: HandlerOptions) {
  const url = options.getEnv('SUPABASE_URL');
  const serviceRoleKey = options.getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = options.getEnv('SUPABASE_ANON_KEY');
  if (!url || !serviceRoleKey || !anonKey) throw new Error('Staff authentication is not configured.');
  return {
    admin: options.createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    auth: options.createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    anonKey,
    url,
  };
}

// ST-01 c2, c3: 5 failed password attempts lock a Staff account for 15 minutes.
// The counters live in the database (migration 202611220007). Until it is
// applied the functions are missing and sign-in works without a lockout.
function isMissingFunction(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/** S2 AC-RBAC-04-05: best-effort audit of a denial this function decided. Never changes the response. */
async function auditDenial(admin, userId: string, endpoint: string, reason: string) {
  try {
    const { error } = await admin.rpc('log_service_access_denial', { p_user_id: userId, p_endpoint: endpoint, p_reason: reason });
    if (error && !isMissingFunction(error)) console.error('[staff-auth] denial audit failed', { code: error.code ?? null });
  } catch {
    console.error('[staff-auth] denial audit threw');
  }
}

async function lockoutRpc(admin, name: string, profileId: string) {
  try {
    const { data, error } = await admin.rpc(name, { p_profile_id: profileId });
    if (error) {
      if (!isMissingFunction(error)) {
        console.error('[staff-auth] lockout check failed', { name, code: error.code ?? null });
      }
      return null;
    }
    return data ?? null;
  } catch {
    console.error('[staff-auth] lockout check threw', { name });
    return null;
  }
}

function lockedResponse(lockedUntil: unknown) {
  return response({ ok: false, code: 'locked_account', lockedUntil: typeof lockedUntil === 'string' ? lockedUntil : null });
}

/**
 * Checks a Staff password with lockout counting. Returns 'ok', 'incorrect'
 * (with attempts left), or 'locked'. The session created by the check is
 * signed out again so it never replaces the caller's session.
 */
async function checkStaffPassword(
  profileId: string,
  password: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
  keepSession = false,
) {
  const status = await lockoutRpc(admin, 'staff_login_lock_status', profileId);
  if (status?.locked) return { result: 'locked' as const, lockedUntil: status.locked_until ?? null };

  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profileId);
  const authEmail = typeof authUserData?.user?.email === 'string' ? authUserData.user.email.trim() : '';
  if (authUserError || !authEmail || authUserData.user.id !== profileId) {
    throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
  }
  if (!password) {
    const failure = await lockoutRpc(admin, 'register_staff_login_failure', profileId);
    if (failure?.locked) return { result: 'locked' as const, lockedUntil: failure.locked_until ?? null };
    return { result: 'incorrect' as const, attemptsRemaining: failure?.attempts_remaining ?? null };
  }
  const { data, error } = await auth.auth.signInWithPassword({ email: authEmail, password });
  if (error) {
    const isInvalidCredentials =
      error.code === 'invalid_credentials' ||
      (error.status === 400 && error.message === 'Invalid login credentials');
    if (!isInvalidCredentials) {
      console.error('[staff-auth] Supabase Auth password check failed', { status: error.status ?? null, code: error.code ?? null });
      throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
    }
    const failure = await lockoutRpc(admin, 'register_staff_login_failure', profileId);
    if (failure?.locked) return { result: 'locked' as const, lockedUntil: failure.locked_until ?? null };
    return { result: 'incorrect' as const, attemptsRemaining: failure?.attempts_remaining ?? null };
  }
  if (status && Number(status.failed_attempts) > 0) {
    await lockoutRpc(admin, 'clear_staff_login_failures', profileId);
  }
  if (!keepSession && data?.session?.access_token) {
    try {
      await admin.auth.admin.signOut(data.session.access_token, 'local');
    } catch {
      // The check session expires on its own; it is never handed to the client.
    }
  }
  return { result: 'ok' as const, data };
}

async function requireOwner(
  request: Request,
  admin: ReturnType<HandlerOptions['createClient']>,
) {
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) throw new HttpError(401, 'Authentication is required.');

  let userData;
  let userError;
  try {
    ({ data: userData, error: userError } = await admin.auth.getUser(token));
  } catch {
    throw new HttpError(500, 'Unable to verify authorization.');
  }
  if (userError) {
    if (userError.status && userError.status >= 500) {
      throw new HttpError(500, 'Unable to verify authorization.');
    }
    throw new HttpError(401, 'Authentication is invalid or expired.');
  }
  if (!userData?.user) throw new HttpError(401, 'Authentication is invalid or expired.');

  let profileResult;
  try {
    profileResult = await admin.from('profiles')
      .select('id, role, active')
      .eq('id', userData.user.id)
      .maybeSingle();
  } catch {
    throw new HttpError(500, 'Unable to verify authorization.');
  }
  if (profileResult.error) throw new HttpError(500, 'Unable to verify authorization.');
  const profile = profileResult.data;
  if (!profile || profile.role !== 'owner' || !profile.active) {
    await auditDenial(admin, userData.user.id, 'staff-auth/owner-action', !profile ? 'DENY_NO_PROFILE' : !profile.active ? 'DENY_INACTIVE' : 'DENY_PERMISSION');
    throw new HttpError(403, 'Only an active Owner may manage Staff accounts.');
  }

  return userData.user.id;
}

async function login(usernameValue: string, password: string, auth: ReturnType<HandlerOptions['createClient']>, admin: ReturnType<HandlerOptions['createClient']>) {
  const username = normalizeUsername(usernameValue);
  if (!username) return response({ ok: false, code: 'unknown_username' });
  const { data: profile, error } = await admin.from('profiles')
    .select('id, employee_id, username, email, full_name, role, branch_id, active, must_change_password')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!profile || profile.role !== 'staff') return response({ ok: false, code: 'unknown_username' });
  if (!profile.active) return response({ ok: false, code: 'inactive_account' });
  const { data: branch, error: branchError } = await admin.from('branches')
    .select('id, city, code, active')
    .eq('id', profile.branch_id)
    .maybeSingle();
  if (branchError) throw branchError;
  if (!branch || !branch.active) throw new HttpError(403, 'The assigned Staff branch is inactive or unavailable.');
  let authUserResult;
  try {
    authUserResult = await admin.auth.admin.getUserById(profile.id);
  } catch (lookupError) {
    console.error('[staff-auth] Staff Auth identity lookup threw', {
      code: lookupError?.code ?? null,
      status: lookupError?.status ?? null,
    });
    throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
  }
  if (authUserResult.error || !authUserResult.data?.user) {
    console.error('[staff-auth] Staff Auth identity lookup failed', {
      code: authUserResult.error?.code ?? null,
      status: authUserResult.error?.status ?? null,
    });
    throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
  }
  const authUser = authUserResult.data.user;
  const authEmail = typeof authUser.email === 'string' ? authUser.email.trim() : '';
  if (authUser.id !== profile.id || !authEmail) {
    console.error('[staff-auth] Staff Auth identity lookup returned an invalid identity', {
      idMatchesProfile: authUser.id === profile.id,
      hasEmail: Boolean(authEmail),
    });
    throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
  }
  console.info('[staff-auth] Staff profile/Auth identity resolved', {
    profileFound: true,
    role: profile.role,
    active: profile.active,
    idMatchesProfile: authUser.id === profile.id,
    profileHasEmail: typeof profile.email === 'string' && Boolean(profile.email.trim()),
    authEmailResolved: true,
  });
  // ST-01 c3: a locked account is refused before the password is tried.
  const lockStatus = await lockoutRpc(admin, 'staff_login_lock_status', profile.id);
  if (lockStatus?.locked) return lockedResponse(lockStatus.locked_until);
  const { data, error: authError } = await auth.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (authError) {
    const isInvalidCredentials =
      authError.code === 'invalid_credentials' ||
      (authError.status === 400 && authError.message === 'Invalid login credentials');
    if (isInvalidCredentials) {
      const failure = await lockoutRpc(admin, 'register_staff_login_failure', profile.id);
      if (failure?.locked) return lockedResponse(failure.locked_until);
      return response({
        ok: false,
        code: 'incorrect_password',
        attemptsRemaining: typeof failure?.attempts_remaining === 'number' ? failure.attempts_remaining : null,
      });
    }

    console.error('[staff-auth] Supabase Auth sign-in failed', {
      status: authError.status ?? null,
      code: authError.code ?? null,
    });
    throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
  }
  if (!data.session) {
    console.error('[staff-auth] Supabase Auth returned no session', {
      code: 'missing_session',
    });
    throw new HttpError(500, 'Staff authentication is temporarily unavailable.');
  }
  if (lockStatus && Number(lockStatus.failed_attempts) > 0) {
    await lockoutRpc(admin, 'clear_staff_login_failures', profile.id);
  }
  return response({
    ok: true,
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      token_type: data.session.token_type,
      user: data.user,
    },
    mustChangePassword: profile.must_change_password === true,
    profile: {
      id: profile.id,
      employee_id: profile.employee_id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      branch_id: profile.branch_id,
      active: profile.active,
      must_change_password: profile.must_change_password === true,
    },
    branch: { id: branch.id, city: branch.city, code: branch.code },
  });
}

async function loginOwner(
  usernameValue: string,
  password: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
) {
  const username = normalizeOwnerUsername(usernameValue);
  return await loginOwnerByIdentifier(username, password, auth, admin, 'username', 'unknown_username');
}

async function loginOwnerWithEmail(
  emailValue: string,
  password: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
) {
  const email = normalizeOwnerEmail(emailValue);
  return await loginOwnerByIdentifier(email, password, auth, admin, 'email', 'email_not_found');
}

async function loginOwnerByIdentifier(
  identifier: string,
  password: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
  identifierColumn: 'username' | 'email',
  unknownCode: 'unknown_username' | 'email_not_found',
) {
  if (!identifier) return response({ ok: false, code: unknownCode });
  if (!password) return response({ ok: false, code: 'incorrect_password' });

  let profileResult;
  try {
    profileResult = await admin.from('profiles')
      .select('id, email, role, active')
      .eq(identifierColumn, identifier)
      .maybeSingle();
  } catch (error) {
    console.error('[staff-auth] Owner profile lookup threw', {
      code: error?.code ?? null,
      status: error?.status ?? null,
    });
    throw new HttpError(500, 'Owner authentication is temporarily unavailable.');
  }
  if (profileResult.error) {
    console.error('[staff-auth] Owner profile lookup failed', {
      code: profileResult.error.code ?? null,
      status: profileResult.error.status ?? null,
    });
    throw new HttpError(500, 'Owner authentication is temporarily unavailable.');
  }

  const profile = profileResult.data;
  console.info('[staff-auth] Owner profile lookup succeeded', {
    found: Boolean(profile),
    role: profile?.role ?? null,
    active: profile?.active ?? null,
    hasEmail: typeof profile?.email === 'string' && Boolean(profile.email.trim()),
  });
  if (!profile) {
    return response({ ok: false, code: unknownCode });
  }
  if (profile.role !== 'owner' || !profile.active) {
    return response({ ok: false, code: 'unauthorized_access' });
  }
  if (typeof profile.email !== 'string' || !profile.email.trim()) {
    return response({ ok: false, code: 'unauthorized_access' });
  }

  let authResult;
  try {
    authResult = await auth.auth.signInWithPassword({ email: profile.email, password });
  } catch (error) {
    console.error('[staff-auth] Owner Supabase Auth sign-in threw', {
      code: error?.code ?? null,
      status: error?.status ?? null,
    });
    throw new HttpError(500, 'Owner authentication is temporarily unavailable.');
  }
  if (authResult.error) {
    console.error('[staff-auth] Owner Supabase Auth sign-in failed', {
      status: authResult.error.status ?? null,
      code: authResult.error.code ?? null,
    });
    const isInvalidCredentials =
      authResult.error.code === 'invalid_credentials' ||
      (authResult.error.status === 400 && authResult.error.message === 'Invalid login credentials');
    if (isInvalidCredentials) return response({ ok: false, code: 'incorrect_password' });
    throw new HttpError(500, 'Owner authentication is temporarily unavailable.');
  }
  console.info('[staff-auth] Owner Supabase Auth sign-in succeeded');
  const sessionPresent = Boolean(authResult.data?.session);
  const userIdMatchesProfile = Boolean(authResult.data?.user?.id && authResult.data.user.id === profile.id);
  console.info('[staff-auth] Owner Auth identity check completed', {
    sessionPresent,
    userIdMatchesProfile,
  });
  if (!sessionPresent || !userIdMatchesProfile) {
    try { await auth.auth.signOut(); } catch { /* best effort; do not expose account details */ }
    throw new HttpError(500, 'Owner authentication is temporarily unavailable.');
  }

  const session = authResult.data.session;
  return response({
    ok: true,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
    },
  });
}

async function provisionExistingStaff(
  request: Request,
  admin: ReturnType<HandlerOptions['createClient']>,
  url: string,
  anonKey: string,
  createClient: HandlerOptions['createClient'],
) {
  await requireOwner(request, admin);
  const { data: profiles, error } = await admin.from('profiles')
    .select('id, employee_id, username, full_name, branch_id, active, must_change_password, created_at')
    .eq('role', 'staff')
    .order('created_at');
  if (error) throw error;

  for (const profile of profiles ?? []) {
    if (!profile.active) continue;
    if (!isEmployeeId(profile.employee_id)) {
      throw new HttpError(409, 'A Staff profile is missing a valid Employee ID. Apply the Employee ID migration first.');
    }
    const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, {
      password: profile.employee_id,
    });
    if (passwordError) throw new HttpError(500, 'Unable to provision Staff credentials securely.');
    const { error: flagError } = await admin.from('profiles')
      .update({ must_change_password: true })
      .eq('id', profile.id)
      .eq('role', 'staff')
      .eq('active', true);
    if (flagError) throw new HttpError(500, 'Unable to mark the Staff password as requiring change.');
  }

  return response({ ok: true, accounts: profiles ?? [] });
}

async function resetStaffPassword(
  request: Request,
  input: AccountInput,
  admin: ReturnType<HandlerOptions['createClient']>,
  url: string,
  anonKey: string,
  createClient: HandlerOptions['createClient'],
) {
  await requireOwner(request, admin);
  const id = inputString(input.id);
  if (!id) throw new HttpError(400, 'A Staff profile ID is required.');

  const { data: profile, error } = await admin.from('profiles')
    .select('id, employee_id, username, full_name, branch_id, active, must_change_password, created_at, role')
    .eq('id', id)
    .eq('role', 'staff')
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw new HttpError(404, 'The Staff account could not be found.');
  if (!profile.active) throw new HttpError(403, 'Inactive Staff accounts cannot have their passwords reset.');
  if (!isEmployeeId(profile.employee_id)) throw new HttpError(409, 'This Staff account has no valid Employee ID.');

  const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, {
    password: profile.employee_id,
  });
  if (passwordError) throw new HttpError(500, 'Unable to reset the Staff password securely.');
  const { error: flagError } = await admin.from('profiles')
    .update({ must_change_password: true })
    .eq('id', profile.id)
    .eq('role', 'staff')
    .eq('active', true);
  if (flagError) throw new HttpError(500, 'Unable to mark the Staff password as requiring change.');
  // ST-01 c3: the owner's reset also unlocks the account.
  await lockoutRpc(admin, 'clear_staff_login_failures', profile.id);

  return response({ ok: true, account: profile });
}

async function validateBranch(admin: ReturnType<HandlerOptions['createClient']>, branchId: string) {
  const { data, error } = await admin.from('branches').select('id').eq('id', branchId).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(400, 'The selected branch is unavailable.');
}

async function accountList(admin: ReturnType<HandlerOptions['createClient']>) {
  const [{ data: profiles, error: profileError }, { data: branches, error: branchError }] = await Promise.all([
    // OW-27 c1, c9: the lock status comes from the ST-01 lockout fields.
    admin.from('profiles').select('id, employee_id, username, full_name, branch_id, active, must_change_password, created_at, failed_login_attempts, locked_until').eq('role', 'staff').order('created_at'),
    admin.from('branches').select('id, name').eq('active', true).order('created_at'),
  ]);
  if (profileError) throw profileError;
  if (branchError) throw branchError;
  const branchNames = new Map((branches ?? []).map((branch) => [branch.id, branch.name]));
  return response({
    ok: true,
    accounts: (profiles ?? []).map((profile) => ({ ...profile, branch_name: branchNames.get(profile.branch_id) ?? 'Branch unavailable' })),
  });
}

async function saveAccount(
  request: Request,
  input: AccountInput,
  admin: ReturnType<HandlerOptions['createClient']>,
  url: string,
  anonKey: string,
  createClient: HandlerOptions['createClient'],
) {
  await requireOwner(request, admin);
  const username = normalizeUsername(inputString(input.username));
  const branchId = inputString(input.branchId);
  if (!username) throw new HttpError(400, 'Employee name / username is required.');
  if (username.length > 120) throw new HttpError(400, 'Employee name / username is too long.');
  if (!branchId) throw new HttpError(400, 'An assigned branch is required.');
  await validateBranch(admin, branchId);

  if (input.id) {
    if ('employeeId' in input) throw new HttpError(400, 'Employee IDs are generated and cannot be edited.');
    const { data: existing, error } = await admin.from('profiles')
      .select('id, employee_id, username, full_name, branch_id, active, email, role')
      .eq('id', input.id)
      .eq('role', 'staff')
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new HttpError(404, 'The Staff account could not be found.');
    const { data: duplicate, error: duplicateError } = await admin.from('profiles')
      .select('id').eq('username', username).neq('id', existing.id).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new HttpError(409, 'That employee name already belongs to another Staff account.');
    const { count, error: countError } = await admin.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'staff').eq('branch_id', branchId).neq('id', existing.id);
    if (countError) throw countError;
    if ((count ?? 0) >= 2) throw new HttpError(409, 'Each branch can have at most two Staff accounts.');
    const { data: updated, error: updateError } = await admin.from('profiles')
      .update({ username, full_name: inputString(input.username), branch_id: branchId, active: input.active !== false, role: 'staff' })
      .eq('id', existing.id)
      .select('id, employee_id, username, full_name, branch_id, active, must_change_password, created_at')
      .single();
    if (updateError) throw updateError;
    return response({ ok: true, account: updated });
  }

  const { data: duplicate, error: duplicateError } = await admin.from('profiles')
    .select('id').eq('username', username).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new HttpError(409, 'That employee name already belongs to another Staff account.');
  const { count, error: countError } = await admin.from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'staff').eq('branch_id', branchId);
  if (countError) throw countError;
  if ((count ?? 0) >= 2) throw new HttpError(409, 'Each branch can have at most two Staff accounts.');
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authAlias(username),
    password: temporaryPassword(),
    email_confirm: true,
    user_metadata: { full_name: inputString(input.username) },
  });
  if (createError || !created.user) throw createError ?? new Error('The Staff Auth account could not be created.');
  const { data: generatedProfile, error: generatedProfileError } = await admin.from('profiles')
    .select('id, employee_id, must_change_password')
    .eq('id', created.user.id)
    .eq('role', 'staff')
    .single();
  if (generatedProfileError || !isEmployeeId(generatedProfile?.employee_id)) {
    throw new HttpError(500, 'The Staff profile Employee ID could not be generated.');
  }
  const { error: passwordError } = await admin.auth.admin.updateUserById(created.user.id, {
    password: generatedProfile.employee_id,
  });
  if (passwordError) throw new HttpError(500, 'The Staff initial password could not be set securely.');
  const { data: profile, error: profileError } = await admin.from('profiles')
    .update({ username, full_name: inputString(input.username), branch_id: branchId, active: input.active !== false, role: 'staff', must_change_password: true })
    .eq('id', created.user.id)
    .select('id, employee_id, username, full_name, branch_id, active, must_change_password, created_at')
    .single();
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }
  return response({ ok: true, account: profile });
}

async function requireActiveStaff(request: Request, admin: ReturnType<HandlerOptions['createClient']>, action: string) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'Authentication is required.');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) throw new HttpError(401, 'Authentication is invalid or expired.');
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id, role, active, employee_id, must_change_password')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.role !== 'staff' || !profile.active) {
    await auditDenial(admin, userData.user.id, `staff-auth/${action}`, !profile ? 'DENY_NO_PROFILE' : !profile.active ? 'DENY_INACTIVE' : 'DENY_PERMISSION');
    throw new HttpError(403, `Only an active Staff account may ${action}.`);
  }
  return profile;
}

/** ST-01 c8 lock screen and ST-15 c5: checks the signed-in Staff member's password, with lockout. */
async function verifyPassword(
  request: Request,
  password: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
) {
  const profile = await requireActiveStaff(request, admin, 'check this password');
  const checked = await checkStaffPassword(profile.id, password, auth, admin);
  if (checked.result === 'locked') return lockedResponse(checked.lockedUntil);
  if (checked.result === 'incorrect') {
    return response({ ok: false, code: 'incorrect_password', attemptsRemaining: checked.attemptsRemaining });
  }
  return response({ ok: true });
}

async function changePassword(
  request: Request,
  newPassword: string,
  currentPassword: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
) {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'Authentication is required.');
  if (newPassword.length < 8) throw new HttpError(400, 'New password must be at least 8 characters.');

  const profile = await requireActiveStaff(request, admin, 'change this password');
  if (newPassword === profile.employee_id) throw new HttpError(400, 'Choose a password different from your Employee ID.');
  // ST-15 c3, c5: outside the forced first change, the current password is
  // checked here, on the server, with the same lockout as sign-in.
  if (profile.must_change_password !== true) {
    const checked = await checkStaffPassword(profile.id, currentPassword, auth, admin);
    if (checked.result === 'locked') return lockedResponse(checked.lockedUntil);
    if (checked.result === 'incorrect') {
      return response({
        ok: false,
        code: 'incorrect_password',
        error: 'Your current password is incorrect. Please try again.',
        attemptsRemaining: checked.attemptsRemaining,
      });
    }
    if (newPassword === currentPassword) {
      throw new HttpError(400, 'Choose a new password different from your current password.');
    }
  }

  const { error: passwordError } = await admin.auth.admin.updateUserById(profile.id, { password: newPassword });
  if (passwordError) throw new HttpError(500, 'Unable to update the Staff password securely.');
  const { error: flagError } = await admin.from('profiles')
    .update({ must_change_password: false })
    .eq('id', profile.id)
    .eq('role', 'staff')
    .eq('active', true);
  if (flagError) throw new HttpError(500, 'Password updated, but the Staff password-change state could not be cleared.');
  // Supabase Auth ends every session of a user whose password an admin changes,
  // including the one that sent this request. Sign in again with the new password
  // so the Staff member continues into the workspace (ST-01 c3, ST-15 c3).
  const session = await sessionForNewPassword(profile.id, newPassword, auth, admin);
  return response(session ? { ok: true, session } : { ok: true });
}

async function sessionForNewPassword(
  profileId: string,
  password: string,
  auth: ReturnType<HandlerOptions['createClient']>,
  admin: ReturnType<HandlerOptions['createClient']>,
) {
  const { data: authUserData, error: authUserError } = await admin.auth.admin.getUserById(profileId);
  const email = typeof authUserData?.user?.email === 'string' ? authUserData.user.email.trim() : '';
  if (authUserError || !email) return null;
  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    console.error('[staff-auth] Sign-in after password change failed', { status: error?.status ?? null, code: error?.code ?? null });
    return null;
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: data.user,
  };
}

export function createStaffAuthHandler(options: HandlerOptions) {
  return async (request: Request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      const { admin, auth, anonKey, url } = getClients(options);
      let body;
      try {
        body = await request.json();
      } catch {
        throw new HttpError(400, 'A valid JSON request body is required.');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'A valid JSON request body is required.');
      }
      if (body.action === 'login') {
        return await login(inputString(body.username), typeof body.password === 'string' ? body.password : '', auth, admin);
      }
      if (body.action === 'owner-login') {
        return await loginOwner(inputString(body.username), typeof body.password === 'string' ? body.password : '', auth, admin);
      }
      if (body.action === 'owner-email-login') {
        return await loginOwnerWithEmail(inputString(body.email), typeof body.password === 'string' ? body.password : '', auth, admin);
      }
      if (body.action === 'provision-existing') {
        return await provisionExistingStaff(request, admin, url, anonKey, options.createClient);
      }
      if (body.action === 'reset-password') {
        const account = body.account && typeof body.account === 'object' && !Array.isArray(body.account)
          ? body.account
          : {};
        return await resetStaffPassword(request, account, admin, url, anonKey, options.createClient);
      }
      if (body.action === 'change-password') {
        return await changePassword(
          request,
          typeof body.newPassword === 'string' ? body.newPassword : '',
          typeof body.currentPassword === 'string' ? body.currentPassword : '',
          auth,
          admin,
        );
      }
      if (body.action === 'verify-password') {
        return await verifyPassword(request, typeof body.password === 'string' ? body.password : '', auth, admin);
      }
      if (body.action === 'list') {
        await requireOwner(request, admin);
        return await accountList(admin);
      }
      if (body.action === 'create' || body.action === 'update') {
        const account = body.account && typeof body.account === 'object' && !Array.isArray(body.account)
          ? body.account
          : {};
        return await saveAccount(request, account, admin, url, anonKey, options.createClient);
      }
      throw new HttpError(400, 'Unknown Staff authentication action.');
    } catch (error) {
      if (error instanceof HttpError) {
        return response({ ok: false, error: error.message }, error.status);
      }
      console.error('[staff-auth] request failed', {
        code: error?.code ?? null,
        status: error?.status ?? null,
      });
      return response({ ok: false, error: 'Unable to process the request.' }, 500);
    }
  };
}
