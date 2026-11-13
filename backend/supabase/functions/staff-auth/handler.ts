// @ts-nocheck
type AccountInput = {
  id?: string;
  username?: string;
  employeeId?: string;
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

async function requireOwner(
  request: Request,
  admin: ReturnType<HandlerOptions['createClient']>,
  url: string,
  anonKey: string,
  createClient: HandlerOptions['createClient'],
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
    throw new HttpError(403, 'Only an active Owner may manage Staff accounts.');
  }

  let sessionResult;
  try {
    const caller = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    sessionResult = await caller.rpc('business_session_status');
  } catch {
    throw new HttpError(500, 'Unable to verify the business session.');
  }
  if (sessionResult.error) {
    console.error('[staff-auth] business session authorization RPC failed', {
      code: sessionResult.error.code ?? null,
      status: sessionResult.error.status ?? null,
    });
    throw new HttpError(500, 'Unable to verify the business session.');
  }
  if (!sessionResult.data || typeof sessionResult.data !== 'object' || sessionResult.data.active !== true) {
    throw new HttpError(403, 'An active business session is required.');
  }

  return userData.user.id;
}

async function login(usernameValue: string, password: string, auth: ReturnType<HandlerOptions['createClient']>, admin: ReturnType<HandlerOptions['createClient']>) {
  const username = normalizeUsername(usernameValue);
  if (!username) return response({ ok: false, code: 'unknown_username' });
  const { data: profile, error } = await admin.from('profiles')
    .select('id, email, role, active')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!profile || profile.role !== 'staff') return response({ ok: false, code: 'unknown_username' });
  if (!profile.active) return response({ ok: false, code: 'inactive_account' });
  const { data, error: authError } = await auth.auth.signInWithPassword({
    email: profile.email || authAlias(username),
    password,
  });
  if (authError) {
    const isInvalidCredentials =
      authError.code === 'invalid_credentials' ||
      (authError.status === 400 && authError.message === 'Invalid login credentials');
    if (isInvalidCredentials) return response({ ok: false, code: 'incorrect_password' });

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
  });
}

async function validateBranch(admin: ReturnType<HandlerOptions['createClient']>, branchId: string) {
  const { data, error } = await admin.from('branches').select('id').eq('id', branchId).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(400, 'The selected branch is unavailable.');
}

async function accountList(admin: ReturnType<HandlerOptions['createClient']>) {
  const [{ data: profiles, error: profileError }, { data: branches, error: branchError }] = await Promise.all([
    admin.from('profiles').select('id, username, full_name, branch_id, active, created_at').eq('role', 'staff').order('created_at'),
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
  await requireOwner(request, admin, url, anonKey, createClient);
  const username = normalizeUsername(inputString(input.username));
  const employeeId = inputString(input.employeeId);
  const branchId = inputString(input.branchId);
  if (!username) throw new HttpError(400, 'Employee name / username is required.');
  if (username.length > 120) throw new HttpError(400, 'Employee name / username is too long.');
  if (!branchId) throw new HttpError(400, 'An assigned branch is required.');
  await validateBranch(admin, branchId);

  if (input.id) {
    const { data: existing, error } = await admin.from('profiles')
      .select('id, username, full_name, branch_id, active, email, role')
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
    if (employeeId) {
      const { error: authError } = await admin.auth.admin.updateUserById(existing.id, { password: employeeId });
      if (authError) throw authError;
    }
    const { data: updated, error: updateError } = await admin.from('profiles')
      .update({ username, full_name: inputString(input.username), branch_id: branchId, active: input.active !== false, role: 'staff' })
      .eq('id', existing.id)
      .select('id, username, full_name, branch_id, active, created_at')
      .single();
    if (updateError) throw updateError;
    return response({ ok: true, account: updated });
  }

  if (!employeeId) throw new HttpError(400, 'Employee ID is required as the initial password.');
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
    password: employeeId,
    email_confirm: true,
    user_metadata: { full_name: inputString(input.username) },
  });
  if (createError || !created.user) throw createError ?? new Error('The Staff Auth account could not be created.');
  const { data: profile, error: profileError } = await admin.from('profiles')
    .update({ username, full_name: inputString(input.username), branch_id: branchId, active: input.active !== false, role: 'staff' })
    .eq('id', created.user.id)
    .select('id, username, full_name, branch_id, active, created_at')
    .single();
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw profileError;
  }
  return response({ ok: true, account: profile });
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
      if (body.action === 'list') {
        await requireOwner(request, admin, url, anonKey, options.createClient);
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
