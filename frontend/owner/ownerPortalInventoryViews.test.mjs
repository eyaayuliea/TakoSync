import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRANCH_INVENTORY_HEADERS,
  branchInventoryRows,
  filterInventoryRows,
  inventoryCategories,
  inventoryComparison,
  inventoryTabLabel,
  NO_RECORD_CELL,
} from './ownerPortalInventoryViews.ts';

const row = (ingredientId, name, branchId, overrides = {}) => ({
  ingredientId, name, category: 'Dry goods', qty: 10, quantityLabel: '10', unit: 'kg', branch: branchId, branchId,
  status: 'Normal', expiry: '—', batches: 'No active batches', minimumStock: 5, stockLevel: 'Normal', expirationLevel: null, ...overrides,
});
const branches = [{ id: 'b1', name: 'Manila · Branch 1' }, { id: 'b2', name: 'Branch 2' }, { id: 'b3', name: 'Branch 3' }];
const rows = [
  row('flour', 'Flour', 'b1'),
  row('eggs', 'Eggs', 'b1', { category: 'Fresh', unit: 'pcs', quantityLabel: '3', stockLevel: 'Low Stock', expiry: '2026-11-26', batches: 'EGG-1: 3 pcs · 2026-11-26' }),
  row('prepared-batter', 'Prepared Takoyaki Batter', 'b1', { category: 'Prepared', unit: 'bottle', quantityLabel: '4.5', minimumStock: null }),
  row('flour', 'Flour', 'b2', { quantityLabel: '0', stockLevel: 'Out of Stock' }),
  row('eggs', 'Eggs', 'b2', { category: 'Fresh', unit: 'pcs', stockLevel: 'Not tracked', quantityLabel: '—' }),
];

test('OW-04 c1: tabs are labelled by branch number', () => {
  assert.deepEqual(branches.map((branch) => inventoryTabLabel(branch.name)), ['Branch 1', 'Branch 2', 'Branch 3']);
});

test('OW-04 c2–c4: a branch table has unit, expected and minimum quantity, a text status and lots; batter first', () => {
  assert.equal(BRANCH_INVENTORY_HEADERS.length, 7);
  assert.deepEqual(branchInventoryRows(rows, 'b1'), [
    ['Prepared Takoyaki Batter (bottles available)', 'Prepared', 'bottle', '4.5', '—', 'Normal', '—'],
    ['Eggs', 'Fresh', 'pcs', '3', '5', 'Low', 'EGG-1: 3 pcs · 2026-11-26'],
    ['Flour', 'Dry goods', 'kg', '10', '5', 'Normal', '—'],
  ]);
});

test('OW-04 c5: search and category filter', () => {
  assert.deepEqual(inventoryCategories(rows), ['All categories', 'Dry goods', 'Fresh', 'Prepared']);
  assert.deepEqual(filterInventoryRows(rows, { query: '', category: 'Fresh' }).map((r) => `${r.branchId}:${r.ingredientId}`), ['b1:eggs', 'b2:eggs']);
  assert.deepEqual(filterInventoryRows(rows, { query: 'FLO', category: 'All categories' }).map((r) => r.branchId), ['b1', 'b2']);
});

test('OW-04 c6, c7: the comparison puts branches side by side and marks missing records', () => {
  const comparison = inventoryComparison(rows, branches);
  assert.deepEqual(comparison.headers, ['Item', 'Unit', 'Branch 1', 'Branch 2', 'Branch 3']);
  assert.deepEqual(comparison.rows, [
    ['Eggs', 'pcs', '3 · Low', NO_RECORD_CELL, NO_RECORD_CELL],
    ['Flour', 'kg', '10 · Normal', '0 · Out of Stock', NO_RECORD_CELL],
    ['Prepared Takoyaki Batter', 'bottle', '4.5 · Normal', NO_RECORD_CELL, NO_RECORD_CELL],
  ]);
});
