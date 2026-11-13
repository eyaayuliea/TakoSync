import assert from 'node:assert/strict';
import test from 'node:test';
import { filterBranchVisibleMenuVariants } from '../services/menuCatalog.ts';
import {
  calculateMenuCart,
  EMPTY_MENU_ORDER_MESSAGE,
  menuOrderValidationMessage,
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

test('empty menu order exposes the required checkout message', () => {
  assert.equal(menuOrderValidationMessage(0), EMPTY_MENU_ORDER_MESSAGE);
  assert.equal(menuOrderValidationMessage(1), '');
});

test('checkout retry is offered only when a failed non-empty order remains preserved', () => {
  assert.equal(shouldOfferCheckoutRetry(true, 1), true);
  assert.equal(shouldOfferCheckoutRetry(true, 0), false);
  assert.equal(shouldOfferCheckoutRetry(false, 1), false);
});
