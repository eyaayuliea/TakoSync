import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebStockInReport, stockInReportTime } from './ownerPortalStockInReport.ts';

const record = (overrides) => ({
  id: overrides.id,
  reference: `TX-${overrides.id}`,
  ingredientId: 'octopus',
  ingredientName: 'Octopus',
  quantity: 2,
  unit: 'kg',
  branchName: 'Manila · Branch 1',
  createdAt: '2026-11-20T02:00:00Z',
  expirationDate: null,
  supplierReference: '',
  recordedBy: 'Ana Reyes',
  isReversed: false,
  receiptReference: null,
  datePurchased: null,
  dateReceived: null,
  recordedAt: null,
  enteredQuantity: null,
  enteredUnit: null,
  ...overrides,
});
const november = { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z') };

test('OW-15: a receipt counts on its date received (Manila), older entries on their timestamp', () => {
  assert.equal(stockInReportTime({ dateReceived: '2026-11-01', createdAt: '2026-11-03T00:00:00Z' }), Date.parse('2026-10-31T16:00:00Z'));
  assert.equal(stockInReportTime({ dateReceived: null, createdAt: '2026-11-03T00:00:00Z' }), Date.parse('2026-11-03T00:00:00Z'));
  // Received 1 Dec in Manila is outside November even though it was recorded in November.
  const report = buildWebStockInReport([record({ id: 'dec', dateReceived: '2026-12-01', createdAt: '2026-11-30T15:00:00Z' })], november);
  assert.deepEqual(report.rows, []);
});

test('OW-15 c6, c7: reversed entries stay listed but are not in the per-ingredient totals', () => {
  const report = buildWebStockInReport([
    record({ id: 'a', quantity: 2, dateReceived: '2026-11-02' }),
    record({ id: 'b', quantity: 1.5, dateReceived: '2026-11-05' }),
    record({ id: 'c', quantity: 4, isReversed: true, dateReceived: '2026-11-04' }),
    record({ id: 'd', ingredientName: 'Takoyaki sauce', unit: 'L', quantity: 1.08, createdAt: '2026-11-10T01:00:00Z' }),
    record({ id: 'old', quantity: 9, createdAt: '2026-10-20T01:00:00Z' }),
  ], november);
  assert.deepEqual(report.rows.map((row) => row.id), ['d', 'b', 'c', 'a']);
  assert.equal(report.rows.find((row) => row.id === 'c').isReversed, true);
  assert.deepEqual(report.totals, [
    { ingredientName: 'Octopus', unit: 'kg', quantity: 3.5, entries: 2 },
    { ingredientName: 'Takoyaki sauce', unit: 'L', quantity: 1.08, entries: 1 },
  ]);
});

test('OW-15: same-day receipts are grouped newest recorded first', () => {
  const report = buildWebStockInReport([
    record({ id: 'r1-sauce', dateReceived: '2026-11-23', recordedAt: '2026-11-22T16:40:00Z', createdAt: '2026-11-22T16:00:00Z' }),
    record({ id: 'r2-sauce', dateReceived: '2026-11-23', recordedAt: '2026-11-22T20:14:00Z', createdAt: '2026-11-22T16:00:00Z' }),
    record({ id: 'r2-octopus', dateReceived: '2026-11-23', recordedAt: '2026-11-22T20:14:00Z', createdAt: '2026-11-22T16:00:00Z' }),
    record({ id: 'r1-octopus', dateReceived: '2026-11-23', recordedAt: '2026-11-22T16:40:00Z', createdAt: '2026-11-22T16:00:00Z' }),
  ], november);
  assert.deepEqual(report.rows.map((row) => row.id.slice(0, 2)), ['r2', 'r2', 'r1', 'r1']);
});
