import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOwnerInventoryComparisonRows,
  formatInventoryQuantity,
  getInventoryStockStatus,
} from './ownerInventoryStatus.ts';
import { manilaDateKey } from '../services/businessDaySettings.ts';

const today = '2026-11-19';

test('inventory status follows the required priority for null, zero quantity, and expired batches', () => {
  assert.equal(getInventoryStockStatus(null, 5, '2026-11-18', today), 'Not tracked');
  // Nothing is available, so Out of Stock (exactly 0) wins over a past expiration date.
  assert.equal(getInventoryStockStatus(0, 5, '2026-11-18', today), 'Out of Stock');
  assert.equal(getInventoryStockStatus(1, 5, '2026-11-18', today), 'Expired');
  assert.equal(getInventoryStockStatus(0, 5, null, today), 'Out of Stock');
});

test('Manila date-only expiry boundaries classify today, yesterday, the alert limit, and beyond', () => {
  assert.equal(getInventoryStockStatus(8, 2, '2026-11-18', today, 7), 'Expired');
  assert.equal(getInventoryStockStatus(8, 2, '2026-11-19', today, 7), 'Near Expiration');
  assert.equal(getInventoryStockStatus(8, 2, '2026-11-26', today, 7), 'Near Expiration');
  assert.equal(getInventoryStockStatus(8, 2, '2026-11-27', today, 7), 'Normal');
});

test('default expiration status uses the current Manila date', () => {
  assert.equal(getInventoryStockStatus(1, 0, manilaDateKey(new Date())), 'Near Expiration');
});

test('batch status remains independent while ingredient stock status uses its own balance', () => {
  const batchStatuses = [
    getInventoryStockStatus(1, 0, '2026-11-18', today, 7),
    getInventoryStockStatus(2, 0, '2026-11-19', today, 7),
    getInventoryStockStatus(3, 0, '2026-12-19', today, 7),
  ];

  assert.deepEqual(batchStatuses, ['Expired', 'Near Expiration', 'Normal']);
  assert.equal(getInventoryStockStatus(6, 5, null, today), 'Normal');
  assert.equal(getInventoryStockStatus(5, 5, null, today), 'Low Stock');
  assert.equal(formatInventoryQuantity(1.25), '1.25');
  assert.equal(formatInventoryQuantity(null), '—');
});

test('branch comparison preserves missing versus zero balances and never adds batch quantities to inventory', () => {
  const rows = buildOwnerInventoryComparisonRows({
    branches: [
      { id: 'branch-1', name: 'Branch 1' },
      { id: 'branch-2', name: 'Branch 2' },
      { id: 'branch-3', name: 'Branch 3' },
    ],
    inventory: [
      { branch_id: 'branch-1', ingredient_id: 'flour', quantity: 0, minimum_stock: 2 },
      { branch_id: 'branch-2', ingredient_id: 'flour', quantity: 4.5, minimum_stock: 2 },
    ],
    batches: [
      { id: 'batch-later', branch_id: 'branch-2', ingredient_id: 'flour', batch_reference: 'B-2', expiration_date: '2026-12-01', quantity_remaining: 2.5 },
      { id: 'batch-no-expiry', branch_id: 'branch-2', ingredient_id: 'flour', batch_reference: 'B-3', expiration_date: null, quantity_remaining: 2 },
      { id: 'other-ingredient', branch_id: 'branch-2', ingredient_id: 'sauce', batch_reference: 'S-1', expiration_date: null, quantity_remaining: 10 },
    ],
    ingredientId: 'flour',
    unit: 'kg',
  });

  assert.deepEqual(rows.map(({ branchId, quantity, status, batchCount }) => ({
    branchId, quantity, status, batchCount,
  })), [
    { branchId: 'branch-1', quantity: 0, status: 'Out of Stock', batchCount: 0 },
    { branchId: 'branch-2', quantity: 4.5, status: 'Normal', batchCount: 2 },
    { branchId: 'branch-3', quantity: null, status: 'Not tracked', batchCount: 0 },
  ]);
  assert.equal(rows[1].batchCode, 'B-2');
  const [untracked] = buildOwnerInventoryComparisonRows({
    branches: [{ id: 'branch-1', name: 'Branch 1' }],
    inventory: [{ branch_id: 'branch-1', ingredient_id: 'flour', quantity: null, minimum_stock: 2 }],
    batches: [],
    ingredientId: 'flour',
    unit: 'kg',
  });
  assert.equal(untracked.hasRecord, true);
  assert.equal(untracked.quantity, null);
  assert.equal(untracked.status, 'Not tracked');
});
