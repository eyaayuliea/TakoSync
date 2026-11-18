import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStockInRecords,
  formatStockInDateTime,
  formatStockInExpirationDate,
  formatStockInQuantity,
  getForcedStockInState,
  getStockInMockRecords,
} from './stockInRepository.ts';

function historyRecord(overrides = {}) {
  return {
    id: 'transaction-1',
    reference: 'SI-1112-0012',
    type: 'Stock-In',
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
    reason: 'Stock-In',
    notes: 'Seaport Traders · DR-20481',
    beforeQuantity: 4,
    afterQuantity: 9,
    batchReference: 'BATCH-1',
    expirationDate: null,
    ...overrides,
  };
}

test('Stock-In list uses seeded values, shared units, and newest-first ordering', () => {
  const records = getStockInMockRecords();
  assert.deepEqual(records.map((record) => [
    record.ingredientName,
    formatStockInQuantity(record),
    record.branchName,
  ]), [
    ['Octopus', '+5 kg', 'Branch 2'],
    ['All-Purpose Flour', '+25 kg', 'Branch 1'],
    ['Eggs', '+60 pcs', 'Branch 3'],
    ['Takoyaki Sauce', '+4 L', 'Branch 1'],
  ]);
  assert.equal(records[0].reference, 'SI-1112-0012');
  assert.equal(records[0].recordedBy, 'Ana Reyes');
});

test('live history mapping filters Stock-In and fills batch expiration and notes', () => {
  const records = buildStockInRecords([
    historyRecord(),
    historyRecord({ id: 'transaction-2', type: 'Waste', transactionDate: new Date('2026-11-12T09:00:00+08:00') }),
  ], [{ batch_reference: 'BATCH-1', expiration_date: '2026-11-19' }]);

  assert.equal(records.length, 1);
  assert.equal(records[0].expirationDate, '2026-11-19');
  assert.equal(records[0].supplierReference, 'Seaport Traders · DR-20481');
  assert.equal(records[0].recordedBy, 'Ana Reyes');
});

test('Stock-In date and quantity formatting follows Asia/Manila and positive movement', () => {
  const record = getStockInMockRecords()[0];
  assert.equal(formatStockInDateTime(record.createdAt), '12 Nov 2026 · 8:00 AM');
  assert.equal(formatStockInExpirationDate('2026-11-19'), '19 Nov 2026');
  assert.equal(formatStockInQuantity({ ...record, quantity: -5 }), '+5 kg');
});

test('Stock-In forced-state values are validated', () => {
  const previous = process.env.EXPO_PUBLIC_FORCE_STOCK_IN_STATE;
  try {
    process.env.EXPO_PUBLIC_FORCE_STOCK_IN_STATE = 'error';
    assert.equal(getForcedStockInState(), 'error');
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_FORCE_STOCK_IN_STATE;
    else process.env.EXPO_PUBLIC_FORCE_STOCK_IN_STATE = previous;
  }
});
