import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADJUSTMENT_HISTORY_HEADERS,
  adjustmentHistoryRows,
  DISCREPANCY_HEADERS,
  discrepancyRow,
  filterDiscrepancies,
  reconciliationStatus,
  revisionHistoryRows,
} from './ownerPortalReconciliation.ts';

const fmt = (iso) => iso.slice(0, 16).replace('T', ' ');
const review = (id, overrides = {}) => ({
  countLineId: id, reference: `IC-${id}`, branchId: 'b1', branch: 'Manila · Branch 1', staff: 'Ana Reyes', ingredient: 'Flour', unit: 'kg',
  expected: 50, actual: 45, correctedActual: 45, correctionStatus: null, difference: -5, correctionReason: '', remarks: 'Bag torn',
  submittedAt: `2026-11-2${id}T02:00:00Z`, status: 'Pending', decisionOwner: null, decisionReason: null, decisionAt: null,
  rejection: null, validatedAt: null, validationReason: null, adjustment: null, ...overrides,
});
const reviews = [
  review('1', { status: 'Validated', adjustment: { approvedBy: 'o', approvingOwner: 'Owner Test', reason: 'Recounted', approvedAt: '2026-11-21T05:00:00Z', movementReference: 'TX-9', movement: -5, beforeQuantity: 48, afterQuantity: 43 } }),
  review('2', { branchId: 'b2', branch: 'Branch 2', correctionStatus: 'pending', correctedActual: 47, correctionReason: 'Missed a bag' }),
  review('3', { status: 'Rejected for Recount' }),
  review('4'),
];

test('OW-25 c10: statuses read Pending Review, Adjusted or Rejected for Recount', () => {
  assert.deepEqual(reviews.map(reconciliationStatus), ['Adjusted', 'Pending Review · correction requested', 'Rejected for Recount', 'Pending Review']);
});

test('OW-25 c2: branch and status filters; open reviews first, newest first', () => {
  assert.deepEqual(filterDiscrepancies(reviews, { branchId: null, status: 'All statuses' }).map((r) => r.countLineId), ['4', '2', '3', '1']);
  assert.deepEqual(filterDiscrepancies(reviews, { branchId: null, status: 'Pending Review' }).map((r) => r.countLineId), ['4', '2']);
  assert.deepEqual(filterDiscrepancies(reviews, { branchId: 'b1', status: 'Adjusted' }).map((r) => r.countLineId), ['1']);
});

test('OW-25 c2: the table row has the saved expected, actual, difference, submitter, time, remarks and status', () => {
  const row = discrepancyRow(reviews[3], fmt);
  assert.equal(row.length, DISCREPANCY_HEADERS.length);
  assert.deepEqual(row, ['Flour\nIC-4', 'Manila · Branch 1', '50 kg', '45 kg', '−5 kg', 'Ana Reyes', '2026-11-24 02:00', 'Bag torn', 'Pending Review']);
});

test('OW-25 c3, c4: revision history shows original and revised values, editor and time', () => {
  assert.deepEqual(revisionHistoryRows(reviews[1], fmt), [['45 kg', '47 kg', 'Ana Reyes\n“Missed a bag”', '2026-11-22 02:00', 'Pending owner decision']]);
  assert.deepEqual(revisionHistoryRows(reviews[3], fmt), []);
  const decided = { ...reviews[1], correctionStatus: 'approved', decisionOwner: 'Owner Test', decisionAt: '2026-11-22T03:00:00Z' };
  assert.equal(revisionHistoryRows(decided, fmt)[0][4], 'Approved by Owner Test · 2026-11-22 03:00');
});

test('OW-25 c7, c10: the Adjustment History lists each authorized adjustment', () => {
  const rows = adjustmentHistoryRows(reviews, fmt);
  assert.equal(rows[0].length, ADJUSTMENT_HISTORY_HEADERS.length);
  assert.deepEqual(rows, [['Flour', 'Manila · Branch 1', '48 kg', '45 kg', '43 kg', '−5 kg', 'Recounted', 'Owner Test', '2026-11-21 05:00', 'IC-1\nTX-9']]);
  assert.deepEqual(adjustmentHistoryRows(reviews, fmt, 'b2'), []);
});
