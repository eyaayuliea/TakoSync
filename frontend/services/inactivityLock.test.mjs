import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityStorageKey,
  inactivityRemaining,
  INACTIVITY_TIMEOUT_MS,
  isEndedAuthSession,
  LockedSessionEndedError,
  readActivityTimestamp,
  verifyInactivityUnlock,
} from './inactivityLock.ts';

const staff = { id: 'staff-a', role: 'Staff', branchId: 'branch-a' };
const owner = { id: 'owner-a', role: 'Owner', branchId: null };
const now = 10_000_000;

test('the inactivity deadline includes time spent in the background', () => {
  assert.equal(inactivityRemaining(now, now), INACTIVITY_TIMEOUT_MS);
  assert.equal(inactivityRemaining(now, now + INACTIVITY_TIMEOUT_MS - 1), 1);
  assert.equal(inactivityRemaining(now, now + INACTIVITY_TIMEOUT_MS), 0);
  assert.equal(inactivityRemaining(now, now + INACTIVITY_TIMEOUT_MS * 2), 0);
});

test('restored activity is isolated by user, role and branch', () => {
  assert.notEqual(activityStorageKey(staff), activityStorageKey(owner));
  assert.notEqual(activityStorageKey(staff), activityStorageKey({ ...staff, branchId: 'branch-b' }));
  assert.notEqual(activityStorageKey(staff), activityStorageKey({ ...staff, role: 'Owner' }));
  assert.equal(inactivityRemaining(readActivityTimestamp(String(now)), now + 1000), INACTIVITY_TIMEOUT_MS - 1000);
});

test('restart with missing, corrupt or future activity requires reauthentication', () => {
  for (const stored of [null, '', 'bad', '-1', String(now + 1000)]) {
    assert.equal(inactivityRemaining(readActivityTimestamp(stored), now), 0);
  }
});

test('valid Staff and Owner credentials unlock only the original authorization', async () => {
  for (const account of [staff, owner]) {
    let checks = 0;
    const user = await verifyInactivityUnlock(account, async () => {
      checks += 1;
      return { ...account, source: 'current session' };
    }, async () => account);
    assert.deepEqual(user, { ...account, source: 'current session' });
    assert.equal(checks, 2);
  }
});

test('a different account cannot unlock the workspace', async () => {
  await assert.rejects(
    verifyInactivityUnlock(staff, async () => staff, async () => ({ ...staff, id: 'staff-b' })),
    /Use the credentials for the account/,
  );
});

test('incorrect passwords and connection errors leave the unlock attempt rejected', async () => {
  for (const message of ['Incorrect password.', 'Unable to connect.']) {
    const error = new Error(message);
    await assert.rejects(verifyInactivityUnlock(staff, async () => staff, async () => { throw error; }), error);
  }
});

test('a signed-out or expired session cannot be recreated from the lock screen', async () => {
  let checkedPassword = false;
  await assert.rejects(verifyInactivityUnlock(staff, async () => null, async () => {
    checkedPassword = true;
    return staff;
  }), LockedSessionEndedError);
  assert.equal(checkedPassword, false);
});

test('logout, changed identity or branch reassignment during verification prevents unlock', async () => {
  for (const changed of [null, owner, { ...staff, branchId: 'branch-b' }]) {
    let checks = 0;
    await assert.rejects(
      verifyInactivityUnlock(staff, async () => ++checks === 1 ? staff : changed, async () => staff),
      LockedSessionEndedError,
    );
  }
});

test('a fresh login with changed role or branch requires a full sign-in', async () => {
  for (const changed of [{ ...staff, role: 'Owner' }, { ...staff, branchId: 'branch-b' }]) {
    await assert.rejects(
      verifyInactivityUnlock(staff, async () => staff, async () => changed),
      LockedSessionEndedError,
    );
  }
});

test('invalid legacy and current refresh responses end the session while offline errors keep it locked', () => {
  assert.equal(isEndedAuthSession({ name: 'AuthApiError', status: 400, message: 'Refresh token not found' }), true);
  assert.equal(isEndedAuthSession({ name: 'AuthApiError', status: 400, code: 'session_expired', message: 'Expired' }), true);
  assert.equal(isEndedAuthSession({ name: 'AuthRetryableFetchError', status: 503, message: 'Service unavailable' }), false);
  assert.equal(isEndedAuthSession({ name: 'AuthApiError', status: 400, code: 'invalid_request', message: 'Invalid request' }), false);
});
