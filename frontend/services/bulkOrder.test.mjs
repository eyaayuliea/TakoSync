import assert from 'node:assert/strict';
import test from 'node:test';
import { BULK_ORDER_DEFAULT_THRESHOLD, isBulkOrder, recordedSaleIsBulkOrder } from './bulkOrder.ts';

test('an order is a Bulk Order from the default threshold of 5', () => {
  assert.equal(BULK_ORDER_DEFAULT_THRESHOLD, 5);
  assert.equal(isBulkOrder(4), false);
  assert.equal(isBulkOrder(5), true);
  assert.equal(isBulkOrder(12), true);
});

test('an owner threshold applies, and an invalid threshold falls back to 5', () => {
  assert.equal(isBulkOrder(7, 8), false);
  assert.equal(isBulkOrder(8, 8), true);
  assert.equal(isBulkOrder(5, 0), true);
  assert.equal(isBulkOrder(4, 2.5), false);
  assert.equal(isBulkOrder(Number.NaN), false);
});

test('a recorded sale uses its saved flag, otherwise its saved product quantities', () => {
  assert.equal(recordedSaleIsBulkOrder(false, [10]), false, 'saved flag wins');
  assert.equal(recordedSaleIsBulkOrder(true, [1]), true, 'saved flag wins');
  assert.equal(recordedSaleIsBulkOrder(undefined, [2, 3]), true, 'derived: 2 + 3');
  assert.equal(recordedSaleIsBulkOrder(null, [2, 2]), false, 'derived: 2 + 2');
});
