import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyExpirationAlert,
  classifyStockAlert,
  inventoryAlertLabel,
} from './inventoryAlerts.ts';

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
