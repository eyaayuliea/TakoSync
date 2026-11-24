import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAlertDays, parseMinimumStock, parseYieldPerBottle, thresholdRows, YIELD_PER_BOTTLE_MESSAGE, yieldPerBottle } from './ownerPortalBatterThresholds.ts';

test('OW-23 c3, c4: yield per bottle is a whole number from 20 to 25', () => {
  assert.equal(yieldPerBottle({ estimated_yield_pieces: 125, prepared_quantity: 5 }), 25);
  assert.equal(yieldPerBottle({ estimated_yield_pieces: 110, prepared_quantity: 5 }), 22);
  assert.deepEqual(parseYieldPerBottle('22'), { value: 22 });
  for (const bad of ['19', '26', '0', '', '22.5', 'x']) assert.deepEqual(parseYieldPerBottle(bad), { error: YIELD_PER_BOTTLE_MESSAGE }, bad);
});

test('OW-24 c3: alert period and minimum stock validation', () => {
  assert.deepEqual(parseAlertDays('7'), { value: 7 });
  for (const bad of ['0', '-1', '2.5', '', '400']) assert.ok('error' in parseAlertDays(bad), bad);
  assert.deepEqual(parseMinimumStock('0', 'Eggs'), { value: 0 });
  assert.deepEqual(parseMinimumStock('2.5', 'Eggs'), { value: 2.5 });
  assert.deepEqual(parseMinimumStock('-1', 'Eggs'), { error: 'The minimum stock level for Eggs must be zero or greater.' });
  assert.ok('error' in parseMinimumStock('', 'Eggs'));
});

test('OW-24 c1, c4: one row per ingredient for all branches, with search and category filter', () => {
  const input = {
    ingredients: [{ id: 'eggs', name: 'Eggs', unit: 'pcs', category_id: 'dairy' }, { id: 'flour', name: 'All-purpose flour', unit: 'kg', category_id: 'dry' }],
    categories: [{ id: 'dairy', name: 'Dairy' }, { id: 'dry', name: 'Dry Goods' }],
    inventory: [
      { ingredient_id: 'eggs', minimum_stock: 24 }, { ingredient_id: 'eggs', minimum_stock: 24 }, { ingredient_id: 'eggs', minimum_stock: 24 },
      { ingredient_id: 'flour', minimum_stock: 5 }, { ingredient_id: 'flour', minimum_stock: 0 },
    ],
    query: '',
    categoryId: null,
  };
  assert.deepEqual(thresholdRows(input), [
    { ingredientId: 'eggs', name: 'Eggs', category: 'Dairy', unit: 'pcs', minimum: 24, varies: false },
    { ingredientId: 'flour', name: 'All-purpose flour', category: 'Dry Goods', unit: 'kg', minimum: 5, varies: true },
  ]);
  assert.deepEqual(thresholdRows({ ...input, query: 'FLO' }).map((row) => row.name), ['All-purpose flour']);
  assert.deepEqual(thresholdRows({ ...input, categoryId: 'dairy' }).map((row) => row.name), ['Eggs']);
});
