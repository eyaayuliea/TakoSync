import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../../../../frontend/services/testTsLoader.mjs', import.meta.url);
const { createStaffAuthHandler } = await import('./handler.ts');

const staffAccount = {
  id: 'staff-id',
  username: 'ana_staff',
  full_name: 'Ana Cruz',
  branch_id: 'branch-id',
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
};

function createFixture({
  ownerProfile = { id: 'owner-id', role: 'owner', active: true },
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
              if (token !== 'valid-token') {
                return { data: { user: null }, error: userError ?? { status: 401, code: 'invalid_token' } };
              }
              if (userError) return { data: { user: null }, error: userError };
              return { data: { user: { id: 'owner-id' } }, error: null };
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
              updateUserById: async () => {
                calls.push({ kind: 'account-auth-admin' });
                authAdminOperations.push('update');
                return { error: null };
              },
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
          signInWithPassword: async () => ({
            data: {
              user: { id: 'staff-id' },
              session: {
                access_token: 'staff-access-token',
                refresh_token: 'staff-refresh-token',
                expires_in: 3600,
                expires_at: 2000000000,
                token_type: 'bearer',
              },
            },
            error: null,
          }),
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
        current.operation === 'update';
      if (isStaffAccountQuery) {
        accountOperations.push({ table, operation: current.operation });
        calls.push({ kind: 'account-operation', table, operation: current.operation });
      }

      if (table === 'branches') {
        branches.push({ id: filters.id ?? 'branch-id', name: 'Cebu Branch', active: true });
        const row = { id: filters.id ?? 'branch-id', name: 'Cebu Branch' };
        return resultShape === 'many'
          ? { data: [row], error: null }
          : { data: filters.id ? row : null, error: null };
      }
      if (table !== 'profiles') return { data: null, error: null };

      if (filters.id === 'owner-id') {
        profiles.push(ownerProfile);
        return { data: ownerProfile, error: null };
      }
      if (filters.id === 'staff-id' && filters.role === 'staff') {
        return { data: { ...staffAccount, email: 'staff@example.test', role: 'staff' }, error: null };
      }
      if (filters.username === 'ana_staff' && current.selectedFields.includes('email')) {
        return {
          data: { ...staffAccount, email: 'staff@example.test', role: 'staff' },
          error: null,
        };
      }
      if (filters.role === 'staff' && resultShape === 'many') {
        return { data: [staffAccount], error: null };
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
  return { handler, calls, accountOperations, authAdminOperations, profiles, branches };
}

function request(action, account, authorization = 'Bearer valid-token') {
  const headers = { 'Content-Type': 'application/json' };
  if (authorization) headers.Authorization = authorization;
  return new Request('https://function.test/staff-auth', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...(account ? { account } : {}) }),
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
      ? { username: 'Ana Cruz', employeeId: 'EMP-001', branchId: 'branch-id' }
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
    username: 'Ana Cruz', employeeId: 'EMP-001', branchId: 'branch-id',
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
      username: 'Ana Cruz', employeeId: 'EMP-001', branchId: 'branch-id',
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
  const result = await invoke(fixture, 'create', { username: 'Ana Cruz', employeeId: 'EMP-001' });

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

test('unknown action returns a 400 response', async () => {
  const fixture = createFixture({
    ownerProfile: null,
  });
  const result = await invoke(fixture, 'unsupported-action');

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'Unknown Staff authentication action.');
});
