import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OWNER_ALERT_EMPTY_MESSAGE,
  OWNER_ALERT_LOAD_ERROR,
  buildOwnerAlertSnapshot,
  countOwnerAlertsWhenReady,
  classifyOwnerExpirationAlert,
  classifyOwnerStockAlert,
  countOwnerAlertCategories,
  daysUntilOwnerExpiration,
  filterOwnerRecordsByBranch,
  sortOwnerExpirationAlerts,
} from './ownerAlerts.ts';

test('classifies stock at the threshold and distinguishes zero stock', () => {
  assert.equal(classifyOwnerStockAlert(5, 5), 'Low Stock');
  assert.equal(classifyOwnerStockAlert(0, 5), 'Out of Stock');
  assert.equal(classifyOwnerStockAlert(6, 5), null);
});

test('classifies expiration using the configured window', () => {
  assert.equal(classifyOwnerExpirationAlert(7, 7), 'Near Expiration');
  assert.equal(classifyOwnerExpirationAlert(8, 7), null);
  assert.equal(classifyOwnerExpirationAlert(-1, 7), 'Expired');
});

test('expiration days use the Manila business date at timezone boundaries', () => {
  assert.equal(daysUntilOwnerExpiration('2026-11-16', new Date('2026-11-15T15:59:59.000Z')), 1);
  assert.equal(daysUntilOwnerExpiration('2026-11-16', new Date('2026-11-15T16:00:00.000Z')), 0);
});

test('sorts expiration alerts earliest first without mutating the source', () => {
  const alerts = [
    { id: 'later', expirationDate: '2026-12-15' },
    { id: 'earlier', expirationDate: '2026-11-20' },
  ];
  assert.deepEqual(sortOwnerExpirationAlerts(alerts).map((item) => item.id), ['earlier', 'later']);
  assert.equal(alerts[0].id, 'later');
});

test('keeps the two tab counts independent and exposes required copy', () => {
  assert.deepEqual(countOwnerAlertCategories(2, 3), { lowStock: 2, expiration: 3 });
  assert.equal(OWNER_ALERT_EMPTY_MESSAGE, 'No alerts at the moment.');
  assert.equal(OWNER_ALERT_LOAD_ERROR, 'Unable to load data. Please check your internet connection and try again.');
});

test('filters alerts for each branch and preserves all-branch monitoring', () => {
  const records = [
    { branch_id: 'branch-1', id: 'one' },
    { branch_id: 'branch-2', id: 'two' },
    { branch_id: 'branch-3', id: 'three' },
  ];
  assert.deepEqual(filterOwnerRecordsByBranch(records, 'branch-1').map((item) => item.id), ['one']);
  assert.deepEqual(filterOwnerRecordsByBranch(records, 'branch-2').map((item) => item.id), ['two']);
  assert.deepEqual(filterOwnerRecordsByBranch(records, 'branch-3').map((item) => item.id), ['three']);
  assert.deepEqual(filterOwnerRecordsByBranch(records, null).map((item) => item.id), ['one', 'two', 'three']);
});

test('Owner alert counts fail closed while inventory refresh is loading or failed', () => {
  const counts = { lowStock: 2, expiration: 3 };
  assert.deepEqual(countOwnerAlertsWhenReady(counts, true, ''), { lowStock: 0, expiration: 0 });
  assert.deepEqual(countOwnerAlertsWhenReady(counts, false, 'refresh failed'), { lowStock: 0, expiration: 0 });
  assert.deepEqual(countOwnerAlertsWhenReady(counts, false, ''), counts);
});

test('builds deduplicated low-stock and expiration projections with consistent counts', () => {
  const snapshot = buildOwnerAlertSnapshot({
    branches: [
      { id: 'branch-1', name: 'Branch 1' },
      { id: 'branch-2', name: 'Branch 2' },
      { id: 'branch-3', name: 'Branch 3' },
    ],
    ingredients: [
      { id: 'flour', name: 'Flour', unit: 'kg', expiration_tracking: true },
      { id: 'sauce', name: 'Sauce', unit: 'bottle', expiration_tracking: true },
      { id: 'oil', name: 'Oil', unit: 'L', expiration_tracking: false },
    ],
    inventory: [
      { branch_id: 'branch-1', ingredient_id: 'flour', quantity: 0, minimum_stock: 5 },
      { branch_id: 'branch-1', ingredient_id: 'sauce', quantity: 5, minimum_stock: 5 },
      { branch_id: 'branch-2', ingredient_id: 'oil', quantity: 6, minimum_stock: 5 },
      { branch_id: 'branch-2', ingredient_id: 'sauce', quantity: 4, minimum_stock: 5 },
      { branch_id: 'branch-2', ingredient_id: 'sauce', quantity: 4, minimum_stock: 5 },
    ],
    batches: [
      { id: 'late', branch_id: 'branch-2', ingredient_id: 'sauce', batch_reference: 'S-2', expiration_date: '2026-11-30', quantity_remaining: 2 },
      { id: 'expired', branch_id: 'branch-1', ingredient_id: 'flour', batch_reference: 'F-1', expiration_date: '2026-11-15', quantity_remaining: 2 },
      { id: 'ignored', branch_id: 'branch-1', ingredient_id: 'oil', batch_reference: 'O-1', expiration_date: '2026-11-17', quantity_remaining: 2 },
      { id: 'empty', branch_id: 'branch-1', ingredient_id: 'flour', batch_reference: 'F-0', expiration_date: '2026-11-17', quantity_remaining: 0 },
    ],
    nearExpirationDays: 14,
    branchId: null,
    now: new Date('2026-11-16T04:00:00.000Z'),
  });

  assert.deepEqual(snapshot.lowStock.map((item) => [item.id, item.status]), [
    ['branch-1:flour', 'Out of Stock'],
    ['branch-2:sauce', 'Low Stock'],
    ['branch-1:sauce', 'Low Stock'],
  ]);
  assert.deepEqual(snapshot.expiration.map((item) => [item.id, item.status]), [
    ['expired', 'Expired'],
    ['late', 'Near Expiration'],
  ]);
  assert.deepEqual(snapshot.counts, { lowStock: 3, expiration: 2 });
});

test('buildOwnerAlertSnapshot applies each branch filter to both categories', () => {
  const base = {
    branches: [{ id: 'branch-1', name: 'Branch 1' }, { id: 'branch-2', name: 'Branch 2' }, { id: 'branch-3', name: 'Branch 3' }],
    ingredients: [{ id: 'flour', name: 'Flour', unit: 'kg', expiration_tracking: true }],
    inventory: [
      { branch_id: 'branch-1', ingredient_id: 'flour', quantity: 1, minimum_stock: 2 },
      { branch_id: 'branch-2', ingredient_id: 'flour', quantity: 0, minimum_stock: 2 },
    ],
    batches: [
      { id: 'b1', branch_id: 'branch-1', ingredient_id: 'flour', batch_reference: 'B1', expiration_date: '2026-11-17', quantity_remaining: 1 },
      { id: 'b2', branch_id: 'branch-2', ingredient_id: 'flour', batch_reference: 'B2', expiration_date: '2026-11-17', quantity_remaining: 1 },
    ],
    nearExpirationDays: 7,
    now: new Date('2026-11-16T04:00:00.000Z'),
  };
  assert.deepEqual(buildOwnerAlertSnapshot({ ...base, branchId: 'branch-1' }).lowStock.map((item) => item.branchId), ['branch-1']);
  assert.deepEqual(buildOwnerAlertSnapshot({ ...base, branchId: 'branch-2' }).expiration.map((item) => item.branchId), ['branch-2']);
  assert.equal(buildOwnerAlertSnapshot({ ...base, branchId: 'branch-3' }).counts.lowStock, 0);
  assert.equal(buildOwnerAlertSnapshot({ ...base, branchId: 'branch-3' }).counts.expiration, 0);
});
