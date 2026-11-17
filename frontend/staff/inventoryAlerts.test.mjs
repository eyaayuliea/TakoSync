import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyExpirationAlert,
  classifyStockAlert,
  countInventoryAlertsByKind,
  countInventoryAlertsWhenReady,
  deduplicateInventoryAlerts,
  filterBatchesWithRemainingStock,
  filterBranchInventoryAlertItems,
  inventoryAlertLabel,
  sortInventoryAlerts,
} from './inventoryAlerts.ts';

test('branch alert candidates exclude items without an assigned-branch inventory row', () => {
  const items = [
    { id: 'branch-item', hasBranchInventory: true },
    { id: 'other-branch-item', hasBranchInventory: false },
  ];
  assert.deepEqual(filterBranchInventoryAlertItems(items), [items[0]]);
});

test('branch-scoped Staff projections use only assigned-branch inventory rows', () => {
  const items = [
    { id: 'branch-item', hasBranchInventory: true },
    { id: 'catalog-only-item', hasBranchInventory: false },
  ];
  assert.deepEqual(filterBranchInventoryAlertItems(items).map((item) => item.id), ['branch-item']);
});

test('expiration alerts ignore depleted batches while the inventory details can retain batch history', () => {
  const batches = [
    { reference: 'active', quantityRemaining: 2 },
    { reference: 'depleted', quantityRemaining: 0 },
  ];
  assert.deepEqual(filterBatchesWithRemainingStock(batches), [batches[0]]);
  assert.equal(batches.length, 2);
});

test('duplicate item and batch alerts are emitted once', () => {
  const alerts = [
    { id: 'near-expiration-flour-batch-1', label: 'first' },
    { id: 'near-expiration-flour-batch-1', label: 'duplicate' },
    { id: 'near-expiration-flour-batch-2', label: 'different batch' },
  ];
  assert.deepEqual(deduplicateInventoryAlerts(alerts), [alerts[0], alerts[2]]);
});

test('stock alert classification distinguishes out of stock from low stock', () => {
  assert.equal(classifyStockAlert(0, 5), 'outOfStock');
  assert.equal(classifyStockAlert(3, 5), 'lowStock');
  assert.equal(classifyStockAlert(5, 5), 'lowStock');
  assert.equal(classifyStockAlert(6, 5), null);
});

test('expiration alerts use the configured near-expiration window and retain expired batches', () => {
  assert.equal(classifyExpirationAlert(-1, 21), 'expired');
  assert.equal(classifyExpirationAlert(0, 21), 'nearExpiration');
  assert.equal(classifyExpirationAlert(21, 21), 'nearExpiration');
  assert.equal(classifyExpirationAlert(22, 21), null);
});

test('alert labels match the four Staff alert categories', () => {
  assert.deepEqual(
    ['lowStock', 'outOfStock', 'nearExpiration', 'expired'].map(inventoryAlertLabel),
    ['Low Stock', 'Out of Stock', 'Near Expiration', 'Expired'],
  );
});

test('stock alerts sort by lowest remaining quantity first', () => {
  const alerts = [
    { id: 'a', kind: 'lowStock', title: 'Rice', quantity: 4 },
    { id: 'b', kind: 'outOfStock', title: 'Eggs', quantity: 0 },
    { id: 'c', kind: 'lowStock', title: 'Flour', quantity: 2 },
  ];
  assert.deepEqual(sortInventoryAlerts(alerts).map((alert) => alert.id), ['b', 'c', 'a']);
});

test('expiration alerts sort by earliest remaining date first', () => {
  const alerts = [
    { id: 'later', kind: 'nearExpiration', title: 'Rice', daysRemaining: 4 },
    { id: 'expired', kind: 'expired', title: 'Eggs', daysRemaining: -2 },
    { id: 'soon', kind: 'nearExpiration', title: 'Flour', daysRemaining: 1 },
  ];
  assert.deepEqual(sortInventoryAlerts(alerts).map((alert) => alert.id), ['expired', 'soon', 'later']);
});

test('alert category counts preserve empty categories and sum to the badge count', () => {
  const counts = countInventoryAlertsByKind([
    { kind: 'lowStock' },
    { kind: 'lowStock' },
    { kind: 'expired' },
  ]);
  assert.deepEqual(counts, { lowStock: 2, outOfStock: 0, nearExpiration: 0, expired: 1 });
  assert.equal(Object.values(counts).reduce((total, count) => total + count, 0), 3);
});

test('alert counts fail closed while loading or after a refresh error', () => {
  const alerts = [{ kind: 'lowStock' }, { kind: 'expired' }];
  const emptyCounts = { lowStock: 0, outOfStock: 0, nearExpiration: 0, expired: 0 };

  assert.deepEqual(countInventoryAlertsWhenReady(alerts, true, ''), emptyCounts);
  assert.deepEqual(countInventoryAlertsWhenReady(alerts, false, 'Unable to load alerts'), emptyCounts);
  assert.deepEqual(countInventoryAlertsWhenReady(alerts, false, ' '), {
    lowStock: 1,
    outOfStock: 0,
    nearExpiration: 0,
    expired: 1,
  });
});
