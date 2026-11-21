import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./testTsLoader.mjs', import.meta.url);
const { getCurrentUser, signIn, signInOwner, signInOwnerWithEmail, signInStaff } = await import('./takosync.ts');

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'staff-1@auth.takosync.internal' },
};

class AuthFixture {
  constructor({
    profile,
    loginError = null,
    authorizationError = null,
    functionError = null,
    businessSessionActive = true,
  } = {}) {
    this.profile = profile ?? {
      id: 'user-1', email: 'staff-1@auth.takosync.internal', full_name: 'Ana Cruz',
      role: 'staff', branch_id: 'branch-2', active: true, must_change_password: true,
    };
    this.loginError = loginError;
    this.authorizationError = authorizationError;
    this.functionError = functionError;
    this.businessSessionActive = businessSessionActive;
    this.loginArgs = [];
    this.signedOut = false;
    this.currentSession = null;
    this.functionBody = null;
  }

  from(table) {
    const fixture = this;
    return {
      select() { return this; },
      eq() { return this; },
      maybeSingle: async () => ({
        data: table === 'profiles' ? fixture.profile : { city: 'Cebu', code: 'BR-002' },
        error: null,
      }),
    };
  }

  get auth() {
    return {
      signInWithPassword: async (args) => {
        this.loginArgs.push(args);
        return { data: { user: session.user, session }, error: this.loginError };
      },
      setSession: async (nextSession) => {
        this.currentSession = nextSession;
        return { data: { session: nextSession }, error: null };
      },
      getSession: async () => ({ data: { session: this.currentSession ?? session }, error: null }),
      signOut: async () => { this.signedOut = true; return { error: null }; },
    };
  }

  get functions() {
    return {
      invoke: async (_name, { body }) => {
        this.functionBody = body;
        return { data: this.loginResult ?? { ok: true, session }, error: this.functionError, body };
      },
    };
  }

  async rpc(name) {
    if (name === 'business_session_status') {
      return {
        data: { active: this.businessSessionActive, milliseconds_until_expiration: this.businessSessionActive ? 3600000 : 0 },
        error: null,
      };
    }
    if (name === 'authorize_business_session') return { data: null, error: this.authorizationError };
    throw new Error(`Unexpected RPC: ${name}`);
  }
}

test('Staff username login succeeds and returns the assigned branch', async () => {
  const client = new AuthFixture();
  const user = await signInStaff('  Ana   Cruz ', 'EMP-001', client);
  assert.equal(user.role, 'Staff');
  assert.equal(user.mustChangePassword, true);
  assert.equal(user.branchId, 'branch-2');
  assert.equal(user.branch, 'Cebu · Branch 2');
  assert.equal(client.currentSession.access_token, 'access-token');
});

test('Staff login forwards the Employee ID password unchanged', async () => {
  const client = new AuthFixture();
  await signInStaff('bien_staff', 'EMP-2026-123456', client);
  assert.deepEqual(client.functionBody, {
    action: 'login',
    username: 'bien_staff',
    password: 'EMP-2026-123456',
  });
});

test('Staff login succeeds after business closing time', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION;
  process.env.NODE_ENV = 'development';
  process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION = 'true';
  try {
    const client = new AuthFixture({ businessSessionActive: false });
    const user = await signInStaff('ana_staff', 'EMP-001', client);
    assert.equal(user.role, 'Staff');
    assert.equal(client.signedOut, false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBypass === undefined) delete process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION;
    else process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION = previousBypass;
  }
});

test('Staff login succeeds after midnight regardless of environment', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousBypass = process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION;
  process.env.NODE_ENV = 'production';
  process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION = 'true';
  try {
    const client = new AuthFixture({ businessSessionActive: false });
    const user = await signInStaff('ana_staff', 'EMP-001', client);
    assert.equal(user.role, 'Staff');
    assert.equal(client.signedOut, false);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousBypass === undefined) delete process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION;
    else process.env.EXPO_PUBLIC_ALLOW_STAFF_LOGIN_WITHOUT_BUSINESS_SESSION = previousBypass;
  }
});

test('Staff login preserves the first-login password-change flag', async () => {
  const client = new AuthFixture();
  client.loginResult = { ok: true, session, mustChangePassword: true };
  const user = await signInStaff('ana_staff', 'initial-password', client);
  assert.equal(user.role, 'Staff');
  assert.equal(user.mustChangePassword, true);
  assert.equal(user.branchId, 'branch-2');
  assert.equal(client.signedOut, false);
});

for (const [code, expected] of [
  ['unknown_username', 'Username not found. Please try again.'],
  ['incorrect_password', 'Incorrect password. Please try again.'],
  ['inactive_account', 'This account is inactive. Please contact the owner.'],
]) {
  test(`Staff username login reports ${code}`, async () => {
    const client = new AuthFixture();
    client.loginResult = { ok: false, code };
    await assert.rejects(() => signInStaff('Ana Cruz', 'EMP-001', client), { message: expected });
  });
}

test('Staff cannot enter the Owner path after username authentication', async () => {
  const client = new AuthFixture({ profile: {
    id: 'owner-1', email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
  }});
  await assert.rejects(() => signInStaff('Ana Cruz', 'EMP-001', client), { message: 'This account does not have Staff access.' });
  assert.equal(client.signedOut, true);
});

test('Owner username login resolves through staff-auth and preserves the existing session flow', async () => {
  const client = new AuthFixture({ profile: {
    id: 'user-1', username: "ownergelo'26", email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
  }});
  await signInOwner("  OWNERGELO'26  ", 'owner-password', client);
  assert.deepEqual(client.functionBody, { action: 'owner-login', username: "ownergelo'26", password: 'owner-password' });
  assert.equal(client.currentSession.access_token, 'access-token');
});

test('Owner username login rejects a Staff profile after the session is installed', async () => {
  const client = new AuthFixture({ profile: {
    id: 'user-1', username: 'ana_staff', email: 'staff@example.test', full_name: 'Ana', role: 'staff', branch_id: 'branch-2', active: true,
  }});
  await assert.rejects(() => signInOwner('ana_staff', 'password', client), { message: 'Unauthorized access.' });
  assert.equal(client.signedOut, true);
});

test('Owner username login ignores business-hours status and preserves the session', async () => {
  const client = new AuthFixture({
    profile: {
      id: 'user-1', username: "ownergelo'26", email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
    },
    authorizationError: { message: 'Business session is not active.' },
  });
  const user = await signInOwner("ownergelo'26", 'owner-password', client);
  assert.equal(user.role, 'Owner');
  assert.equal(client.signedOut, false);
});

test('Owner Mobile email login normalizes the email and installs the authenticated session', async () => {
  const client = new AuthFixture({ profile: {
    id: 'user-1', email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
  }});
  const user = await signInOwnerWithEmail('  OWNER@EXAMPLE.TEST  ', 'owner-password', client);
  assert.equal(user.role, 'Owner');
  assert.deepEqual(client.functionBody, {
    action: 'owner-email-login',
    email: 'owner@example.test',
    password: 'owner-password',
  });
  assert.equal(client.currentSession.access_token, 'access-token');
});

test('Owner Mobile email login falls back to Supabase Auth if the email Edge action is unavailable', async () => {
  const client = new AuthFixture({
    profile: {
      id: 'user-1', email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
    },
    functionError: { message: 'Edge action not deployed' },
  });
  const user = await signInOwnerWithEmail(' OWNER@EXAMPLE.TEST ', 'owner-password', client);
  assert.equal(user.role, 'Owner');
  assert.deepEqual(client.loginArgs, [{ email: 'owner@example.test', password: 'owner-password' }]);
});

test('Owner Mobile direct Auth fallback reports invalid credentials without a connection error', async () => {
  const client = new AuthFixture({
    profile: {
      id: 'user-1', email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
    },
    functionError: { message: 'Edge action not deployed' },
    loginError: { message: 'Invalid login credentials', status: 400 },
  });
  await assert.rejects(
    () => signInOwnerWithEmail('owner@example.test', 'wrong-password', client),
    { message: 'Email or password is incorrect.' },
  );
});

test('Owner Mobile reports the approved connection message when the Edge call cannot reach the network', async () => {
  const client = new AuthFixture({ functionError: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } });
  await assert.rejects(
    () => signInOwnerWithEmail('owner@example.test', 'password', client),
    { message: 'Unable to connect. Please check your internet connection and try again.' },
  );
  assert.deepEqual(client.loginArgs, [], 'no second direct Auth request is made while offline');
});

test('Owner Mobile direct Auth fallback reports the approved connection message when offline', async () => {
  const client = new AuthFixture({
    functionError: { message: 'Edge action not deployed' },
    loginError: { message: 'Failed to fetch', status: 0 },
  });
  await assert.rejects(
    () => signInOwnerWithEmail('owner@example.test', 'password', client),
    { message: 'Unable to connect. Please check your internet connection and try again.' },
  );
});

test('Owner Mobile email login maps unknown email and incorrect password to distinct errors', async () => {
  for (const [code, message] of [
    ['email_not_found', 'Email not found. Please check your email.'],
    ['incorrect_password', 'Incorrect password. Please try again.'],
  ]) {
    const client = new AuthFixture();
    client.loginResult = { ok: false, code };
    await assert.rejects(() => signInOwnerWithEmail('owner@example.test', 'wrong-password', client), { message });
  }
});

test('Owner Mobile rejects malformed email locally with an email error', async () => {
  const client = new AuthFixture();
  await assert.rejects(
    () => signInOwnerWithEmail('not-an-email', 'password', client),
    { message: 'Email not found. Please check your email.' },
  );
  assert.equal(client.functionBody, null);
});

test('Owner Mobile email login rejects a Staff profile after installing the session', async () => {
  const client = new AuthFixture({ profile: {
    id: 'user-1', email: 'staff@example.test', full_name: 'Ana', role: 'staff', branch_id: 'branch-2', active: true,
  }});
  await assert.rejects(
    () => signInOwnerWithEmail('staff@example.test', 'password', client),
    { message: 'This account does not have Owner access.' },
  );
  assert.equal(client.signedOut, true);
});

test('session restoration rejects an unsupported profile role and clears the session', async () => {
  const client = new AuthFixture({ profile: {
    id: 'user-1', email: 'unknown@example.test', full_name: 'Unknown', role: 'manager', branch_id: null, active: true,
  }});

  await assert.rejects(
    () => getCurrentUser(client),
    { message: 'This account has an unsupported role. Ask the owner to review its access.' },
  );
  assert.equal(client.signedOut, true);
});

test('session restoration preserves a valid Staff session after business closing time', async () => {
  const client = new AuthFixture({ businessSessionActive: false });

  const user = await getCurrentUser(client);

  assert.equal(user.role, 'Staff');
  assert.equal(client.signedOut, false);
});

test('session restoration preserves an Owner session after business closing time', async () => {
  const client = new AuthFixture({
    profile: {
      id: 'user-1', email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
    },
    businessSessionActive: false,
  });

  const user = await getCurrentUser(client);

  assert.equal(user.role, 'Owner');
  assert.equal(client.signedOut, false);
});
