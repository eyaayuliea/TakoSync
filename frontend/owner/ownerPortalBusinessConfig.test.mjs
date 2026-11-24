import assert from 'node:assert/strict';
import test from 'node:test';
import { branchNameError, CONFIG_SECTIONS, openingStockRows, parseOpeningQuantity, unitRows } from './ownerPortalBusinessConfig.ts';

test('OW-28 c1: the nine configuration sections', () => {
  assert.deepEqual(CONFIG_SECTIONS.map((section) => section.title), [
    'Branch information', 'Product information', 'Ingredient information', 'Units of Measurement', 'Recipes',
    'Batter Batch settings', 'Stock Thresholds', 'Expiration Alert settings', 'Opening Stock',
  ]);
});

test('OW-28 c3, c9: branch names are required, short and unique', () => {
  const branches = [{ id: 'b1', city: 'Manila' }, { id: 'b2', city: '' }];
  assert.equal(branchNameError('Cebu', 'b2', branches), null);
  assert.equal(branchNameError(' ', 'b2', branches), 'Enter the branch name.');
  assert.equal(branchNameError('manila', 'b2', branches), 'Another branch is already named “manila”.');
  assert.equal(branchNameError('Manila', 'b1', branches), null);
  assert.match(branchNameError('x'.repeat(61), 'b2', branches), /at most 60/);
});

test('OW-28 c4: units and conversion factors by base unit', () => {
  const units = [{ code: 'g', dimension: 'mass' }, { code: 'kg', dimension: 'mass' }, { code: 'ml', dimension: 'volume' }, { code: 'L', dimension: 'volume' },
    { code: 'tsp', dimension: 'volume' }, { code: 'tbsp', dimension: 'volume' }, { code: 'pcs', dimension: 'count' }, { code: 'bottle', dimension: 'package' }, { code: 'unknown', dimension: 'pending' }];
  const conversions = [{ from_unit: 'kg', to_unit: 'g', factor: 1000 }, { from_unit: 'g', to_unit: 'kg', factor: 0.001 }, { from_unit: 'L', to_unit: 'ml', factor: 1000 }, { from_unit: 'tbsp', to_unit: 'tsp', factor: 3 }];
  assert.deepEqual(unitRows(units, conversions), [
    ['g', 'g, kg', '1 kg = 1000 g'],
    ['ml', 'ml, L, tsp, tbsp', '1 L = 1000 ml; 1 tbsp = 3 tsp'],
    ['pcs', 'pcs, bottle', '—'],
  ]);
});

test('OW-28 c5, c6, c9: opening stock rows per branch and quantity parsing', () => {
  const rows = openingStockRows({
    branchId: 'b1',
    ingredients: [{ id: 'salt', name: 'Salt', unit: 'tsp' }, { id: 'eggs', name: 'Eggs', unit: 'pcs' }, { id: 'nori', name: 'Nori', unit: 'g' }],
    inventory: [{ branch_id: 'b1', ingredient_id: 'salt', quantity: 10 }, { branch_id: 'b1', ingredient_id: 'eggs', quantity: 30 }, { branch_id: 'b2', ingredient_id: 'nori', quantity: 1 }],
    entries: [{ branch_id: 'b1', ingredient_id: 'salt', quantity: 25, previous_quantity: 10, recorded_at: '2026-11-24T02:00:00Z' }],
  });
  assert.deepEqual(rows.map((row) => [row.name, row.current, row.entry?.quantity ?? null]), [['Salt', 10, 25], ['Eggs', 30, null]]);
  assert.deepEqual(parseOpeningQuantity('12.5', 'Eggs'), { value: 12.5 });
  assert.deepEqual(parseOpeningQuantity('', 'Eggs'), { error: 'Enter the opening stock of Eggs.' });
  assert.ok('error' in parseOpeningQuantity('-1', 'Eggs'));
  assert.ok('error' in parseOpeningQuantity('1.2345', 'Eggs'));
});
