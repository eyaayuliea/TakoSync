import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebVoidReport } from './ownerPortalVoidReport.ts';

const base = { branchId: 'b1', branchName: 'Manila · Branch 1', reason: 'Customer cancelled', requestedByName: 'Ana Reyes', decidedByName: null, decidedAt: null };
const requests = [
  { ...base, id: 'v1', reference: 'VOID-1', status: 'approved', requestedAt: '2026-11-20T02:10:00Z', decidedByName: 'Gelo', decidedAt: '2026-11-20T03:00:00Z', sale: { transactionReference: 'SALE-1', totalAmount: 49, createdAt: '2026-11-20T02:00:00Z' } },
  { ...base, id: 'v2', reference: 'VOID-2', status: 'approved', branchId: 'b2', branchName: 'Branch 2', requestedAt: '2026-11-21T03:10:00Z', decidedByName: 'Gelo', decidedAt: '2026-11-21T05:00:00Z', sale: { transactionReference: 'SALE-2', totalAmount: 98.5, createdAt: '2026-11-21T03:00:00Z' } },
  { ...base, id: 'p', reference: 'VOID-3', status: 'pending', requestedAt: '2026-11-21T04:10:00Z', sale: { transactionReference: 'SALE-3', totalAmount: 147, createdAt: '2026-11-21T04:00:00Z' } },
  { ...base, id: 'r', reference: 'VOID-4', status: 'rejected', requestedAt: '2026-11-21T04:20:00Z', decidedByName: 'Gelo', decidedAt: '2026-11-21T06:00:00Z', sale: { transactionReference: 'SALE-4', totalAmount: 10, createdAt: '2026-11-21T04:15:00Z' } },
  { ...base, id: 'out', reference: 'VOID-0', status: 'approved', requestedAt: '2026-10-30T01:00:00Z', decidedByName: 'Gelo', decidedAt: '2026-10-30T02:00:00Z', sale: { transactionReference: 'SALE-0', totalAmount: 20, createdAt: '2026-10-30T00:30:00Z' } },
];
const november = { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z'), branchId: null };

test('OW-10 c6, c7: only approved void requests in the period, with count and total', () => {
  const report = buildWebVoidReport(requests, november);
  assert.deepEqual(report.rows.map((row) => row.transactionReference), ['SALE-2', 'SALE-1']);
  assert.equal(report.count, 2);
  assert.equal(report.total, 147.5);
});

test('OW-10 c2–c5: sale, reason, requester and request time, approving owner and time', () => {
  const [, first] = buildWebVoidReport(requests, november).rows;
  assert.deepEqual(first, {
    id: 'v1', transactionReference: 'SALE-1', branchName: 'Manila · Branch 1', saleCreatedAt: '2026-11-20T02:00:00Z', saleTotal: 49,
    reason: 'Customer cancelled', requestedBy: 'Ana Reyes', requestedAt: '2026-11-20T02:10:00Z', approvedBy: 'Gelo', approvedAt: '2026-11-20T03:00:00Z',
  });
});

test('OW-10: branch filter, and an empty period', () => {
  assert.deepEqual(buildWebVoidReport(requests, { ...november, branchId: 'b2' }).rows.map((row) => row.id), ['v2']);
  assert.deepEqual(buildWebVoidReport(requests, { start: new Date('2026-12-01T00:00:00Z'), end: new Date('2026-12-02T00:00:00Z'), branchId: null }), { rows: [], count: 0, total: 0 });
});
