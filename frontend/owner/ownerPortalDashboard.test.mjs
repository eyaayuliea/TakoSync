import assert from 'node:assert/strict';
import test from 'node:test';
import { DASHBOARD_ALERT_CATEGORIES, dashboardAlertCounts, dashboardAlerts, dashboardStockCounts, filterDashboardAlerts } from './ownerPortalDashboard.ts';

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
    ['Out of Stock', 'Octopus', 'Manila · Branch 1', '0 kg left'],
    ['Expired', 'Cheese', 'Branch 2', 'Expired 2026-11-20'],
    ['Low Stock', 'Eggs', 'Manila · Branch 1', '2 pcs left (minimum 6 pcs)'],
    ['Near Expiration', 'Eggs', 'Manila · Branch 1', 'Expires 2026-11-26'],
  ]);
  assert.deepEqual(dashboardAlerts([row('Flour', 'b1')]), []);
});

test('team feedback (owner 6): four separate alert categories, named as on the staff and mobile Alerts screens', () => {
  assert.deepEqual([...DASHBOARD_ALERT_CATEGORIES], ['Low Stock', 'Out of Stock', 'Near Expiration', 'Expired']);
});

test('each category has its own count, zero included', () => {
  assert.deepEqual(dashboardAlertCounts(dashboardAlerts(rows)), { 'Low Stock': 1, 'Out of Stock': 1, 'Near Expiration': 1, Expired: 1 });
  assert.deepEqual(dashboardAlertCounts([]), { 'Low Stock': 0, 'Out of Stock': 0, 'Near Expiration': 0, Expired: 0 });
});

test('the alerts list can show one category or all of them', () => {
  const alerts = dashboardAlerts(rows);
  assert.deepEqual(filterDashboardAlerts(alerts, 'Expired').map((alert) => alert.ingredient), ['Cheese']);
  assert.deepEqual(filterDashboardAlerts(alerts, 'Near Expiration').map((alert) => alert.ingredient), ['Eggs']);
  assert.equal(filterDashboardAlerts(alerts, 'All').length, 4);
});
