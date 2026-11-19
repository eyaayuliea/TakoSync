import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findBatterShortages,
  formatBatterShortages,
  formatInsufficientStockMessage,
} from './batterPreparation.ts';
import {
  isDefinitiveInventoryRejection,
  pendingRequestIsProvablyInvalid,
  toStoredTransactionUnit,
  unitDisplayName,
} from './inventoryTransactionUnits.ts';

const recipe = {
  prepared_quantity: 5,
  ingredientLines: [
    { ingredient_id: 'flour', quantity_required: 0.625, unit_of_measure: 'kg', automatic_consumption_enabled: true },
    { ingredient_id: 'eggs', quantity_required: 5, unit_of_measure: 'pcs', automatic_consumption_enabled: true },
    { ingredient_id: 'prepared-batter', quantity_required: 5, unit_of_measure: 'bottle', automatic_consumption_enabled: true },
    { ingredient_id: 'salt', quantity_required: 2.5, unit_of_measure: 'tsp', automatic_consumption_enabled: false },
  ],
};

test('batter shortages name ingredient, required, available and shortage', () => {
  const stock = new Map([
    ['flour', { name: 'All-Purpose Flour', unit: 'kg', quantity: 0.5 }],
    ['eggs', { name: 'Eggs', unit: 'pcs', quantity: 22 }],
  ]);
  const shortages = findBatterShortages(recipe, stock);
  assert.equal(shortages.length, 1);
  assert.equal(
    formatInsufficientStockMessage(shortages[0]),
    'Insufficient stock for All-Purpose Flour: required 0.625 kg, available 0.5 kg, shortage 0.125 kg',
  );
  assert.match(formatBatterShortages(shortages), /^Cannot record this batter batch\. Insufficient stock for All-Purpose Flour/);
});

test('enough stock produces no shortage and the recipe is not altered', () => {
  const before = JSON.stringify(recipe);
  const stock = new Map([
    ['flour', { name: 'All-Purpose Flour', unit: 'kg', quantity: 1 }],
    ['eggs', { name: 'Eggs', unit: 'pcs', quantity: 5 }],
  ]);
  assert.deepEqual(findBatterShortages(recipe, stock), []);
  assert.equal(JSON.stringify(recipe), before);
});

test('missing stock rows count as zero available', () => {
  const shortages = findBatterShortages(recipe, new Map());
  assert.deepEqual(shortages.map((entry) => [entry.ingredientId, entry.available]), [['flour', 0], ['eggs', 0]]);
});

test('transactions use the database unit; batter is converted from ml to whole bottles', () => {
  assert.deepEqual(toStoredTransactionUnit({ id: 'octopus', unit: 'kg' }, 1.5), { unit: 'kg', quantity: 1.5 });
  assert.deepEqual(toStoredTransactionUnit({ id: 'prepared-batter', unit: 'ml' }, 1360), { unit: 'bottle', quantity: 2 });
  assert.throws(() => toStoredTransactionUnit({ id: 'prepared-batter', unit: 'ml' }, 700), /whole bottles/);
});

test('only validation rejections clear a saved request; unknown outcomes stay retryable', () => {
  assert.equal(isDefinitiveInventoryRejection({ code: '22023', message: 'x' }), true);
  assert.equal(isDefinitiveInventoryRejection(new Error('Failed to fetch')), false);
  assert.equal(isDefinitiveInventoryRejection({ code: '55000' }), false);
});

test('a saved request whose unit never matched the database is provably invalid', () => {
  const catalog = new Map([['octopus', 'kg'], ['cheese-cubes', 'pcs']]);
  assert.equal(pendingRequestIsProvablyInvalid([{ ingredientId: 'octopus', unit: 'g' }], catalog), true);
  assert.equal(pendingRequestIsProvablyInvalid([{ ingredientId: 'octopus', unit: 'kg' }], catalog), false);
  assert.equal(pendingRequestIsProvablyInvalid([{ ingredientId: 'unknown', unit: 'kg' }], catalog), true);
});

test('units shown to staff come from the database', () => {
  assert.equal(unitDisplayName('kg'), 'Kilograms (kg)');
  assert.equal(unitDisplayName('tsp'), 'Teaspoons (tsp)');
});
