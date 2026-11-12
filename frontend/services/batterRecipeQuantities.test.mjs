import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getConfiguredRecipeQuantity,
  getPerBottleRecipeQuantity,
} from './batterRecipeQuantities.ts';
import {
  PREPARED_BATTER_BATCH_BOTTLES,
  validatePreparedBatterBatch,
} from './batterPreparation.ts';

test('existing shared-recipe ingredient quantities round-trip without changing saved values', () => {
  const savedBatchQuantities = [0.625, 2.4, 5, 5, 2.5, 2.5, 0.000001];
  const configuredPreparedQuantity = 5;

  const perBottleQuantities = savedBatchQuantities.map((quantity) =>
    getPerBottleRecipeQuantity(quantity, configuredPreparedQuantity));
  const savedAgain = perBottleQuantities.map((quantity) =>
    getConfiguredRecipeQuantity(quantity, configuredPreparedQuantity));

  assert.deepEqual(savedAgain, savedBatchQuantities);
  assert.deepEqual(perBottleQuantities.slice(0, 6), [0.125, 0.48, 1, 1, 0.5, 0.5]);
});

test('per-bottle recipe quantities remain the same when configured recipe output changes', () => {
  const perBottleQuantity = getPerBottleRecipeQuantity(0.625, 5);
  const newRecipeOutputQuantity = getConfiguredRecipeQuantity(perBottleQuantity, 3);

  assert.equal(perBottleQuantity, 0.125);
  assert.equal(newRecipeOutputQuantity, 0.375);
  assert.equal(getPerBottleRecipeQuantity(newRecipeOutputQuantity, 3), perBottleQuantity);
});

test('prepared batter response is accepted only when it confirms five bottles', () => {
  assert.equal(PREPARED_BATTER_BATCH_BOTTLES, 5);
  assert.deepEqual(validatePreparedBatterBatch({
    batch_reference: 'BATCH-1',
    bottle_count: '5',
    prepared_quantity: 5,
    prepared_unit: 'bottle',
  }), {
    batch_reference: 'BATCH-1',
    bottle_count: 5,
    prepared_quantity: 5,
    prepared_unit: 'bottle',
  });
  assert.throws(() => validatePreparedBatterBatch({
    batch_reference: 'BATCH-2',
    bottle_count: 4,
    prepared_quantity: 4,
    prepared_unit: 'bottle',
  }), /did not confirm a five-bottle batch/);
  assert.throws(() => validatePreparedBatterBatch({
    batch_reference: 'BATCH-3',
    bottle_count: 5,
    prepared_quantity: 5,
    prepared_unit: 'ml',
  }), /did not confirm a five-bottle batch/);
});
