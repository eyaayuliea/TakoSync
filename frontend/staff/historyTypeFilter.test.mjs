import assert from 'node:assert/strict';
import test from 'node:test';
import { STAFF_HISTORY_TYPE_FILTERS, historyTypeFilterTabLabel, matchesHistoryTypeFilter } from './historyTypeFilter.ts';

test('the type filter offers exactly the ST-14 c2 types', () => {
  assert.deepEqual([...STAFF_HISTORY_TYPE_FILTERS], [
    'All types', 'Stock-In', 'Sales Consumption', 'Waste', 'Spillage', 'Spoilage',
    'Physical Inventory Count', 'Count Revision', 'Authorized Adjustment', 'Void', 'Entry Reversal',
  ]);
});

test('Spillage and Waste are told apart by the recorded reason', () => {
  const spill = { type: 'Waste', reason: 'Spillage' };
  const waste = { type: 'Waste', reason: 'Waste' };
  assert.equal(matchesHistoryTypeFilter(spill, 'Spillage'), true);
  assert.equal(matchesHistoryTypeFilter(spill, 'Waste'), false);
  assert.equal(matchesHistoryTypeFilter(waste, 'Waste'), true);
  assert.equal(matchesHistoryTypeFilter(waste, 'Spillage'), false);
});

test('Count Revision lists counts changed by a correction', () => {
  const plain = { type: 'Physical Inventory Count', reason: '', physicalCount: { correctionHistory: [], revisedActualQuantity: null } };
  const revised = { type: 'Physical Inventory Count', reason: '', physicalCount: { correctionHistory: [{}], revisedActualQuantity: 4 } };
  assert.equal(matchesHistoryTypeFilter(plain, 'Count Revision'), false);
  assert.equal(matchesHistoryTypeFilter(revised, 'Count Revision'), true);
  assert.equal(matchesHistoryTypeFilter(revised, 'Physical Inventory Count'), true);
});

test('Void lists Void Reversal entries; other types match by name; All shows everything', () => {
  assert.equal(matchesHistoryTypeFilter({ type: 'Void Reversal', reason: '' }, 'Void'), true);
  assert.equal(matchesHistoryTypeFilter({ type: 'Entry Reversal', reason: '' }, 'Entry Reversal'), true);
  assert.equal(matchesHistoryTypeFilter({ type: 'Usage', reason: 'Batter preparation' }, 'Stock-In'), false);
  assert.equal(matchesHistoryTypeFilter({ type: 'Usage', reason: 'Batter preparation' }, 'All types'), true);
});

test('ST-14 c2: batter batches and opening stock appear only under All types', () => {
  const use = { type: 'Usage', reason: 'Batter preparation' };
  const yieldRow = { type: 'Stock-In', reason: 'Batter preparation' };
  const receipt = { type: 'Stock-In', reason: 'Stock-In' };
  const opening = { type: 'Stock-In', reason: 'Opening stock' };
  const cooking = { type: 'Usage', reason: 'Cooking usage' };
  assert.deepEqual([receipt, yieldRow, opening].map((row) => matchesHistoryTypeFilter(row, 'Stock-In')), [true, false, false]);
  for (const row of [use, yieldRow, opening, cooking]) {
    const matching = STAFF_HISTORY_TYPE_FILTERS.filter((filter) => matchesHistoryTypeFilter(row, filter));
    assert.deepEqual(matching, ['All types']);
  }
  for (const removed of ['Opening', 'Batter Use', 'Batter Yield']) assert.ok(!STAFF_HISTORY_TYPE_FILTERS.includes(removed));
  assert.equal(historyTypeFilterTabLabel('Sales Consumption'), 'Sales Consumption');
  assert.equal(historyTypeFilterTabLabel('All types'), 'All');
});
