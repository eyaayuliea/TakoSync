import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryTransactionLabel } from './transactionLabels.ts';

test('inventory history preserves a distinct label for each transaction type', () => {
  const expected = {
    stock_in: 'Stock-In',
    stock_out: 'Stock-Out',
    usage: 'Usage',
    waste: 'Waste',
    spoilage: 'Spoilage',
    sales_consumption: 'Sales Consumption',
    transfer_in: 'Branch Transfer In',
    transfer_out: 'Branch Transfer Out',
    adjustment: 'Authorized Adjustment',
  };
  for (const [type, label] of Object.entries(expected)) {
    assert.equal(inventoryTransactionLabel(type), label);
  }
  assert.equal(new Set(Object.values(expected)).size, Object.keys(expected).length);
});
