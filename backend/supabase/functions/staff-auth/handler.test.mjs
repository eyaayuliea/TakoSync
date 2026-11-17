import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('../../../../frontend/services/testTsLoader.mjs', import.meta.url);
const { createStaffAuthHandler } = await import('./handler.ts');

const staffAccount = {
  id: 'staff-id',
  employee_id: 'EMP-2026-123456',
  username: 'ana_staff',
  full_name: 'Ana Cruz',
  branch_id: 'branch-id',
  active: true,
  must_change_password: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

function createFixture({
  ownerProfile = { id: 'owner-id', role: 'owner', active: true },
  staffProfiles = [staffAccount],
  callerUserId = 'owner-id',
  authUserId = 'staff-id',
  authLoginError = null,
  sessionResult = { data: { active: true }, error: null },
  userError = null,
} = {}) {
  const calls = [];
  const accountOperations = [];
  const profiles = [];
  const branches = [];
  const authAdminOperations = [];
  const options = {
    getEnv: (name) => ({
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-test',
      SUPABASE_ANON_KEY: 'anon-key-for-test',
    })[name],
    createClient: (_url, key, clientOptions = {}) => {
      if (clientOptions.global?.headers?.Authorization) {
        return {
          rpc: async (name) => {
            calls.push({ kind: 'session-rpc', name, authorization: clientOptions.global.headers.Authorization });
            return sessionResult;
          },
        };
      }
      if (key === 'service-role-key-for-test') {
        return {
          auth: {
            getUser: async (token) => {
              calls.push({ kind: 'get-user', token });
              if (token !== 'valid-token' && token !== 'staff-token') {
                return { data: { user: null }, error: userError ?? { status: 401, code: 'invalid_token' } };
              }
              if (userError) return { data: { user: null }, error: userError };
              return { data: { user: { id: callerUserId } }, error: null };
            },
            admin: {
              createUser: async (input) => {
                calls.push({ kind: 'account-auth-admin' });
                authAdminOperations.push('create');
                return {
                  data: { user: { id: 'created-staff-id', email: input.email } },
                  error: null,
                };
              },
              updateUserById: async (...args) => {
                calls.push({ kind: 'account-auth-admin' });
                authAdminOperations.push('update');
                authAdminPayloads.push(args);
                return { error: null };
              },
              getUserById: async (id) => ({
                data: { user: { id, email: 'staff@example.test' } },
                error: null,
              }),
              deleteUser: async () => {
                calls.push({ kind: 'account-auth-admin' });
                authAdminOperations.push('delete');
                return { error: null };
              },
            },
          },
          from: (table) => createQuery(table),
        };
      }
      return {
        auth: {
          signInWithPassword: async (input) => {
            calls.push({ kind: 'auth-login', email: input.email, password: input.password });
            return {
            data: {
                user: { id: authUserId },
              session: {
                access_token: 'staff-access-token',
                refresh_token: 'staff-refresh-token',
                expires_in: 3600,
                expires_at: 2000000000,
                token_type: 'bearer',
              },
            },
              error: authLoginError,
            };
          },
        },
      };
    },
  };

  function createQuery(table) {
    const query = {
      filters: [],
      operation: 'select',
      selectOptions: null,
      select(fields, options) { this.selectedFields = fields; this.selectOptions = options; return this; },
      eq(column, value) { this.filters.push([column, value]); return this; },
      neq(column, value) { this.filters.push([`not-${column}`, value]); return this; },
      order() { return this; },
      update() {
        this.operation = 'update';
        accountOperations.push({ table, operation: 'update' });
        calls.push({ kind: 'account-operation', table, operation: 'update' });
        return this;
      },
      maybeSingle: async function () { return resolveQuery(this, 'single'); },
      single: async function () { return resolveQuery(this, 'single'); },
      then: (resolve, reject) => Promise.resolve(resolveQuery(query, 'many')).then(resolve, reject),
    };

    function resolveQuery(current, resultShape) {
      const filters = Object.fromEntries(current.filters);
      const isStaffAccountQuery = table === 'branches' ||
        filters.role === 'staff' ||
        filters.username !== undefined ||
        filters.id === 'staff-id' ||
        filters.id === 'created-staff-id' ||
        current.operation === 'update';
      if (isStaffAccountQuery) {
        accountOperations.push({ table, operation: current.operation });
        calls.push({ kind: 'account-operation', table, operation: current.operation });
      }

      if (table === 'branches') {
        branches.push({ id: filters.id ?? 'branch-id', name: 'Cebu Branch', city: 'Cebu', code: 'BR-001', active: true });
        const row = { id: filters.id ?? 'branch-id', name: 'Cebu Branch', city: 'Cebu', code: 'BR-001', active: true };
        return resultShape === 'many'
          ? { data: [row], error: null }
          : { data: filters.id ? row : null, error: null };
      }
      if (table !== 'profiles') return { data: null, error: null };

      if (filters.id === 'owner-id') {
        profiles.push(ownerProfile);
        return { data: ownerProfile, error: null };
      }
      if (filters.username === "ownergelo'26") {
        return { data: ownerProfile?.username === "ownergelo'26" ? ownerProfile : null, error: null };
      }
      if (filters.id === 'staff-id' && filters.role === undefined) {
        return { data: staffProfiles.find((profile) => profile.id === 'staff-id') ?? null, error: null };
      }
      if (filters.id === 'staff-id' && filters.role === 'staff') {
        const profile = staffProfiles.find((item) => item.id === 'staff-id');
        return { data: profile ? { ...profile, email: 'staff@example.test', role: 'staff' } : null, error: null };
      }
      if (filters.id === 'created-staff-id' && filters.role === 'staff') {
        return { data: { id: 'created-staff-id', employee_id: 'EMP-2026-654321' }, error: null };
      }
      if (filters.username === 'ana_staff' && current.selectedFields.includes('email')) {
        return {
          data: { ...staffAccount, email: 'staff@example.test', role: 'staff' },
          error: null,
        };
      }
      if (filters.role === 'staff' && resultShape === 'many') {
        const rows = filters.active === undefined
          ? staffProfiles
          : staffProfiles.filter((profile) => profile.active === filters.active);
        return { data: rows, error: null };
      }
      if (current.selectOptions?.count === 'exact') {
        return { count: 0, error: null };
      }
      if (current.operation === 'update') {
        return { data: { ...staffAccount, id: filters.id ?? 'created-staff-id' }, error: null };
      }
      return { data: null, error: null };
    }

    return query;
  }

  const handler = createStaffAuthHandler(options);
  const authAdminPayloads = [];
  return { handler, calls, accountOperations, authAdminOperations, authAdminPayloads, profiles, branches };
}

function request(action, account, authorization = 'Bearer valid-token') {
  const headers = { 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = authorization;
  const body = action === 'change-password'
    ? { action, newPassword: account?.newPassword }
    : { action, ...(account ? { account } : {}) };
  return new Request('https://function.test/staff-auth', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function invoke(fixture, action, account, authorization) {
  const result = await fixture.handler(request(action, account, authorization));
  return { status: result.status, body: await result.json() };
}

for (const action of ['list', 'create', 'update']) {
  test(`active Owner business session can ${action} Staff accounts`, async () => {
    const fixture = createFixture();
    const account = action === 'create'
      ? { username: 'Ana Cruz', branchId: 'branch-id' }
      : action === 'update'
        ? { id: 'staff-id', username: 'Ana Cruz', branchId: 'branch-id', active: true }
        : undefined;

    const result = await invoke(fixture, action, account);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    if (action === 'list') assert.equal(result.body.accounts.length, 1);
    else assert.equal(result.body.account.id, action === 'create' ? 'created-staff-id' : 'staff-id');
    const sessionCall = fixture.calls.findIndex((call) => call.kind === 'session-rpc');
    const firstAccountCall = fixture.calls.findIndex((call) =>
      call.kind === 'account-operation' || call.kind === 'account-auth-admin');
    assert.ok(sessionCall >= 0);
    assert.ok(firstAccountCall > sessionCall);
    assert.equal(fixture.calls[sessionCall].name, 'business_session_status');
    assert.equal(fixture.calls[sessionCall].authorization, 'Bearer valid-token');
  });
}

test('invalid JWT is rejected before any account operation', async () => {
  const fixture = createFixture();
  const result = await invoke(fixture, 'list', undefined, 'Bearer invalid-token');

  assert.equal(result.status, 401);
  assert.deepEqual(fixture.accountOperations, []);
  assert.deepEqual(fixture.authAdminOperations, []);
  assert.equal(fixture.calls.some((call) => call.kind === 'session-rpc'), false);
});

test('missing authentication is rejected with 401', async () => {
  const fixture = createFixture();
  const result = await invoke(fixture, 'list', undefined, null);

  assert.equal(result.status, 401);
  assert.deepEqual(fixture.accountOperations, []);
  assert.deepEqual(fixture.authAdminOperations, []);
});

test('inactive Owner is rejected before checking or operating on accounts', async () => {
  const fixture = createFixture({
    ownerProfile: { id: 'owner-id', role: 'owner', active: false },
  });
  const result = await invoke(fixture, 'create', {
    username: 'Ana Cruz', branchId: 'branch-id',
  });

  assert.equal(result.status, 403);
  assert.deepEqual(fixture.accountOperations, []);
  assert.deepEqual(fixture.authAdminOperations, []);
  assert.equal(fixture.calls.some((call) => call.kind === 'session-rpc'), false);
});

test('Staff cannot administer Owner accounts', async () => {
  const fixture = createFixture({
    ownerProfile: { id: 'owner-id', role: 'staff', active: true },
  });
  const result = await invoke(fixture, 'update', {
    id: 'staff-id', username: 'Ana Cruz', branchId: 'branch-id', active: false,
  });

  assert.equal(result.status, 403);
  assert.deepEqual(fixture.accountOperations, []);
  assert.deepEqual(fixture.authAdminOperations, []);
  assert.equal(fixture.calls.some((call) => call.kind === 'session-rpc'), false);
});

for (const [description, status] of [
  ['missing', { active: false }],
  ['expired', { active: false, expires_at: '2026-01-01T00:00:00Z' }],
  ['revoked', { active: false }],
]) {
  test(`${description} business session is rejected before privileged account operations`, async () => {
    const fixture = createFixture({ sessionResult: { data: status, error: null } });
    const result = await invoke(fixture, 'create', {
      username: 'Ana Cruz', branchId: 'branch-id',
    });

    assert.equal(result.status, 403);
    assert.deepEqual(fixture.accountOperations, []);
    assert.deepEqual(fixture.authAdminOperations, []);
  });
}

test('business session RPC errors fail closed without exposing database details', async () => {
  const fixture = createFixture({
    sessionResult: { data: null, error: { code: 'XX000', message: 'private database detail', status: 500 } },
  });
  const result = await invoke(fixture, 'update', {
    id: 'staff-id', username: 'Ana Cruz', branchId: 'branch-id', active: true,
  });

  assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(result.body), /private database detail|XX000/);
  assert.deepEqual(fixture.accountOperations, []);
  assert.deepEqual(fixture.authAdminOperations, []);
});

test('business session is allowed only when RPC explicitly returns active true', async () => {
  for (const data of [null, {}, { active: 1 }, { active: 'true' }]) {
    const fixture = createFixture({ sessionResult: { data, error: null } });
    const result = await invoke(fixture, 'list');
    assert.equal(result.status, 403);
    assert.deepEqual(fixture.accountOperations, []);
  }
});

test('client-supplied session status cannot replace the caller-context RPC result', async () => {
  const fixture = createFixture({ sessionResult: { data: { active: false }, error: null } });
  const result = await fixture.handler(new Request('https://function.test/staff-auth', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer valid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'list', businessSession: { active: true } }),
  }));

  assert.equal(result.status, 403);
  assert.deepEqual(fixture.accountOperations, []);
});

test('invalid create input returns 400 without touching account data', async () => {
  const fixture = createFixture();
  const result = await invoke(fixture, 'create', { username: 'Ana Cruz' });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'An assigned branch is required.');
  assert.deepEqual(fixture.accountOperations, []);
  assert.deepEqual(fixture.authAdminOperations, []);
});

test('Staff login still returns its Auth session', async () => {
  const fixture = createFixture();
  const loginRequest = new Request('https://function.test/staff-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'Ana', password: 'EMP-001' }),
  });

  const result = await fixture.handler(loginRequest);

  assert.equal(result.status, 200);
  assert.equal((await result.json()).session.access_token, 'staff-access-token');
});

test('Staff login uses the authoritative Auth email for the profile UID', async () => {
  const fixture = createFixture({
    staffProfiles: [{ ...staffAccount, email: 'stale-profile@example.test' }],
  });
  const result = await fixture.handler(new Request('https://function.test/staff-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', username: 'ana_staff', password: 'unchanged-password' }),
  }));

  assert.equal(result.status, 200);
  assert.equal((await result.json()).ok, true);
  assert.deepEqual(
    fixture.calls.find((call) => call.kind === 'auth-login'),
    { kind: 'auth-login', email: 'staff@example.test', password: 'unchanged-password' },
  );
});

function ownerLoginRequest(username, password) {
  return new Request('https://function.test/staff-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'owner-login', username, password }),
  });
}

test('Owner username login preserves apostrophes and returns the existing Auth session', async () => {
  const fixture = createFixture({
    ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: true },
    authUserId: 'owner-id',
  });
  const result = await fixture.handler(ownerLoginRequest("  OWNERGELO'26  ", 'owner-password'));

  assert.equal(result.status, 200);
  const body = await result.json();
  assert.equal(body.ok, true);
  assert.equal(body.session.access_token, 'staff-access-token');
});

test('Owner login rejects unknown, inactive, Staff, and mismatched Auth identities', async () => {
  const cases = [
    { ownerProfile: { id: 'owner-id', username: 'different-owner', email: 'owner@example.test', role: 'owner', active: true }, authUserId: 'owner-id' },
    { ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: false }, authUserId: 'owner-id' },
    { ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'staff', active: true }, authUserId: 'owner-id' },
    { ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: true }, authUserId: 'another-id' },
  ];
  for (const options of cases) {
    const fixture = createFixture(options);
    const result = await fixture.handler(ownerLoginRequest("ownergelo'26", 'owner-password'));
    assert.equal(result.status, options.authUserId === 'another-id' ? 500 : 200);
    const body = await result.json();
    if (options.authUserId === 'another-id') assert.equal(body.ok, false);
    else assert.equal(body.code, 'invalid_credentials');
  }
});

test('Owner login maps Supabase invalid credentials to a safe error', async () => {
  const fixture = createFixture({
    ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: true },
    authUserId: 'owner-id',
    authLoginError: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
  });
  const result = await fixture.handler(ownerLoginRequest("ownergelo'26", 'wrong-password'));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: false, code: 'invalid_credentials' });
});

test('Owner login diagnostic logs expose only safe stage metadata', async () => {
  const fixture = createFixture({
    ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: true },
    authUserId: 'owner-id',
  });
  const entries = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args) => entries.push({ level: 'info', args });
  console.error = (...args) => entries.push({ level: 'error', args });
  try {
    const result = await fixture.handler(ownerLoginRequest("ownergelo'26", 'owner-password'));
    assert.equal(result.status, 200);
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  assert.deepEqual(
    entries.find((entry) => entry.args[0] === '[staff-auth] Owner profile lookup succeeded').args[1],
    { found: true, role: 'owner', active: true, hasEmail: true },
  );
  assert.deepEqual(
    entries.find((entry) => entry.args[0] === '[staff-auth] Owner Auth identity check completed').args[1],
    { sessionPresent: true, userIdMatchesProfile: true },
  );
  assert.doesNotMatch(JSON.stringify(entries), /owner-password|owner@example\.test|access_token|refresh_token|ownergelo/);
});

test('Owner Auth failure diagnostic logs only its code and HTTP status', async () => {
  const fixture = createFixture({
    ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: true },
    authUserId: 'owner-id',
    authLoginError: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
  });
  const entries = [];
  const originalError = console.error;
  console.error = (...args) => entries.push(args);
  try {
    const result = await fixture.handler(ownerLoginRequest("ownergelo'26", 'wrong-password'));
    assert.equal(result.status, 200);
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(
    entries.find((args) => args[0] === '[staff-auth] Owner Supabase Auth sign-in failed')[1],
    { status: 400, code: 'invalid_credentials' },
  );
  assert.doesNotMatch(JSON.stringify(entries), /wrong-password|owner@example\.test|access_token|refresh_token|ownergelo/);
});

test('Owner login rejects missing username or password without authenticating', async () => {
  for (const [username, password] of [['', 'owner-password'], ['ownergelo\'26', '']]) {
    const fixture = createFixture({
      ownerProfile: { id: 'owner-id', username: "ownergelo'26", email: 'owner@example.test', role: 'owner', active: true },
      authUserId: 'owner-id',
    });
    const result = await fixture.handler(ownerLoginRequest(username, password));
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { ok: false, code: 'invalid_credentials' });
  }
});

test('unknown action returns a 400 response', async () => {
  const fixture = createFixture({
    ownerProfile: null,
  });
  const result = await invoke(fixture, 'unsupported-action');

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Unknown Staff authentication action.');
});

test('Staff password reset uses the stored Employee ID without changing the Auth UID', async () => {
  const fixture = createFixture();
  const result = await invoke(fixture, 'reset-password', { id: 'staff-id' });

  assert.equal(result.status, 200);
  assert.equal(result.body.account.id, 'staff-id');
  assert.equal(result.body.account.employee_id, 'EMP-2026-123456');
  assert.equal(fixture.authAdminOperations.includes('update'), true);
});

test('bulk provisioning updates active Staff only and skips inactive former employees', async () => {
  const fixture = createFixture({
    staffProfiles: [
      { ...staffAccount, id: 'staff-id', active: true },
      { ...staffAccount, id: 'staff5-id', username: 'staff5_staff', active: false },
      { ...staffAccount, id: 'staff6-id', username: 'staff6_staff', active: false },
    ],
  });
  const result = await invoke(fixture, 'provision-existing');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.accounts.map((account) => account.id), ['staff-id', 'staff5-id', 'staff6-id']);
  assert.deepEqual(fixture.authAdminOperations, ['update']);
  assert.deepEqual(fixture.authAdminPayloads[0], ['staff-id', { password: 'EMP-2026-123456' }]);
});

test('inactive Staff cannot request a password reset', async () => {
  const fixture = createFixture({
    staffProfiles: [{ ...staffAccount, active: false }],
  });
  const result = await invoke(fixture, 'reset-password', { id: 'staff-id' });
  assert.equal(result.status, 403);
  assert.match(result.body.error, /Inactive Staff accounts/);
  assert.deepEqual(fixture.authAdminOperations, []);
});

test('first-login password change uses Admin Auth and clears the profile flag', async () => {
  const fixture = createFixture({ callerUserId: 'staff-id', staffProfiles: [{ ...staffAccount, role: 'staff' }] });
  const result = await invoke(fixture, 'change-password', { newPassword: 'new-secure-password' }, 'Bearer staff-token');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(fixture.authAdminPayloads[0][0], 'staff-id');
  assert.deepEqual(fixture.authAdminPayloads[0][1], { password: 'new-secure-password' });
  assert.equal(fixture.accountOperations.some((item) => item.operation === 'update'), true);
});

test('Owner bootstrap explicitly clears Employee ID and first-login state', () => {
  const migration = readFileSync(new URL('../../migrations/202611160001_employee_ids.sql', import.meta.url), 'utf8');
  const ownerScript = readFileSync(new URL('../../scripts/create-local-owner.sh', import.meta.url), 'utf8');
  assert.match(migration, /set employee_id = null,\s+must_change_password = false/);
  assert.match(ownerScript, /employee_id = null/);
  assert.match(ownerScript, /must_change_password = false/);
});
