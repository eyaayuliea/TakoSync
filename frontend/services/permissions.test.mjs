import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PERMISSIONS,
  ROLE_MASKS,
  ROLE_PERMISSIONS,
  authorize,
  can,
  isInactiveAccountDenial,
  parseGateDenial,
  permissionMask,
  withDenialAudit,
} from './permissions.ts';

const staff = { role: 'staff', active: true, branchId: 'branch-1' };
const owner = { role: 'owner', active: true, branchId: null };

test('the permission set uses 22 distinct bits within 31-bit masks', () => {
  const bits = Object.values(PERMISSIONS);
  assert.equal(bits.length, 22);
  assert.equal(new Set(bits).size, 22);
  assert.ok(bits.every((bit) => Number.isInteger(bit) && bit >= 0 && bit <= 30));
});

test('role masks match the spec matrix and the database seed', () => {
  // Same values the migration stores in public.role_permissions.
  assert.equal(ROLE_MASKS.staff, 2425323);
  assert.equal(ROLE_MASKS.owner, 4193822);
  assert.equal(ROLE_MASKS.system_admin, 32768);
  for (const code of ['SALE_CREATE', 'BATCH_PREP_RECORD', 'STOCKIN_RECORD', 'WASTE_RECORD', 'COUNT_SUBMIT']) {
    assert.ok(ROLE_PERMISSIONS.staff.includes(code) && !ROLE_PERMISSIONS.owner.includes(code), `${code}: staff only`);
  }
  for (const code of ['SALES_VIEW_ALL', 'COUNT_REVIEW', 'ADJUSTMENT_AUTHORIZE', 'CATALOG_CONFIG', 'THRESHOLD_CONFIG',
    'ACCOUNT_MANAGE', 'AUDIT_VIEW', 'AUDIT_VERIFY', 'WEB_PORTAL_ACCESS']) {
    assert.ok(ROLE_PERMISSIONS.owner.includes(code) && !ROLE_PERMISSIONS.staff.includes(code), `${code}: owner only`);
  }
  for (const code of ['SALES_VIEW_BRANCH', 'INV_VIEW_BRANCH', 'REPORT_BRANCH', 'ALERT_VIEW_BRANCH', 'HISTORY_VIEW_BRANCH']) {
    assert.ok(ROLE_PERMISSIONS.owner.includes(code) && ROLE_PERMISSIONS.staff.includes(code), `${code}: both`);
  }
});

test('AC-RBAC-04-01: (roleMask & R) = R is required for every bit of R', () => {
  assert.equal(authorize(staff, permissionMask('SALE_CREATE')), 'ALLOW');
  assert.equal(authorize(staff, permissionMask('SALE_CREATE', 'COUNT_REVIEW')), 'DENY_PERMISSION');
  assert.equal(authorize(owner, permissionMask('COUNT_REVIEW', 'ADJUSTMENT_AUTHORIZE')), 'ALLOW');
  assert.equal(authorize(owner, permissionMask('SALE_CREATE')), 'DENY_PERMISSION');
  assert.equal(authorize({ role: 'system_admin', active: true, branchId: null }, permissionMask('AUDIT_VERIFY')), 'ALLOW');
  assert.equal(authorize({ role: 'system_admin', active: true, branchId: null }, permissionMask('AUDIT_VIEW')), 'DENY_PERMISSION');
});

test('AC-RBAC-04-02: inactive or missing accounts are always denied', () => {
  assert.equal(authorize({ ...owner, active: false }, 0), 'DENY_INACTIVE');
  assert.equal(authorize(null, 0), 'DENY_INACTIVE');
});

test('AC-RBAC-04-03: staff are limited to their branch; the owner sees every branch', () => {
  assert.equal(authorize(staff, permissionMask('INV_VIEW_BRANCH'), 'branch-1'), 'ALLOW');
  assert.equal(authorize(staff, permissionMask('INV_VIEW_BRANCH'), 'branch-2'), 'DENY_BRANCH_SCOPE');
  assert.equal(authorize(owner, permissionMask('INV_VIEW_BRANCH'), 'branch-2'), 'ALLOW');
  assert.equal(can(staff, 'AUDIT_VIEW'), false);
  assert.equal(can(owner, 'AUDIT_VIEW'), true);
});

test('the gate 403 body is recognised', () => {
  const body = {
    code: 'PT403',
    hint: 'PERMISSION_DENIED',
    message: 'Permission denied',
    details: '{"reason" : "DENY_PERMISSION", "endpoint" : "table/audit_logs", "method" : "GET"}',
  };
  assert.deepEqual(parseGateDenial(403, body), { endpoint: 'table/audit_logs', reason: 'DENY_PERMISSION', method: 'GET' });
  assert.equal(parseGateDenial(400, body), null);
  assert.equal(parseGateDenial(403, { code: '42501', message: 'permission denied for table x' }), null);
});

test('AC-RBAC-04-05: a gate denial is reported to log_access_denial with the same credentials', async () => {
  const calls = [];
  const gateBody = JSON.stringify({
    code: 'PT403', hint: 'PERMISSION_DENIED', message: 'Permission denied',
    details: '{"reason" : "DENY_PERMISSION", "endpoint" : "rpc/verify_audit_chain", "method" : "POST"}',
  });
  const baseFetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith('/rpc/log_access_denial')) return new Response(null, { status: 204 });
    return new Response(gateBody, { status: 403, headers: { 'Content-Type': 'application/json' } });
  };
  const wrapped = withDenialAudit(baseFetch, 'http://127.0.0.1:54321');
  const response = await wrapped('http://127.0.0.1:54321/rest/v1/rpc/verify_audit_chain', {
    method: 'POST', headers: { Authorization: 'Bearer user-token', apikey: 'anon' }, body: '{}',
  });
  assert.equal(response.status, 403);
  assert.equal(JSON.parse(await response.text()).code, 'PT403', 'the caller still sees the original denial');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'http://127.0.0.1:54321/rest/v1/rpc/log_access_denial');
  assert.equal(new Headers(calls[1].init.headers).get('Authorization'), 'Bearer user-token');
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    p_endpoint: 'rpc/verify_audit_chain', p_reason: 'DENY_PERMISSION', p_method: 'POST',
  });
});

test('other responses pass through without extra calls', async () => {
  let count = 0;
  const wrapped = withDenialAudit(async () => { count += 1; return new Response('[]', { status: 200 }); }, 'http://x');
  assert.equal((await wrapped('http://x/rest/v1/sales')).status, 200);
  const authDenied = withDenialAudit(async () => { count += 1; return new Response('{}', { status: 403 }); }, 'http://x');
  assert.equal((await authDenied('http://x/auth/v1/user')).status, 403);
  assert.equal(count, 2);
});

test('ST-01 c10: a DENY_INACTIVE gate refusal is recognised as a deactivated account', () => {
  const denial = (reason) => ({ code: 'PT403', hint: 'PERMISSION_DENIED', message: 'Permission denied',
    details: JSON.stringify({ reason, endpoint: 'table/profiles', method: 'GET' }) });
  assert.equal(isInactiveAccountDenial(denial('DENY_INACTIVE')), true);
  assert.equal(isInactiveAccountDenial(denial('DENY_PERMISSION')), false);
  assert.equal(isInactiveAccountDenial({ code: 'PGRST301', message: 'JWT expired' }), false);
  assert.equal(isInactiveAccountDenial(null), false);
});
