import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyExpirationAlert,
  classifyStockAlert,
  countInventoryAlertsByKind,
  countInventoryAlertsForSnapshot,
  countInventoryAlertsWhenReady,
  deduplicateInventoryAlerts,
  filterBatchesWithRemainingStock,
  filterBranchInventoryAlertItems,
  getInventoryAlertScreenStatus,
  inventoryAlertEmptyCopy,
  inventoryAlertLabel,
  runInventoryAlertsRefreshOnce,
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

test('alert counts remain unknown until a branch snapshot has loaded', () => {
  const alerts = [{ kind: 'lowStock' }];
  assert.equal(countInventoryAlertsForSnapshot(alerts, false), null);
  assert.deepEqual(countInventoryAlertsForSnapshot(alerts, true), {
    lowStock: 1,
    outOfStock: 0,
    nearExpiration: 0,
    expired: 0,
  });
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

test('alert screen loading, retry failure, and stale-data states do not discard a last good snapshot', () => {
  assert.deepEqual(getInventoryAlertScreenStatus(false, true, ''), { status: 'loading' });
  assert.deepEqual(getInventoryAlertScreenStatus(false, false, 'Connection failed'), {
    status: 'error',
    message: 'Connection failed',
  });
  assert.deepEqual(getInventoryAlertScreenStatus(true, true, ''), { status: 'refreshing' });
  assert.deepEqual(getInventoryAlertScreenStatus(true, false, 'Connection failed'), {
    status: 'stale',
    message: 'Connection failed',
  });
  assert.deepEqual(getInventoryAlertScreenStatus(true, false, ''), { status: 'ready' });
});

test('each alert category has its own empty-state copy', () => {
  assert.deepEqual(
    ['lowStock', 'outOfStock', 'nearExpiration', 'expired'].map(inventoryAlertEmptyCopy),
    [
      {
        title: 'No active alerts.',
        message: 'There are no low-stock alerts',
      },
      {
        title: 'No active alerts.',
        message: 'There are no out-of-stock alerts',
      },
      {
        title: 'No active alerts.',
        message: 'There are no near-expiration alerts',
      },
      {
        title: 'No active alerts.',
        message: 'There are no expired alerts',
      },
    ],
  );
});

test('alert refresh suppresses duplicate requests and releases the lock for retry', async () => {
  const lock = { current: false };
  let requests = 0;
  const firstRequest = runInventoryAlertsRefreshOnce(lock, async () => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  assert.equal(await runInventoryAlertsRefreshOnce(lock, async () => {
    requests += 1;
  }), false);
  assert.equal(await firstRequest, true);
  assert.equal(requests, 1);
  await assert.rejects(
    runInventoryAlertsRefreshOnce(lock, async () => {
      requests += 1;
      throw new Error('offline');
    }),
    /offline/,
  );
  assert.equal(lock.current, false);
  assert.equal(await runInventoryAlertsRefreshOnce(lock, async () => {
    requests += 1;
  }), true);
  assert.equal(requests, 3);
});
