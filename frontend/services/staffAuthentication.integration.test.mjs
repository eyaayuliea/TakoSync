import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./testTsLoader.mjs', import.meta.url);
const { signIn, signInStaff } = await import('./takosync.ts');

const session = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 3600,
  expires_at: 2_000_000_000,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'staff-1@auth.takosync.internal' },
};

class AuthFixture {
  constructor({ profile, loginError = null } = {}) {
    this.profile = profile ?? {
      id: 'user-1', email: 'staff-1@auth.takosync.internal', full_name: 'Ana Cruz',
      role: 'staff', branch_id: 'branch-2', active: true,
    };
    this.loginError = loginError;
    this.loginArgs = [];
    this.signedOut = false;
    this.currentSession = null;
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
      invoke: async (_name, { body }) => ({
        data: this.loginResult ?? { ok: true, session },
        error: null,
        body,
      }),
    };
  }

  async rpc(name) {
    if (name === 'business_session_status') {
      return { data: { active: true, milliseconds_until_expiration: 3600000 }, error: null };
    }
    if (name === 'authorize_business_session') return { data: null, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  }
}

test('Staff username login succeeds and returns the assigned branch', async () => {
  const client = new AuthFixture();
  const user = await signInStaff('  Ana   Cruz ', 'EMP-001', client);
  assert.equal(user.role, 'Staff');
  assert.equal(user.branchId, 'branch-2');
  assert.equal(user.branch, 'Cebu · Branch 2');
  assert.equal(client.currentSession.access_token, 'access-token');
});

for (const [code, expected] of [
  ['unknown_username', 'Username not found. Please check your username.'],
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

test('Owner email login remains email based', async () => {
  const client = new AuthFixture({ profile: {
    id: 'owner-1', email: 'owner@example.test', full_name: 'Owner', role: 'owner', branch_id: null, active: true,
  }});
  await signIn('owner@example.test', 'owner-password', 'Owner', client);
  assert.deepEqual(client.loginArgs[0], { email: 'owner@example.test', password: 'owner-password' });
});
