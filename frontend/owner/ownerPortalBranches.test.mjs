import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../services/testTsLoader.mjs', import.meta.url);
const { filterOwnerPortalInventory, summarizeOwnerPortalBranches } = await import('./ownerPortalBranches.ts');

test('Owner Portal branch summaries use database branch IDs and retain empty branches', () => {
  const branches = [
    { id: 'branch-1', name: 'Live Branch Alpha' },
    { id: 'branch-2', name: 'Live Branch Beta' },
  ];
  const rows = [
    { branch: 'Live Branch Alpha', branchId: 'branch-1', status: 'Low stock' },
    { branch: 'Live Branch Alpha', branchId: 'branch-1', status: 'Out of stock' },
    { branch: 'Live Branch Alpha', branchId: 'branch-1', status: 'Normal' },
    { branch: 'Live Branch Alpha', branchId: 'branch-1', status: 'Near expiry' },
  ];
  const sales = [
    { branch_id: 'branch-1', total_amount: '125.50' },
    { branch_id: 'branch-2', total_amount: 80 },
  ];

  assert.deepEqual(summarizeOwnerPortalBranches(branches, rows, sales), [
    {
      id: 'branch-1',
      name: 'Live Branch Alpha',
      inventoryCount: 4,
      normalCount: 1,
      lowStockCount: 1,
      outOfStockCount: 1,
      salesTotal: 125.5,
    },
    {
      id: 'branch-2',
      name: 'Live Branch Beta',
      inventoryCount: 0,
      normalCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      salesTotal: 80,
    },
  ]);
});

test('an empty database branch list does not create placeholder branch records', () => {
  assert.deepEqual(summarizeOwnerPortalBranches([], [], []), []);
});

test('Owner Portal inventory filters use live branch names and the all-branches option', () => {
  const rows = [
    { branch: 'Live Branch Alpha', branchId: 'branch-1', status: 'Normal' },
    { branch: 'Live Branch Beta', branchId: 'branch-2', status: 'Normal' },
  ];

  assert.deepEqual(filterOwnerPortalInventory(rows, 'Live Branch Beta'), [rows[1]]);
  assert.deepEqual(filterOwnerPortalInventory(rows, 'All branches'), rows);
});
