import assert from 'node:assert/strict';
import test from 'node:test';
import { staffLockStatus, staffPasswordResetPrompt } from './staffAccountLock.ts';

const now = new Date('2026-11-23T10:00:00Z'); // 6:00 PM Manila

test('OW-27 c9: an account inside its lockout window shows Locked with the end time', () => {
  assert.deepEqual(staffLockStatus({ locked_until: '2026-11-23T10:12:00Z' }, now), { locked: true, label: 'Locked until 6:12 PM' });
});

test('an expired or missing lockout shows Not locked', () => {
  assert.deepEqual(staffLockStatus({ locked_until: '2026-11-23T09:59:00Z' }, now), { locked: false, label: 'Not locked' });
  assert.deepEqual(staffLockStatus({ locked_until: null }, now), { locked: false, label: 'Not locked' });
  assert.deepEqual(staffLockStatus({}, now), { locked: false, label: 'Not locked' });
  assert.deepEqual(staffLockStatus({ locked_until: 'not a date' }, now), { locked: false, label: 'Not locked' });
});

test('OW-27 c10: the reset confirmation names the employee and what happens', () => {
  assert.equal(
    staffPasswordResetPrompt({ full_name: 'Ana Reyes', username: 'ana_reyes' }),
    "Reset Ana Reyes's password to their Employee ID? They must change it at their next login. A locked account is unlocked.",
  );
  assert.match(staffPasswordResetPrompt({ full_name: ' ', username: 'ana_reyes' }), /^Reset ana_reyes's/);
});
