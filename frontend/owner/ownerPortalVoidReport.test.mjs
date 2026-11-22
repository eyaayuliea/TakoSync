import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebVoidReport } from './ownerPortalVoidReport.ts';

const base = {
  branchId: 'b1',
  branchName: 'Manila · Branch 1',
  reason: 'Customer cancelled',
  requestedByName: 'Ana Reyes',
  decidedByName: null,
  decidedAt: null,
  decisionReason: null,
};
const voids = [
  { ...base, id: 'v1', reference: 'VOID-1', status: 'pending_review', requestedAt: '2026-11-20T02:10:00Z', sale: { transactionReference: 'SALE-1', totalAmount: 49, createdAt: '2026-11-20T02:00:00Z' } },
  { ...base, id: 'v2', reference: 'VOID-2', status: 'flagged', requestedAt: '2026-11-21T03:10:00Z', decidedByName: 'Gelo', decidedAt: '2026-11-21T05:00:00Z', decisionReason: 'Too many voids', sale: { transactionReference: 'SALE-2', totalAmount: 98.5, createdAt: '2026-11-21T03:00:00Z' } },
  { ...base, id: 'v3', reference: 'VOID-3', status: 'reviewed', branchId: 'b2', branchName: 'Cebu · Branch 2', requestedAt: '2026-11-21T04:10:00Z', decidedByName: 'Gelo', decidedAt: '2026-11-21T06:00:00Z', sale: { transactionReference: 'SALE-3', totalAmount: 147, createdAt: '2026-11-21T04:00:00Z' } },
  { ...base, id: 'old', reference: 'VOID-0', status: 'rejected', requestedAt: '2026-11-21T01:00:00Z', sale: { transactionReference: 'SALE-0', totalAmount: 10, createdAt: '2026-11-21T00:30:00Z' } },
  { ...base, id: 'out', reference: 'VOID-9', status: 'reviewed', requestedAt: '2026-10-30T01:00:00Z', sale: { transactionReference: 'SALE-9', totalAmount: 20, createdAt: '2026-10-30T00:30:00Z' } },
];
const november = { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z'), branchId: null };

test('OW-10 c6, c7: every void in the period, flagged ones included, with count and total', () => {
  const report = buildWebVoidReport(voids, november);
  assert.deepEqual(report.rows.map((row) => row.transactionReference), ['SALE-3', 'SALE-2', 'SALE-1']);
  assert.equal(report.count, 3);
  assert.equal(report.total, 294.5);
});

test('OW-10 c2–c5: sale, reason, who voided, and the review once there is one', () => {
  const [, flagged, pending] = buildWebVoidReport(voids, november).rows;
  assert.equal(flagged.saleCreatedAt, '2026-11-21T03:00:00Z');
  assert.equal(flagged.saleTotal, 98.5);
  assert.equal(flagged.reason, 'Customer cancelled');
  assert.equal(flagged.voidedBy, 'Ana Reyes');
  assert.equal(flagged.voidedAt, '2026-11-21T03:10:00Z');
  assert.equal(flagged.reviewStatus, 'Flagged');
  assert.equal(flagged.reviewedBy, 'Gelo');
  assert.equal(flagged.reviewedAt, '2026-11-21T05:00:00Z');
  assert.equal(flagged.flagReason, 'Too many voids');
  assert.equal(pending.reviewStatus, 'Pending Review');
  assert.equal(pending.reviewedBy, null);
  assert.equal(pending.reviewedAt, null);
});

test('OW-10: the branch filter applies, and an empty period gives no rows', () => {
  assert.deepEqual(buildWebVoidReport(voids, { ...november, branchId: 'b2' }).rows.map((row) => row.id), ['v3']);
  const empty = buildWebVoidReport(voids, { start: new Date('2026-12-01T00:00:00Z'), end: new Date('2026-12-02T00:00:00Z'), branchId: null });
  assert.deepEqual(empty, { rows: [], count: 0, total: 0 });
});
