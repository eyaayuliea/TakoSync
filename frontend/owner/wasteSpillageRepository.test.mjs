import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatWasteSpillageDateTime,
  formatWasteSpillageQuantity,
  getForcedWasteSpillageState,
  getWasteSpillageById,
  getWasteSpillageMockList,
  WASTE_SPILLAGE_CATEGORY_LABELS,
  WasteSpillageCategory,
} from './wasteSpillageRepository.ts';

test('waste records use shared inventory units and are sorted newest first', () => {
  const records = getWasteSpillageMockList();

  assert.deepEqual(records.map(({ ingredientName, quantity, unit, branchName }) => [
    ingredientName, formatWasteSpillageQuantity({ quantity, unit }), branchName,
  ]), [
    ['Eggs', '6 pcs', 'Branch 3'],
    ['Takoyaki Sauce', '0.5 L', 'Branch 1'],
    ['Mayonnaise', '0.4 kg', 'Branch 2'],
    ['Bonito Flakes', '0.2 kg', 'Branch 1'],
  ]);
  assert.deepEqual(records.map((record) => WASTE_SPILLAGE_CATEGORY_LABELS[record.category]), [
    'Spoilage', 'Spillage', 'Waste', 'Other',
  ]);
  assert.equal(records[0].recordedBy, 'Ana Reyes');
});

test('details use the year and Manila time, and empty remarks stay empty in the model', () => {
  const record = getWasteSpillageById('WS-1112-0008');
  const sauceRecord = getWasteSpillageById('WS-1112-0007');

  assert.equal(record && formatWasteSpillageDateTime(record.createdAt), '12 Nov 2026 · 10:15 AM');
  assert.equal(record?.category, WasteSpillageCategory.Spoilage);
  assert.equal(sauceRecord?.remarks, '');
});

test('the development toggle supports the loading-more state', () => {
  const previous = process.env.EXPO_PUBLIC_FORCE_WASTE_SPILLAGE_STATE;
  process.env.EXPO_PUBLIC_FORCE_WASTE_SPILLAGE_STATE = 'load_more';
  assert.equal(getForcedWasteSpillageState(), 'load_more');
  if (previous === undefined) delete process.env.EXPO_PUBLIC_FORCE_WASTE_SPILLAGE_STATE;
  else process.env.EXPO_PUBLIC_FORCE_WASTE_SPILLAGE_STATE = previous;
});
