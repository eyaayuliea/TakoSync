import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardAlerts, dashboardStockCounts } from './ownerPortalDashboard.ts';

const row = (name, branchId, overrides = {}) => ({
  ingredientId: name.toLowerCase(), name, category: 'Other', qty: 10, quantityLabel: '10', unit: 'kg',
  branch: branchId === 'b1' ? 'Manila · Branch 1' : 'Branch 2', branchId, status: 'Normal', expiry: '—', batches: '',
  minimumStock: 2, stockLevel: 'Normal', expirationLevel: null, ...overrides,
});
const branches = [{ id: 'b1', name: 'Manila · Branch 1' }, { id: 'b2', name: 'Branch 2' }, { id: 'b3', name: 'Branch 3' }];
const rows = [
  row('Flour', 'b1'),
  row('Eggs', 'b1', { stockLevel: 'Low Stock', quantityLabel: '2', unit: 'pcs', minimumStock: 6, expirationLevel: 'Near Expiration', expiry: '2026-11-26' }),
  row('Octopus', 'b1', { stockLevel: 'Out of Stock', quantityLabel: '0' }),
  row('Cheese', 'b2', { expirationLevel: 'Expired', expiry: '2026-11-20' }),
  row('Sauce', 'b2', { stockLevel: 'Not tracked' }),
];

test('OW-02 c5: normal, low and out-of-stock counts per branch, every branch listed', () => {
  assert.deepEqual(dashboardStockCounts(rows, branches).map(({ branch, normal, low, out }) => [branch, normal, low, out]), [
    ['Manila · Branch 1', 1, 1, 1],
    ['Branch 2', 1, 0, 0],
    ['Branch 3', 0, 0, 0],
  ]);
});

test('OW-02 c6: each alert names the ingredient, branch and type, most urgent first', () => {
  assert.deepEqual(dashboardAlerts(rows).map(({ ingredient, branch, type, detail }) => [type, ingredient, branch, detail]), [
    ['Out of stock', 'Octopus', 'Manila · Branch 1', '0 kg left'],
    ['Expired', 'Cheese', 'Branch 2', 'Expired 2026-11-20'],
    ['Low stock', 'Eggs', 'Manila · Branch 1', '2 pcs left (minimum 6 pcs)'],
    ['Near expiry', 'Eggs', 'Manila · Branch 1', 'Expires 2026-11-26'],
  ]);
  assert.deepEqual(dashboardAlerts([row('Flour', 'b1')]), []);
});
