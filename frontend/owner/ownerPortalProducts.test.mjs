import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerPortalVariantPrices } from './ownerPortalProducts.ts';

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
    { variant_code: '4pcs', size_label: '4 PCS', piece_count: 4, price: 100 },
    { variant_code: '8pcs', size_label: '8 PCS', piece_count: 8, price: 180.5 },
    { variant_code: '10plus1pcs', size_label: '10+1 PCS', piece_count: 11, price: 220 },
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
