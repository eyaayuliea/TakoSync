import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebDailyClosingReport, businessDatesInRange } from './ownerPortalDailyClosingReport.ts';

const november = { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z') };
const now = new Date('2026-11-23T04:00:00Z'); // 23 Nov, noon in Manila

test('OW-11: the business days of the period stop at today (Manila)', () => {
  const dates = businessDatesInRange(november, now);
  assert.equal(dates[0], '2026-11-23');
  assert.equal(dates.at(-1), '2026-11-01');
  assert.equal(dates.length, 23);
  assert.deepEqual(businessDatesInRange({ start: new Date('2026-11-22T16:00:00Z'), end: new Date('2026-11-23T16:00:00Z') }, now), ['2026-11-23']);
});

const closing = (overrides) => ({
  id: 'c1', reference: 'CLOSE-1', branchId: 'b1', businessDate: '2026-11-22', openingFloat: 1000, closingCashCount: 1150,
  recordedCashSales: 245, voidedCashSales: 49, expectedCash: 1196, overShort: -46, cashTransactionCount: 4,
  recordedBy: 'u1', recordedByName: 'Ana Reyes', recordedAt: '2026-11-22T13:00:00Z', ...overrides,
});
const build = (closings, branchId = null) => buildWebDailyClosingReport({
  closings,
  branches: [{ id: 'b1', name: 'Manila · Branch 1' }, { id: 'b2', name: 'Cebu · Branch 2' }],
  range: { start: new Date('2026-11-21T16:00:00Z'), end: new Date('2026-11-23T16:00:00Z') },
  branchId,
  now,
  formatDate: (date) => date,
  formatDateTime: (iso) => iso,
});

test('OW-11 c2–c7: figures of a closing, and "No closing recorded" days', () => {
  const report = build([closing({}), closing({ id: 'c2', branchId: 'b2', overShort: 0, closingCashCount: 1196 })]);
  assert.equal(report.rows.length, 4); // 23 and 22 Nov × 2 branches
  assert.deepEqual(report.rows[0], ['2026-11-23', 'Manila · Branch 1', 'No closing recorded', '—', '—', '—', '—', '—', '—']);
  assert.deepEqual(report.rows[2], [
    '2026-11-22', 'Manila · Branch 1', 'Ana Reyes\n2026-11-22T13:00:00Z',
    '₱1,000.00', '₱196.00', '₱49.00', '₱1,196.00', '₱1,150.00', 'Short ₱46.00',
  ]);
  assert.equal(report.rows[3][8], 'Balanced (₱0.00)');
  assert.deepEqual(report.summary, [['Closings recorded', '2'], ['No closing recorded', '2'], ['Total over', '₱0.00'], ['Total short', '₱46.00']]);
});

test('OW-11 c8: the report can be limited to one branch', () => {
  const report = build([closing({ overShort: 12.5 })], 'b1');
  assert.deepEqual(report.rows.map((row) => row[1]), ['Manila · Branch 1', 'Manila · Branch 1']);
  assert.equal(report.rows[1][8], 'Over ₱12.50');
});
