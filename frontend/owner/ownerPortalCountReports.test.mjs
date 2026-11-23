import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebAdjustmentReport, buildWebCountReport } from './ownerPortalCountReports.ts';

const november = { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z') };
const record = (overrides) => ({
  id: `physical-count-${overrides.countLineId}`, reference: 'COUNT-1', ingredientId: 'octopus', ingredientName: 'Octopus',
  branchId: 'b1', branchName: 'Branch 1', expectedQuantity: 5, originalActualQuantity: 4.5, actualQuantity: 4.5, difference: -0.5,
  unit: 'kg', submittedAt: '2026-11-22T10:00:00Z', submittedBy: 'Ana Reyes', employeeId: null, email: null, role: null,
  countStatus: 'Submitted', result: 'Lower than Expected', discrepancyReference: null, discrepancyStatus: 'Pending Review',
  discrepancyReviewId: null, revision: null, ...overrides,
});
const review = (overrides) => ({
  countLineId: 'l1', reference: 'COUNT-1', correctionRequestId: 'DISC-1', branchId: 'b1', branch: 'Branch 1', ingredient: 'Octopus',
  unit: 'kg', expected: 5, difference: -0.5, remarks: 'Two packs thawed', adjustment: null, ...overrides,
});
const adjustment = { approvingOwner: 'Gelo', reason: 'Count confirmed', approvedAt: '2026-11-22T12:00:00Z', movementReference: 'TX-ADJ', beforeQuantity: 5, afterQuantity: 4.5 };

test('OW-18 c2–c7: count rows with remarks, statuses, revision and lock', () => {
  const report = buildWebCountReport({
    records: [
      record({ countLineId: 'l1' }),
      record({ countLineId: 'l2', ingredientName: 'Takoyaki sauce', unit: 'L', expectedQuantity: 2, actualQuantity: 1.8, difference: -0.2,
        countStatus: 'Validated', discrepancyStatus: 'Adjusted', submittedAt: '2026-11-21T10:00:00Z',
        revision: { originalValue: 1.6, revisedValue: 1.8, editor: 'Gelo', date: '2026-11-21T11:00:00Z' } }),
      record({ countLineId: 'l3', difference: 0, actualQuantity: 5, countStatus: 'Validated', discrepancyStatus: null, submittedAt: '2026-11-20T10:00:00Z' }),
      record({ countLineId: 'old', submittedAt: '2026-10-01T00:00:00Z' }),
    ],
    reviews: [review({}), review({ countLineId: 'l2', remarks: '', adjustment })],
    range: november,
    branchId: null,
    formatDateTime: (iso) => iso,
  });
  assert.equal(report.rows.length, 3);
  assert.deepEqual(report.rows[0], ['Octopus', '5 kg', '4.5 kg', '−0.5 kg', 'Branch 1', '2026-11-22T10:00:00Z', 'Ana Reyes\n“Two packs thawed”', 'Submitted', 'Pending Review', '—', '—']);
  assert.deepEqual(report.rows[1].slice(7), ['Validated', 'Adjusted', '1.6 L → 1.8 L\nGelo · 2026-11-21T11:00:00Z', 'Locked (adjustment authorized)']);
  assert.equal(report.rows[1][6], 'Ana Reyes');
  assert.equal(report.rows[2][8], 'No discrepancy');
  assert.deepEqual(report.summary, [['Counted items', '3'], ['With a discrepancy', '2'], ['Pending review', '1'], ['Locked', '1']]);
});

test('OW-19 c2–c6: only authorized adjustments, with the amount and the discrepancy record', () => {
  const report = buildWebAdjustmentReport({
    reviews: [review({}), review({ countLineId: 'l2', adjustment }), review({ countLineId: 'l3', branchId: 'b2', adjustment, correctionRequestId: 'pending-count:x' })],
    range: november,
    branchId: null,
    formatDateTime: (iso) => iso,
  });
  assert.equal(report.rows.length, 2);
  assert.deepEqual(report.rows[0], ['Octopus', 'Branch 1', '5 kg', '4.5 kg', '4.5 kg', '−0.5 kg', 'Count confirmed', 'Gelo\n2026-11-22T12:00:00Z', 'Count COUNT-1\nDISC-1\nTX-ADJ (5 kg → 4.5 kg)']);
  assert.equal(report.rows[1][8], 'Count COUNT-1\nTX-ADJ (5 kg → 4.5 kg)');
  const uuid = buildWebAdjustmentReport({ reviews: [review({ adjustment: { ...adjustment, beforeQuantity: 45, afterQuantity: 44.5 }, correctionRequestId: 'fcd9932c-6d58-4b38-912a-571b09cb083e' })], range: november, branchId: null, formatDateTime: (iso) => iso });
  assert.deepEqual(uuid.rows[0].slice(4), ['4.5 kg', '−0.5 kg', 'Count confirmed', 'Gelo\n2026-11-22T12:00:00Z', 'Count COUNT-1\nTX-ADJ (45 kg → 44.5 kg)']);
  assert.equal(buildWebAdjustmentReport({ reviews: [review({ adjustment })], range: november, branchId: 'b2', formatDateTime: (iso) => iso }).rows.length, 0);
});
