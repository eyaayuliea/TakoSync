import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCTS_SECTION_TITLE,
  PRODUCTS_SOLD_EMPTY_MESSAGE,
  summarizeOwnerProducts,
} from './ownerSalesSummary.ts';

const item = (overrides = {}) => ({
  id: 'line-1',
  sale_id: 'sale-1',
  product_id: 'product-a',
  product_name: 'Takoyaki',
  quantity: 1,
  unit_price: 25,
  subtotal: 25,
  ...overrides,
});

test('products sold aggregates repeated confirmed-sale lines and sorts descending', () => {
  const summary = summarizeOwnerProducts([
    item({ id: 'line-a1', product_id: 'product-a', product_name: 'Cheese', quantity: 2, subtotal: 50 }),
    item({ id: 'line-b1', product_id: 'product-b', product_name: 'Classic', quantity: 5, subtotal: 100 }),
    item({ id: 'line-a2', sale_id: 'sale-2', product_id: 'product-a', product_name: 'Cheese', quantity: 4, subtotal: 100 }),
  ]);
  assert.deepEqual(summary, [
    { id: 'product-a', name: 'Cheese', quantity: 6, total: 150 },
    { id: 'product-b', name: 'Classic', quantity: 5, total: 100 },
  ]);
});

test('products sold excludes zero and invalid quantities', () => {
  const summary = summarizeOwnerProducts([
    item({ product_id: 'zero', product_name: 'Zero', quantity: 0, subtotal: 0 }),
    item({ product_id: 'negative', product_name: 'Negative', quantity: -2, subtotal: -50 }),
    item({ product_id: 'invalid', product_name: 'Invalid', quantity: 'not-a-number', subtotal: 10 }),
  ]);
  assert.deepEqual(summary, []);
});

test('products sold counts every recorded sale, including ones whose inventory update is pending or failed', () => {
  const summary = summarizeOwnerProducts([
    item({ product_id: 'confirmed', product_name: 'Confirmed', quantity: 4, inventory_processing_status: 'completed' }),
    item({ id: 'pending-line', product_id: 'pending', product_name: 'Pending', quantity: 20, inventory_processing_status: 'pending' }),
    item({ id: 'failed-line', product_id: 'failed', product_name: 'Failed', quantity: 10, inventory_processing_status: 'failed' }),
    item({ id: 'legacy-line', product_id: 'legacy', product_name: 'Legacy', quantity: 2 }),
  ]);

  assert.deepEqual(summary.map((product) => product.id), ['pending', 'failed', 'confirmed', 'legacy']);
  assert.equal(summary.reduce((sum, product) => sum + product.quantity, 0), 36);
});

test('empty products sold state uses the exact required message', () => {
  assert.equal(PRODUCTS_SOLD_EMPTY_MESSAGE, 'No sales recorded for this period.');
});

test('product summary is read-only data with no mutation controls', () => {
  const summary = summarizeOwnerProducts([item()]);
  assert.deepEqual(Object.keys(summary[0]).sort(), ['id', 'name', 'quantity', 'total']);
});

test('OM-08: the Products tab is titled Products sold, not Sales per branch', () => {
  assert.equal(PRODUCTS_SECTION_TITLE, 'Products sold');
});
