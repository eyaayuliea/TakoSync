import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStockInRecords,
  formatStockInDateTime,
  formatStockInExpirationDate,
  formatStockInQuantity,
  stockInEnteredQuantity,
  stockInListDate,
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

test('live history mapping filters Stock-In and fills batch expiration and notes', () => {
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

test('Stock-In date and quantity formatting follows Asia/Manila and positive movement', () => {
  const record = buildStockInRecords([historyRecord()], [])[0];
  assert.equal(formatStockInDateTime(record.createdAt), '12 Nov 2026 · 8:00 AM');
  assert.equal(formatStockInExpirationDate('2026-11-19'), '19 Nov 2026');
  assert.equal(formatStockInQuantity({ ...record, quantity: -5 }), '+5 kg');
});

test('OM-18 c3: a reversed Stock-In stays listed and is marked reversed', () => {
  const records = buildStockInRecords(
    [historyRecord(), historyRecord({ id: 'transaction-2', reference: 'SI-1112-0013' })],
    [],
    new Set(['transaction-2']),
  );
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => [record.reference, record.isReversed]).sort(), [['SI-1112-0012', false], ['SI-1112-0013', true]]);
});

test('OM-18 c2: a receipt adds date purchased, date received, the supplier, and the entered pack quantity', () => {
  const receipts = new Map([['transaction-1', {
    receiptReference: 'STOCKIN-20261123-0008', supplierReference: 'Seaside Market OR-1182',
    datePurchased: '2026-11-22', dateReceived: '2026-11-23', recordedAt: '2026-11-22T16:40:00Z',
    enteredQuantity: 3, enteredUnit: 'pack',
  }]]);
  const [withReceipt] = buildStockInRecords(
    [historyRecord({ ingredientName: 'Takoyaki sauce', quantity: 1.08, unit: 'L', notes: 'STOCKIN-20261123-0008 · Seaside Market OR-1182' })],
    [], new Set(), receipts,
  );
  assert.equal(withReceipt.datePurchased, '2026-11-22');
  assert.equal(withReceipt.dateReceived, '2026-11-23');
  assert.equal(withReceipt.supplierReference, 'Seaside Market OR-1182');
  assert.equal(withReceipt.receiptReference, 'STOCKIN-20261123-0008');
  assert.equal(stockInEnteredQuantity(withReceipt), '3 pack = 1.08 L');
  // OM-18 c1: the row shows the date received and the time the entry was recorded.
  assert.equal(stockInListDate({ ...withReceipt, recordedAt: null }), 'Received 23 Nov 2026 · recorded 12 Nov 2026 · 8:00 AM');
  assert.equal(stockInListDate({ ...withReceipt, recordedAt: null, dateReceived: '2026-11-12' }), 'Received 12 Nov 2026 · recorded 8:00 AM');
  // The time staff saved the receipt, not the ledger date, when the receipt has it.
  assert.equal(stockInListDate({ ...withReceipt, recordedAt: '2026-11-23T09:57:00Z' }), 'Received 23 Nov 2026 · recorded 5:57 PM');

  // Entered in the base unit: no separate "as entered" line. Older entries keep their timestamp and notes.
  const [baseUnit] = buildStockInRecords([historyRecord()], [], new Set(),
    new Map([['transaction-1', { ...receipts.get('transaction-1'), enteredQuantity: 5, enteredUnit: 'kg', supplierReference: null }]]));
  assert.equal(stockInEnteredQuantity(baseUnit), null);
  assert.equal(baseUnit.supplierReference, '');
  const [legacy] = buildStockInRecords([historyRecord()], []);
  assert.equal(legacy.dateReceived, null);
  assert.equal(legacy.supplierReference, 'Seaport Traders · DR-20481');
  assert.match(stockInListDate(legacy), /2026/);
});

test('a batter batch yield is not a Stock-In report row', () => {
  const records = buildStockInRecords([
    historyRecord(),
    historyRecord({ id: 'transaction-9', ingredientName: 'Prepared Takoyaki Batter', reason: 'Batter preparation' }),
  ], []);
  assert.deepEqual(records.map((record) => record.ingredientName), ['Octopus']);
});
