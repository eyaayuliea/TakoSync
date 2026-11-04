import assert from 'node:assert/strict';
import test from 'node:test';
import { getIngredientStatus, isNearExpiry } from './mockData.ts';

function ingredient(overrides = {}) {
  return {
    id: 'sample',
    name: 'Sample',
    category: 'Dry Goods',
    quantity: 10,
    unit: 'kg',
    minimumStock: 5,
    receivedBatch: 'BATCH-1',
    expirationDate: null,
    lastUpdated: '29 Oct 2026 · 10:30 AM',
    emoji: '📦',
    ...overrides,
  };
}

test('near-expiry checks only active future dates within the 7-day window', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const sevenDays = new Date(today.getTime() + 7 * 86_400_000);
  const expired = new Date(today.getTime() - 86_400_000);

  assert.equal(isNearExpiry(ingredient({ expirationDate: dateKey(today) })), true);
  assert.equal(isNearExpiry(ingredient({ expirationDate: dateKey(tomorrow) })), true);
  assert.equal(isNearExpiry(ingredient({ expirationDate: dateKey(sevenDays) })), true);
  assert.equal(isNearExpiry(ingredient({ expirationDate: dateKey(new Date(today.getTime() + 8 * 86_400_000)) })), false);
  assert.equal(isNearExpiry(ingredient({ expirationDate: dateKey(expired) })), false);
});

test('low-stock status wins over near-expiry, while still identifying soon-to-expire items', () => {
  assert.equal(getIngredientStatus(ingredient({ quantity: 5, minimumStock: 5, expirationDate: null })), 'Low stock');
  assert.equal(getIngredientStatus(ingredient({ quantity: 12, minimumStock: 5, expirationDate: dateKey(new Date(Date.now() + 2 * 86_400_000)) })), 'Near expiry');
  assert.equal(getIngredientStatus(ingredient({ quantity: 12, minimumStock: 5, expirationDate: null })), 'In stock');
});

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
