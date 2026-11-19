import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../services/testTsLoader.mjs', import.meta.url);
const { buildOwnerPortalInventoryRows } = await import('./ownerPortalInventory.ts');

const baseSnapshot = {
  branches: [{ id: 'branch-1', name: 'Branch One' }],
  inventory: [{ branch_id: 'branch-1', ingredient_id: 'ingredient-1', quantity: '12', minimum_stock: '5' }],
  ingredients: [{
    id: 'ingredient-1',
    category_id: 'category-1',
    name: 'Flour',
    unit: 'kg',
    expiration_tracking: true,
  }],
  categories: [{ id: 'category-1', name: 'Dry Goods' }],
  batches: [
    {
      id: 'later',
      branch_id: 'branch-1',
      ingredient_id: 'ingredient-1',
      batch_reference: 'B-2',
      expiration_date: '2026-11-25',
      quantity_remaining: '7',
    },
    {
      id: 'earlier',
      branch_id: 'branch-1',
      ingredient_id: 'ingredient-1',
      batch_reference: 'B-1',
      expiration_date: '2026-11-20',
      quantity_remaining: '5',
    },
    {
      id: 'empty',
      branch_id: 'branch-1',
      ingredient_id: 'ingredient-1',
      batch_reference: 'B-0',
      expiration_date: '2026-11-19',
      quantity_remaining: 0,
    },
  ],
  nearExpirationDays: 7,
};

test('Owner Portal inventory uses the earliest positive tracked batch in Manila time', () => {
  const [row] = buildOwnerPortalInventoryRows(baseSnapshot, new Date('2026-11-19T16:30:00Z'));

  assert.equal(row.status, 'Near expiration');
  assert.equal(row.expiry, '2026-11-20');
  assert.match(row.batches, /B-1: 5 kg/);
  assert.match(row.batches, /B-2: 7 kg/);
  assert.doesNotMatch(row.batches, /B-0/);
});

test('Owner Portal inventory does not infer a balance from missing batches or null stock', () => {
  const snapshot = {
    ...baseSnapshot,
    inventory: [
      { branch_id: 'branch-1', ingredient_id: 'ingredient-1', quantity: null, minimum_stock: 5 },
      { branch_id: 'branch-1', ingredient_id: 'ingredient-1', quantity: 0, minimum_stock: 5 },
    ],
    batches: [],
  };
  const rows = buildOwnerPortalInventoryRows(snapshot, new Date('2026-11-19T00:00:00Z'));

  assert.equal(rows[0].qty, null);
  assert.equal(rows[0].quantityLabel, '—');
  assert.equal(rows[0].status, 'Not tracked');
  assert.equal(rows[1].qty, 0);
  assert.equal(rows[1].quantityLabel, '0');
  assert.equal(rows[1].status, 'Out of stock');
  assert.equal(rows[1].batches, 'No active batches');
});

test('Owner Portal inventory ignores expiry dates when tracking is disabled', () => {
  const snapshot = {
    ...baseSnapshot,
    ingredients: [{ ...baseSnapshot.ingredients[0], expiration_tracking: false }],
    batches: [{ ...baseSnapshot.batches[1], expiration_date: '2026-11-01' }],
  };
  const [row] = buildOwnerPortalInventoryRows(snapshot, new Date('2026-11-19T00:00:00Z'));

  assert.equal(row.status, 'Normal');
  assert.equal(row.expiry, '—');
  assert.match(row.batches, /Not tracked/);
});
