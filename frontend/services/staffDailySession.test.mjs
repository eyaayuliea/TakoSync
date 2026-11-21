import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_STAFF_INACTIVITY_LOCK_MS,
  isDailySessionExpired,
  manilaBusinessDate,
  shouldLockForInactivity,
} from './staffDailySession.ts';

test('Manila business date uses UTC+8 with a midnight cut-off', () => {
  assert.equal(manilaBusinessDate(new Date('2026-11-25T15:59:59Z')), '2026-11-25', '11:59:59 PM Manila');
  assert.equal(manilaBusinessDate(new Date('2026-11-25T16:00:00Z')), '2026-11-26', '12:00 midnight Manila');
  assert.equal(manilaBusinessDate(new Date('2026-12-31T16:30:00Z')), '2027-01-01', 'crosses the year');
  assert.throws(() => manilaBusinessDate(new Date('nope')));
});

test('the daily session expires only after the server business date moves on', () => {
  const signedInAt = '2026-11-25T08:00:00Z'; // 4:00 PM Manila, Nov 25
  assert.equal(isDailySessionExpired(signedInAt, '2026-11-25'), false, 'same business day');
  assert.equal(isDailySessionExpired(signedInAt, '2026-11-26'), true, 'next business day');
  assert.equal(isDailySessionExpired('2026-11-25T15:30:00Z', '2026-11-25'), false, '11:30 PM login, still same day');
  assert.equal(isDailySessionExpired('2026-11-25T16:30:00Z', '2026-11-26'), false, '12:30 AM login belongs to the new day');
});

test('missing or unreadable values never expire the session', () => {
  assert.equal(isDailySessionExpired(null, '2026-11-26'), false);
  assert.equal(isDailySessionExpired('2026-11-25T08:00:00Z', null), false);
  assert.equal(isDailySessionExpired('not a date', '2026-11-26'), false);
  assert.equal(isDailySessionExpired('2026-11-25T08:00:00Z', '26/11/2026'), false);
});

test('the screen locks after the default 5 minutes without activity', () => {
  assert.equal(DEFAULT_STAFF_INACTIVITY_LOCK_MS, 300_000);
  assert.equal(shouldLockForInactivity(0, 299_999), false);
  assert.equal(shouldLockForInactivity(0, 300_000), true);
  assert.equal(shouldLockForInactivity(1_000, 61_000, 60_000), true, 'custom period');
});
