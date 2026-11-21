import assert from 'node:assert/strict';
import test from 'node:test';
import { inventoryDisplayItem } from './inventoryDisplay.ts';

const batter = { id: 'prepared-batter', unit: 'ml', quantity: 3400, minimumStock: 1360, quantityPrecision: 0, unitName: 'Millilitre' };

test('prepared batter is shown in bottles (ST-04 c6)', () => {
  assert.deepEqual(inventoryDisplayItem(batter), {
    ...batter,
    quantity: 5,
    minimumStock: 2,
    unit: 'bottles',
    unitName: 'Bottle (680 ml)',
    quantityPrecision: 0,
  });
});

test('other items and batter already in bottles are unchanged', () => {
  const flour = { id: 'flour', unit: 'kg', quantity: 3, minimumStock: 1, quantityPrecision: 2 };
  assert.equal(inventoryDisplayItem(flour), flour);
  const inBottles = { ...batter, unit: 'bottle', quantity: 5 };
  assert.equal(inventoryDisplayItem(inBottles), inBottles);
});

test('a part bottle keeps its decimals', () => {
  assert.equal(inventoryDisplayItem({ ...batter, quantity: 340 }).quantity, 0.5);
  assert.equal(inventoryDisplayItem({ ...batter, quantity: 340 }).quantityPrecision, 3);
});
