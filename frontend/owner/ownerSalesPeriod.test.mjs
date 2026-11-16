import assert from 'node:assert/strict';
import test from 'node:test';
import { getOwnerSalesDateRange } from './ownerSalesPeriod.ts';

test('Owner sales Today uses the Manila calendar date at both timezone edges', () => {
  const beforeManilaMidnight = new Date('2026-11-15T15:59:59.000Z');
  const afterManilaMidnight = new Date('2026-11-15T16:00:00.000Z');

  assert.deepEqual(
    getOwnerSalesDateRange('Today', '', '', beforeManilaMidnight),
    {
      start: new Date('2026-11-14T16:00:00.000Z'),
      end: new Date('2026-11-15T16:00:00.000Z'),
      startText: '2026-11-15',
      endText: '2026-11-15',
    },
  );
  assert.equal(
    getOwnerSalesDateRange('Today', '', '', afterManilaMidnight)?.startText,
    '2026-11-16',
  );
});

test('Owner sales custom ranges preserve Manila calendar boundaries', () => {
  const range = getOwnerSalesDateRange('Custom', '2026-11-01', '2026-11-03', new Date('2026-11-16T00:00:00Z'));
  assert.equal(range?.start.toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(range?.end.toISOString(), '2026-11-03T16:00:00.000Z');
  assert.equal(range?.startText, '2026-11-01');
  assert.equal(range?.endText, '2026-11-03');
});

test('Owner sales rejects an invalid custom range before querying Supabase', () => {
  assert.equal(getOwnerSalesDateRange('Custom', '2026-11-04', '2026-11-03'), null);
});
