import assert from 'node:assert/strict';
import test from 'node:test';
import {
  draftOrderStorageKey,
  loadDraftOrder,
  parseDraftOrder,
  saveDraftOrder,
} from './draftOrderStorage.ts';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  };
}

test('draft orders are kept per staff account and branch', () => {
  assert.notEqual(draftOrderStorageKey('staff-a', 'branch-1'), draftOrderStorageKey('staff-b', 'branch-1'));
  assert.notEqual(draftOrderStorageKey('staff-a', 'branch-1'), draftOrderStorageKey('staff-a', 'branch-2'));
});

test('a saved draft order round-trips with its reference and add-ons', async () => {
  const storage = memoryStorage();
  const key = draftOrderStorageKey('staff-a', 'branch-1');
  await saveDraftOrder(storage, key, {
    cart: [{ productId: 'v1', quantity: 3 }],
    addonIds: ['mayo'],
    transactionReference: 'SALE-1',
  }, new Date('2026-11-25T08:00:00Z'));
  assert.deepEqual(await loadDraftOrder(storage, key), {
    cart: [{ productId: 'v1', quantity: 3 }],
    addonIds: ['mayo'],
    transactionReference: 'SALE-1',
    savedAt: '2026-11-25T08:00:00.000Z',
  });
});

test('an empty order removes the saved draft', async () => {
  const storage = memoryStorage();
  const key = draftOrderStorageKey('staff-a', 'branch-1');
  await saveDraftOrder(storage, key, { cart: [{ productId: 'v1', quantity: 1 }], addonIds: [], transactionReference: null });
  await saveDraftOrder(storage, key, { cart: [], addonIds: [], transactionReference: null });
  assert.equal(storage.values.has(key), false);
  assert.equal(await loadDraftOrder(storage, key), null);
});

test('unreadable or malformed drafts are ignored', () => {
  assert.equal(parseDraftOrder(null), null);
  assert.equal(parseDraftOrder('{not json'), null);
  assert.equal(parseDraftOrder(JSON.stringify({ cart: [{ productId: 'v1', quantity: 0 }], addonIds: [], transactionReference: null, savedAt: 'x' })), null);
  assert.equal(parseDraftOrder(JSON.stringify({ cart: [{ productId: 'v1', quantity: 1.5 }], addonIds: [], transactionReference: null, savedAt: 'x' })), null);
  assert.equal(parseDraftOrder(JSON.stringify({ cart: [], addonIds: [3], transactionReference: null, savedAt: 'x' })), null);
  assert.equal(parseDraftOrder(JSON.stringify({ cart: [], addonIds: [], transactionReference: null, savedAt: 'x' })), null, 'empty');
  assert.deepEqual(
    parseDraftOrder(JSON.stringify({ cart: [], addonIds: ['a', 'a'], transactionReference: null, savedAt: 'x' }))?.addonIds,
    ['a'],
    'duplicate add-ons are collapsed',
  );
});
