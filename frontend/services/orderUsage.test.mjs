import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STANDARD_ORDER_PIECES,
  orderUsageByIngredient,
  orderUsageSummary,
  orderUsageText,
  ordersCovered,
  ordersCoveredText,
} from './orderUsage.ts';

const pieces = new Map([['cheese-4', 4], ['cheese-8', 8], ['octo-4', 4], ['combo-4', 4]]);
const requirements = [
  { variantId: 'octo-4', ingredientId: 'octopus', unit: 'g', perUnit: 32 },
  { variantId: 'octo-4', ingredientId: 'sauces', unit: 'ml', perUnit: 15 },
  { variantId: 'cheese-4', ingredientId: 'octopus', unit: 'g', perUnit: 32 },
  { variantId: 'cheese-4', ingredientId: 'cheese-cubes', unit: 'g', perUnit: 20 },
  { variantId: 'cheese-8', ingredientId: 'cheese-cubes', unit: 'g', perUnit: 40 },
  { variantId: 'cheese-8', ingredientId: 'octopus', unit: 'g', perUnit: 64 },
  { variantId: 'combo-4', ingredientId: 'cheese-cubes', unit: 'g', perUnit: 24 },
];

test('one order is the 4-piece size', () => {
  assert.equal(STANDARD_ORDER_PIECES, 4);
  const usage = orderUsageByIngredient(requirements, pieces);
  assert.deepEqual(usage.get('octopus'), { perOrder: 32, unit: 'g' });
  assert.deepEqual(usage.get('sauces'), { perOrder: 15, unit: 'ml' });
});

test('when products differ, the largest 4-piece amount is used', () => {
  assert.deepEqual(orderUsageByIngredient(requirements, pieces).get('cheese-cubes'), { perOrder: 24, unit: 'g' });
});

test('an item no order uses has no per-order amount', () => {
  const usage = orderUsageByIngredient(requirements, pieces);
  assert.equal(usage.has('flour'), false);
  assert.equal(ordersCovered(5000, usage.get('flour')), null);
  assert.equal(orderUsageSummary(5000, usage.get('flour')), null);
});

test('orders covered is the stock divided by one order, in whole orders', () => {
  assert.equal(ordersCovered(2000, { perOrder: 32, unit: 'g' }), 62);
  assert.equal(ordersCovered(6000, { perOrder: 15, unit: 'ml' }), 400);
  assert.equal(ordersCovered(31, { perOrder: 32, unit: 'g' }), 0);
  assert.equal(ordersCovered(0, { perOrder: 32, unit: 'g' }), 0);
  assert.equal(ordersCovered(-5, { perOrder: 32, unit: 'g' }), 0);
  assert.equal(ordersCovered(null, { perOrder: 32, unit: 'g' }), null);
  assert.equal(ordersCovered(3.92, { perOrder: 0.16, unit: 'bottle' }), 24);
});

test('the texts shown on the inventory screens', () => {
  assert.equal(orderUsageText({ perOrder: 32, unit: 'g' }), '32 g');
  assert.equal(orderUsageText({ perOrder: 0.16, unit: 'bottle' }), '0.16 bottle');
  assert.equal(ordersCoveredText(1), '1 order');
  assert.equal(ordersCoveredText(1250), '1,250 orders');
  assert.equal(orderUsageSummary(2000, { perOrder: 32, unit: 'g' }), 'Per order: 32 g · covers 62 orders');
});
