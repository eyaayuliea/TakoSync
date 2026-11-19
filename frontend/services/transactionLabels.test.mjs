import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryTransactionLabel } from './transactionLabels.ts';

test('inventory history preserves a distinct label for each transaction type', () => {
  const expected = {
    stock_in: 'Stock-in',
    stock_out: 'Stock-out',
    usage: 'Usage',
    waste: 'Waste',
    spoilage: 'Spoilage',
    sales_consumption: 'Sales consumption',
    transfer_in: 'Branch transfer in',
    transfer_out: 'Branch transfer out',
    adjustment: 'Authorized Adjustment',
  };
  for (const [type, label] of Object.entries(expected)) {
    assert.equal(inventoryTransactionLabel(type), label);
  }
  assert.equal(new Set(Object.values(expected)).size, Object.keys(expected).length);
});
