import assert from 'node:assert/strict';
import test from 'node:test';
import { filterBranchVisibleMenuVariants } from '../services/menuCatalog.ts';
import {
  calculateMenuCart,
  calculateSelectedAddonTotal,
  EMPTY_MENU_ORDER_MESSAGE,
  groupMenuProducts,
  menuOrderValidationMessage,
  selectFlavorMenuProducts,
  shouldOfferCheckoutRetry,
} from './menuPreviewData.ts';

test('branch menu filtering retains visible unavailable variants for the unavailable filter', () => {
  const variants = [
    { id: 'available', is_available: true },
    { id: 'unavailable', is_available: false },
    { id: 'hidden', is_available: true },
  ];

  assert.deepEqual(
    filterBranchVisibleMenuVariants(variants, new Set(['available', 'unavailable'])),
    variants.slice(0, 2),
  );
});

test('menu cart totals update for quantities and ignore missing catalog rows', () => {
  const products = [
    { id: 'takoyaki', name: 'Takoyaki', description: '', price: 49, isAvailable: true },
    { id: 'cheese', name: 'Cheese', description: '', price: 59, isAvailable: true },
  ];

  assert.deepEqual(calculateMenuCart([
    { productId: 'takoyaki', quantity: 2 },
    { productId: 'cheese', quantity: 1 },
    { productId: 'removed', quantity: 4 },
  ], products), { count: 3, total: 157 });
});

test('menu cart and add-on totals use exact currency cents', () => {
  const products = [
    { id: 'small', productId: 'p1', productName: 'Takoyaki', sizeLabel: '1 PCS', pieceCount: 1, category: 'Flavors', name: 'Takoyaki', description: '', price: 0.1, isAvailable: true },
    { id: 'extra', productId: 'p2', productName: 'Extra', sizeLabel: '1 PCS', pieceCount: 1, category: 'Flavors', name: 'Extra', description: '', price: 0.29, isAvailable: true },
  ];

  assert.equal(calculateMenuCart([
    { productId: 'small', quantity: 3 },
    { productId: 'extra', quantity: 1 },
  ], products).total, 0.59);
  assert.equal(calculateSelectedAddonTotal([
    { id: 'sauce', price: 0.1, isAvailable: true },
    { id: 'flakes', price: 0.2, isAvailable: true },
  ], ['sauce', 'flakes']), 0.3);
});

test('menu products group by live product ID and keep sizes in ascending piece order', () => {
  const products = [
    { id: 'v8', productId: 'p1', productName: 'Octobits Takoyaki', sizeLabel: '8 PCS', pieceCount: 8, category: 'Flavors', name: 'Octobits Takoyaki - 8 PCS', description: '', price: 89, isAvailable: true },
    { id: 'v4', productId: 'p1', productName: 'Octobits Takoyaki', sizeLabel: '4 PCS', pieceCount: 4, category: 'Flavors', name: 'Octobits Takoyaki - 4 PCS', description: '', price: 49, isAvailable: true },
    { id: 'vc', productId: 'p2', productName: 'Octobits / Cheese', sizeLabel: '4 PCS', pieceCount: 4, category: 'Combo', name: 'Octobits / Cheese - 4 PCS', description: '', price: 59, isAvailable: false },
  ];

  assert.deepEqual(groupMenuProducts(products).map((group) => [
    group.name,
    group.category,
    group.variants.map(({ id }) => id),
  ]), [
    ['Octobits Takoyaki', 'Flavors', ['v4', 'v8']],
    ['Octobits / Cheese', 'Combo', ['vc']],
  ]);
});

test('flavor selection shows only the live regular and configured combo products', () => {
  const products = [
    { id: 'regular-o', productId: 'p-o', productName: 'Octobits Takoyaki', sizeLabel: '4 PCS', pieceCount: 4, category: 'Flavors', name: 'Octobits Takoyaki - 4 PCS', description: '', price: 49, isAvailable: true },
    { id: 'combo-o', productId: 'c-o', productName: 'Octobits / Cheese', sizeLabel: '4 PCS', pieceCount: 4, category: 'Combo', name: 'Octobits / Cheese - 4 PCS', description: '', price: 59, isAvailable: true },
    { id: 'regular-c', productId: 'p-c', productName: 'Cheese Takoyaki', sizeLabel: '4 PCS', pieceCount: 4, category: 'Flavors', name: 'Cheese Takoyaki - 4 PCS', description: '', price: 49, isAvailable: true },
  ];
  const groups = groupMenuProducts(products);

  assert.deepEqual(selectFlavorMenuProducts(groups, 'Octobits Takoyaki', 'Octobits / Cheese').map(({ name }) => name), [
    'Octobits Takoyaki',
    'Octobits / Cheese',
  ]);
  assert.deepEqual(selectFlavorMenuProducts(groups, 'Cheese Takoyaki').map(({ name }) => name), [
    'Cheese Takoyaki',
  ]);
});

test('selected add-on total uses only available, selected live records', () => {
  assert.equal(calculateSelectedAddonTotal([
    { id: 'flakes', price: 10, isAvailable: true },
    { id: 'sauce', price: 15, isAvailable: true },
    { id: 'inactive', price: 999, isAvailable: false },
  ], ['flakes', 'inactive', 'missing']), 10);
});

test('empty menu order exposes the required checkout message', () => {
  assert.equal(menuOrderValidationMessage(0), EMPTY_MENU_ORDER_MESSAGE);
  assert.equal(menuOrderValidationMessage(1), '');
});

test('checkout retry is offered only when a failed non-empty order remains preserved', () => {
  assert.equal(shouldOfferCheckoutRetry(true, 1), true);
  assert.equal(shouldOfferCheckoutRetry(true, 0), false);
  assert.equal(shouldOfferCheckoutRetry(false, 1), false);
});
