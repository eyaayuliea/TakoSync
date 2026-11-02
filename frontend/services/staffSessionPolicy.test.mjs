import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLocalCalendarDay,
  millisecondsUntilNextLocalDay,
} from './staffSessionPolicy.ts';

test('staff session day uses the local calendar date with zero padding', () => {
  assert.equal(getLocalCalendarDay(new Date(2026, 1, 3, 12)), '2026-02-03');
});

test('staff session deadline is the next local midnight', () => {
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 1, 3, 23, 59, 59)), 1000);
  assert.equal(millisecondsUntilNextLocalDay(new Date(2026, 1, 3, 12)), 12 * 60 * 60 * 1000);
});
