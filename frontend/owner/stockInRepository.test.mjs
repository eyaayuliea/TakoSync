import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStockInRecords,
  formatStockInDateTime,
  formatStockInExpirationDate,
  formatStockInQuantity,
} from './stockInRepository.ts';

function historyRecord(overrides = {}) {
  return {
    id: 'transaction-1',
    reference: 'SI-1112-0012',
    type: 'Stock-in',
    ingredientId: 'octopus',
    ingredientName: 'Octopus',
    category: 'Seafood',
    quantity: 5,
    unit: 'kg',
    movement: 5,
    branchId: 'branch-2',
    branch: 'Branch 2',
    staffId: 'staff-ana',
    staff: 'Ana Reyes',
    transactionDate: new Date('2026-11-12T08:00:00+08:00'),
    reason: 'Stock-in',
    notes: 'Seaport Traders · DR-20481',
    beforeQuantity: 4,
    afterQuantity: 9,
    batchReference: 'BATCH-1',
    expirationDate: null,
    ...overrides,
  };
}

test('live history mapping filters Stock-in and fills batch expiration and notes', () => {
  const records = buildStockInRecords([
    historyRecord(),
    historyRecord({ id: 'transaction-2', type: 'Waste', transactionDate: new Date('2026-11-12T09:00:00+08:00') }),
    historyRecord({ id: 'transaction-3', reference: 'SI-2', transactionDate: new Date('2026-11-13T09:00:00+08:00') }),
  ], [{ batch_reference: 'BATCH-1', expiration_date: '2026-11-19' }]);

  assert.equal(records.length, 2);
  assert.equal(records[0].reference, 'SI-2');
  assert.equal(records[1].expirationDate, '2026-11-19');
  assert.equal(records[1].supplierReference, 'Seaport Traders · DR-20481');
  assert.equal(records[1].recordedBy, 'Ana Reyes');
});

test('Stock-in date and quantity formatting follows Asia/Manila and positive movement', () => {
  const record = buildStockInRecords([historyRecord()], [])[0];
  assert.equal(formatStockInDateTime(record.createdAt), '12 Nov 2026 · 8:00 AM');
  assert.equal(formatStockInExpirationDate('2026-11-19'), '19 Nov 2026');
  assert.equal(formatStockInQuantity({ ...record, quantity: -5 }), '+5 kg');
});
