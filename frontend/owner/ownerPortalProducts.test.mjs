import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerPortalVariantPrices, parseOwnerMaxOrderQuantity } from './ownerPortalProducts.ts';

const variants = [
  { variant_code: '4pcs', size_label: '4 PCS', piece_count: 4 },
  { variant_code: '8pcs', size_label: '8 PCS', piece_count: 8 },
  { variant_code: '10plus1pcs', size_label: '10+1 PCS', piece_count: 11 },
];

test('builds a separate price for each standard menu variant', () => {
  assert.deepEqual(buildOwnerPortalVariantPrices({
    '4pcs': '100',
    '8pcs': '180.50',
    '10plus1pcs': '220',
  }, variants), [
    { variant_code: '4pcs', size_label: '4 PCS', piece_count: 4, price: 100, max_order_quantity: null },
    { variant_code: '8pcs', size_label: '8 PCS', piece_count: 8, price: 180.5, max_order_quantity: null },
    { variant_code: '10plus1pcs', size_label: '10+1 PCS', piece_count: 11, price: 220, max_order_quantity: null },
  ]);
});

test('rejects missing, non-numeric, and negative variant prices', () => {
  assert.throws(() => buildOwnerPortalVariantPrices({}, variants), /4 PCS/);
  assert.throws(() => buildOwnerPortalVariantPrices({
    '4pcs': '100',
    '8pcs': 'not a price',
    '10plus1pcs': '220',
  }, variants), /8 PCS/);
  assert.throws(() => buildOwnerPortalVariantPrices({
    '4pcs': '100',
    '8pcs': '-1',
    '10plus1pcs': '220',
  }, variants), /8 PCS/);
});

test('the maximum quantity per order is optional per size and must be a whole number above zero (OW-21 c4, c6)', () => {
  const built = buildOwnerPortalVariantPrices(
    { '4pcs': '100', '8pcs': '180', '10plus1pcs': '220' },
    variants,
    { '4pcs': '10', '8pcs': ' ', '10plus1pcs': '' },
  );
  assert.deepEqual(built.map((variant) => variant.max_order_quantity), [10, null, null]);
  for (const invalid of ['0', '-3', '2.5', 'ten']) {
    assert.throws(() => parseOwnerMaxOrderQuantity(invalid, '8 PCS'), /8 PCS must be a whole number greater than zero/);
  }
});
