// Supabase Edge Functions run under Deno; the root Expo TypeScript project does not include Deno typings.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AccountInput = {
  id?: string;
  username?: string;
  employeeId?: string;
  branchId?: string;
  active?: boolean;
};

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

function getClients() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceRoleKey || !anonKey) throw new Error('Staff authentication is not configured.');
  return {
    admin: createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    auth: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function requireOwner(request: Request, admin: ReturnType<typeof createClient>) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Owner authorization is required.');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Owner authorization is required.');
  const { data: profile, error } = await admin.from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (error || !profile || profile.role !== 'owner' || !profile.active) {
    throw new Error('Only an active Owner may manage Staff accounts.');
  }
  return userData.user.id;
}

async function login(usernameValue: string, password: string, auth: ReturnType<typeof createClient>, admin: ReturnType<typeof createClient>) {
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
      message: authError.message ?? 'Unknown Auth error',
    });
    return response({ ok: false, code: 'auth_unavailable' }, 500);
  }
  if (!data.session) {
    console.error('[staff-auth] Supabase Auth returned no session', {
      status: null,
      code: 'missing_session',
      message: 'Auth sign-in returned no session without an error',
    });
    return response({ ok: false, code: 'auth_unavailable' }, 500);
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

async function validateBranch(admin: ReturnType<typeof createClient>, branchId: string) {
  const { data, error } = await admin.from('branches').select('id').eq('id', branchId).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The selected branch is unavailable.');
}

async function accountList(admin: ReturnType<typeof createClient>) {
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

async function saveAccount(request: Request, input: AccountInput, admin: ReturnType<typeof createClient>) {
  await requireOwner(request, admin);
  const username = normalizeUsername(inputString(input.username));
  const employeeId = inputString(input.employeeId);
  const branchId = inputString(input.branchId);
  if (!username) throw new Error('Employee name / username is required.');
  if (username.length > 120) throw new Error('Employee name / username is too long.');
  if (!branchId) throw new Error('An assigned branch is required.');
  await validateBranch(admin, branchId);

  if (input.id) {
    const { data: existing, error } = await admin.from('profiles')
      .select('id, username, full_name, branch_id, active, email, role')
      .eq('id', input.id)
      .eq('role', 'staff')
      .maybeSingle();
    if (error) throw error;
    if (!existing) throw new Error('The Staff account could not be found.');
    const { data: duplicate, error: duplicateError } = await admin.from('profiles')
      .select('id').eq('username', username).neq('id', existing.id).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new Error('That employee name already belongs to another Staff account.');
    const { count, error: countError } = await admin.from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'staff').eq('branch_id', branchId).neq('id', existing.id);
    if (countError) throw countError;
    if ((count ?? 0) >= 2) throw new Error('Each branch can have at most two Staff accounts.');
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

  if (!employeeId) throw new Error('Employee ID is required as the initial password.');
  const { data: duplicate, error: duplicateError } = await admin.from('profiles')
    .select('id').eq('username', username).maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) throw new Error('That employee name already belongs to another Staff account.');
  const { count, error: countError } = await admin.from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'staff').eq('branch_id', branchId);
  if (countError) throw countError;
  if ((count ?? 0) >= 2) throw new Error('Each branch can have at most two Staff accounts.');
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { admin, auth } = getClients();
    const body = await request.json() as { action?: string; username?: string; password?: string; account?: AccountInput };
    if (body.action === 'login') {
      return await login(inputString(body.username), body.password ?? '', auth, admin);
    }
    if (body.action === 'list') {
      await requireOwner(request, admin);
      return await accountList(admin);
    }
    if (body.action === 'create' || body.action === 'update') {
      return await saveAccount(request, body.account ?? {}, admin);
    }
    throw new Error('Unknown Staff authentication action.');
  } catch (error) {
    return response({ ok: false, error: error instanceof Error ? error.message : 'Staff authentication failed.' }, 400);
  }
});
