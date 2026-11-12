import assert from 'node:assert/strict';
import test from 'node:test';
import { indexBranchInventorySnapshot } from './inventoryCountSnapshot.ts';

test('count quantity and revision are read from the same branch-inventory snapshot row', () => {
  const rows = [
    { ingredient_id: 'flour', quantity: '10', minimum_stock: '2', updated_at: '2026-11-13T00:00:00Z', inventory_revision: '4' },
    { ingredient_id: 'sauce', quantity: '7', minimum_stock: '1', updated_at: '2026-11-13T00:01:00Z', inventory_revision: '9' },
  ];

  const snapshot = indexBranchInventorySnapshot(rows);

  assert.equal(Number(snapshot.get('flour')?.quantity), 10);
  assert.equal(Number(snapshot.get('flour')?.inventory_revision), 4);
  assert.equal(Number(snapshot.get('sauce')?.quantity), 7);
  assert.equal(Number(snapshot.get('sauce')?.inventory_revision), 9);
});
