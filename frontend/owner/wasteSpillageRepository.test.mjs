import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWasteSpillageRecords,
  formatWasteSpillageDateTime,
  formatWasteSpillageQuantity,
  WASTE_SPILLAGE_CATEGORY_LABELS,
  WasteSpillageCategory,
} from './wasteSpillageRepository.ts';

function historyRecord(overrides = {}) {
  return {
    id: 'transaction-1',
    reference: 'W-1112-0008',
    type: 'Waste',
    ingredientId: 'eggs',
    ingredientName: 'Eggs',
    category: 'Dairy',
    quantity: -6,
    unit: 'pcs',
    movement: -6,
    branchId: 'branch-3',
    branch: 'Branch 3',
    staffId: 'staff-ana',
    staff: 'Ana Reyes',
    transactionDate: new Date('2026-11-12T10:15:00+08:00'),
    reason: 'Spoilage',
    notes: 'Spoiled; stored too long.',
    beforeQuantity: 50,
    afterQuantity: 44,
    batchReference: 'EGG-1',
    expirationDate: '2026-11-12',
    ...overrides,
  };
}

test('waste records use live transaction fields and sort newest first', () => {
  const records = buildWasteSpillageRecords([
    historyRecord(),
    historyRecord({
      id: 'transaction-2',
      reference: 'SP-1112-0007',
      type: 'Waste',
      reason: 'Spillage',
      ingredientId: 'sauce',
      ingredientName: 'Takoyaki Sauce',
      quantity: 0.5,
      unit: 'L',
      transactionDate: new Date('2026-11-12T11:05:00+08:00'),
      notes: '',
    }),
    historyRecord({ id: 'stock-in', type: 'Stock-In', reason: 'Stock-In' }),
  ]);

  assert.deepEqual(records.map(({ ingredientName, quantity, unit, category }) => [
    ingredientName, formatWasteSpillageQuantity({ quantity, unit }), WASTE_SPILLAGE_CATEGORY_LABELS[category],
  ]), [
    ['Takoyaki Sauce', '0.5 L', 'Spillage'],
    ['Eggs', '6 pcs', 'Spoilage'],
  ]);
  assert.equal(records[0].recordedBy, 'Ana Reyes');
  assert.equal(records[0].branchName, 'Branch 3');
});

test('details use the year and Manila time and preserve recorded remarks', () => {
  const record = buildWasteSpillageRecords([historyRecord()])[0];
  assert.equal(formatWasteSpillageDateTime(record.createdAt), '12 Nov 2026 · 10:15 AM');
  assert.equal(record.category, WasteSpillageCategory.Spoilage);
  assert.equal(record.remarks, 'Spoiled; stored too long.');
});
