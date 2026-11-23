import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWebSalesConsumptionReport, buildWebWasteReport, lossCategory } from './ownerPortalMovementReports.ts';

const record = (overrides) => ({
  id: overrides.id, recordReference: `TX-${overrides.id}`, ingredientName: 'Prepared Takoyaki Batter', quantity: 0.16, unit: 'bottle',
  saleId: 's1', saleReference: 'SALE-1', branchId: 'b1', branchName: 'Manila · Branch 1', createdAt: '2026-11-22T17:26:00Z',
  recordedBy: 'Ana Reyes', updateFailed: false, saleVoided: false, voidReversal: null, ...overrides,
});

test('OW-16 c2–c7: rows with their sale; voided sales are reversed and not counted', () => {
  const report = buildWebSalesConsumptionReport([
    record({ id: 'a', quantity: 0.32, saleReference: 'SALE-2' }),
    record({ id: 'b', saleVoided: true, voidReversal: { reference: 'TX-VOID', quantity: 0.16, unit: 'bottle', createdAt: '2026-11-22T17:30:00Z' } }),
    record({ id: 'c', ingredientName: 'Octopus', quantity: 40, unit: 'g' }),
    record({ id: 'd', quantity: 0.8 }),
  ], (iso) => iso);
  assert.deepEqual(report.rows[0], ['Prepared Takoyaki Batter', '0.32 bottle', 'Manila · Branch 1', '2026-11-22T17:26:00Z', 'SALE-2', 'Ana Reyes', 'Counted']);
  assert.equal(report.rows[1][6], 'Sale voided · reversed by TX-VOID (+0.16 bottle)');
  assert.deepEqual(report.totals, [['Octopus', '40 g'], ['Prepared Takoyaki Batter', '1.12 bottle']]);
  assert.equal(report.voidedCount, 1);
});

test('OW-17 c2: loss categories', () => {
  assert.equal(lossCategory({ type: 'spoilage', reason: 'Spoilage' }), 'Spoilage');
  assert.equal(lossCategory({ type: 'waste', reason: 'Spillage' }), 'Spillage');
  assert.equal(lossCategory({ type: 'waste', reason: 'Other' }), 'Other');
  assert.equal(lossCategory({ type: 'waste', reason: 'Waste' }), 'Waste');
});

test('OW-17 c2–c6: losses only, reversed entries marked and not totalled', () => {
  const movement = (overrides) => ({ reference: `TX-${overrides.id}`, type: 'waste', reason: 'Waste', notes: '', quantity: 1, unit: 'kg', transaction_date: '2026-11-22T00:00:00Z', actor_name: 'Ana Reyes', ingredient: 'Octopus', ...overrides });
  const report = buildWebWasteReport({
    movements: [
      movement({ id: 'w1', quantity: 0.5, notes: 'Dropped tray' }),
      movement({ id: 'w2', reason: 'Spillage', ingredient: 'Takoyaki sauce', unit: 'L', quantity: 0.2, transaction_date: '2026-11-22T02:00:00Z' }),
      movement({ id: 'w3', type: 'spoilage', reason: 'Spoilage', quantity: 1 }),
      movement({ id: 'w4', quantity: 3 }),
      movement({ id: 's1', type: 'stock_in', reason: 'Delivery', quantity: 5 }),
      movement({ id: 'c1', type: 'sales_consumption', reason: 'Sales consumption', quantity: 1 }),
    ],
    reversedIds: new Set(['w4']),
    itemName: (m) => m.ingredient,
    branchName: () => 'Manila · Branch 1',
    formatDateTime: (iso) => iso,
  });
  assert.equal(report.rows.length, 4);
  assert.deepEqual(report.rows[0], ['Takoyaki sauce', '0.2 L', 'Spillage', 'Manila · Branch 1', '2026-11-22T02:00:00Z', '—', 'Ana Reyes', 'Recorded']);
  assert.ok(report.rows.some((row) => row[5] === 'Dropped tray'));
  assert.equal(report.rows.filter((row) => row[7] === 'Reversed').length, 1);
  assert.deepEqual(report.byIngredient, [['Octopus', '1.5 kg'], ['Takoyaki sauce', '0.2 L']]);
  assert.deepEqual(report.byCategory, [['Spillage', '0.2 L'], ['Spoilage', '1 kg'], ['Waste', '0.5 kg']]);
});
