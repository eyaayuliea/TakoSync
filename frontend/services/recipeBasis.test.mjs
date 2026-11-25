import assert from 'node:assert/strict';
import test from 'node:test';
import { recipeAmountPerServing, recipeBasisFromLabel, recipeBasisLabel, recipeBasisOf } from './recipeBasis.ts';

test('a recipe line is per order unless it says per piece', () => {
  assert.equal(recipeBasisOf('per_piece'), 'per_piece');
  assert.equal(recipeBasisOf('per_order'), 'per_order');
  assert.equal(recipeBasisOf(undefined), 'per_order');
  assert.equal(recipeBasisOf('anything else'), 'per_order');
});

test('labels read after a quantity', () => {
  assert.equal(`8 g ${recipeBasisLabel('per_piece')}`, '8 g per piece');
  assert.equal(`15 ml ${recipeBasisLabel('per_order')}`, '15 ml per order');
  assert.equal(recipeBasisFromLabel('Per piece'), 'per_piece');
  assert.equal(recipeBasisFromLabel('Per order'), 'per_order');
});

test('per-piece amounts follow the size sold; per-order amounts do not', () => {
  assert.equal(recipeAmountPerServing(8, 'per_piece', 4), 32);
  assert.equal(recipeAmountPerServing(8, 'per_piece', 11), 88);
  assert.equal(recipeAmountPerServing(15, 'per_order', 11), 15);
});
