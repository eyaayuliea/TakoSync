import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebReversalReport } from './ownerPortalReversalReport.ts';

const request = (overrides) => ({
  id: overrides.reference, branchId: 'b1', branchName: 'Manila · Branch 1', entryKind: 'movement', entryKey: 'm1',
  entryType: 'stock_in', entryReference: 'TX-ORIGINAL', itemName: 'Octopus', quantity: 2, unit: 'kg',
  entryRecordedAt: '2026-11-22T16:40:00Z', requestedBy: 'u1', requestedByName: 'Ana Reyes', reason: 'Entered 2 kg, was 1.5 kg',
  status: 'approved', requestedAt: '2026-11-22T16:41:00Z', decidedBy: 'o1', decidedByName: 'Gelo', decidedAt: '2026-11-22T16:42:00Z',
  decisionReason: null, ...overrides,
});
const november = { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z') };
const build = (requests, branchId = null) => buildWebReversalReport({
  requests,
  reversingEntries: new Map([['REV-1', [{ reference: 'TX-REVERSE', quantity: 2, unit: 'kg', transactionDate: '2026-11-22T16:42:01Z' }]]]),
  range: november,
  branchId,
  formatDateTime: (iso) => iso,
});

test('OW-20 c2–c6: entry, reason, approval, the reversing entry, and the original kept', () => {
  const report = build([request({ reference: 'REV-1' })]);
  assert.deepEqual(report.rows, [[
    'Stock-In\nTX-ORIGINAL', 'Octopus', '2 kg', 'Manila · Branch 1', 'Kept in history\nRecorded 2026-11-22T16:40:00Z',
    'Entered 2 kg, was 1.5 kg\nAna Reyes', 'Gelo\n2026-11-22T16:42:00Z', 'TX-REVERSE (2 kg)\n2026-11-22T16:42:01Z',
  ]]);
  assert.deepEqual(report.summary, [['Reversed entries', '1'], ['Stock-In', '1']]);
});

test('OW-20 c7: pending and rejected requests are not listed; period and branch apply', () => {
  const report = build([
    request({ reference: 'REV-1' }),
    request({ reference: 'REV-2', status: 'rejected', decisionReason: 'No' }),
    request({ reference: 'REV-3', status: 'pending', decidedBy: null, decidedByName: null, decidedAt: null }),
    request({ reference: 'REV-4', decidedAt: '2026-10-20T00:00:00Z' }),
    request({ reference: 'REV-5', branchId: 'b2', entryType: 'waste' }),
  ]);
  assert.deepEqual(report.references, ['REV-1', 'REV-5']);
  assert.equal(report.rows[1][7], 'Not found');
  assert.deepEqual(build([request({ reference: 'REV-1' }), request({ reference: 'REV-5', branchId: 'b2' })], 'b2').references, ['REV-5']);
});
