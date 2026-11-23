import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerPortalVariantPrices, parseOwnerMaxOrderQuantity, productFormErrors, productTableRows } from './ownerPortalProducts.ts';

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

test('OW-21 c3, c6: prices must be greater than zero; pieces per portion are editable', () => {
  assert.throws(() => buildOwnerPortalVariantPrices({ '4pcs': '100', '8pcs': '0', '10plus1pcs': '220' }, variants), { message: 'The selling price for 8 PCS must be greater than zero.' });
  assert.throws(() => buildOwnerPortalVariantPrices({ '4pcs': '', '8pcs': '1', '10plus1pcs': '1' }, variants), { message: 'Enter the selling price for 4 PCS.' });
  const built = buildOwnerPortalVariantPrices({ '4pcs': '100', '8pcs': '180', '10plus1pcs': '220' }, variants, {}, { '4pcs': '5' });
  assert.deepEqual(built.map((variant) => variant.piece_count), [5, 8, 11]);
  assert.throws(() => buildOwnerPortalVariantPrices({ '4pcs': '100', '8pcs': '180', '10plus1pcs': '220' }, variants, {}, { '8pcs': '0' }), { message: 'The number of pieces per portion for 8 PCS must be a whole number greater than zero.' });
  assert.throws(() => buildOwnerPortalVariantPrices({ '4pcs': '100', '8pcs': '180', '10plus1pcs': '220' }, variants, {}, { '8pcs': '2.5' }), /pieces per portion for 8 PCS/);
});

test('OW-21 c6: each required field has its own message', () => {
  assert.deepEqual(productFormErrors({ name: '', flavor: ' ', portionType: '', description: '' }), [
    'Enter the product name.', 'Enter the flavor.', 'Choose the portion type.', 'Enter the product description.',
  ]);
  assert.deepEqual(productFormErrors({ name: 'Octobits / Cheese', flavor: 'Octobits', portionType: 'Combo + Cheese', description: 'x' }), []);
});

test('OW-21 c1: the product table shows name, flavor, portion type, prices, availability and description, and searches', () => {
  const products = [
    { product_name: 'Octobits / Cheese', flavor: 'Octobits', portion_type: 'Combo + Cheese', description: 'With cheese', is_available: false,
      variants: [{ variant_code: '8pcs', size_label: '8 PCS', price: 99 }, { variant_code: '4pcs', size_label: '4 PCS', price: 59 }] },
    { product_name: 'Crab Takoyaki', flavor: 'Crab', portion_type: 'Regular', description: '', is_available: true, variants: [] },
  ];
  assert.deepEqual(productTableRows(products, '').rows[0], ['Octobits / Cheese', 'Octobits', 'Combo + Cheese', '4 PCS ₱59.00\n8 PCS ₱99.00', 'Unavailable', 'With cheese']);
  assert.deepEqual(productTableRows(products, 'crab').rows.map((row) => row[0]), ['Crab Takoyaki']);
  assert.deepEqual(productTableRows(products, 'OCTO').products.length, 1);
});
