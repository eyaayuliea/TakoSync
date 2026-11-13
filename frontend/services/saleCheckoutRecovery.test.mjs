import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetryPendingSaleCheckout,
  createPendingSaleCheckoutStore,
} from './saleCheckoutRecovery.ts';

function memoryStorage(initial = null) {
  let value = initial;
  return {
    async getItem() { return value; },
    async setItem(_key, next) { value = next; },
  };
}

const pendingSale = {
  requestId: 'SALE-RETRY-1',
  transactionReference: 'SALE-RETRY-1',
  actorId: 'staff-1',
  actorLabel: 'Staff One',
  branchId: 'branch-1',
  branchLabel: 'Branch 1',
  paymentMethod: 'Cash',
  totalAmount: 250,
  items: [{ variantId: 'product-1', quantity: 2, unitPrice: 125 }],
  addons: [],
  createdAt: '2026-11-13T01:00:00.000Z',
};

test('pending sale recovery preserves the original reference and payload', async () => {
  const store = createPendingSaleCheckoutStore(memoryStorage());
  await store.save(pendingSale);
  const loaded = await store.load();
  assert.deepEqual(loaded, [pendingSale]);
  assert.equal(loaded[0].transactionReference, pendingSale.transactionReference);
  await store.resolve(pendingSale.requestId);
  assert.deepEqual(await store.load(), []);
});

test('pending sale recovery only permits the original staff branch', () => {
  assert.equal(canRetryPendingSaleCheckout(pendingSale, 'staff-1', 'branch-1'), true);
  assert.equal(canRetryPendingSaleCheckout(pendingSale, 'staff-2', 'branch-1'), false);
  assert.equal(canRetryPendingSaleCheckout(pendingSale, 'staff-1', 'branch-2'), false);
});

test('malformed recovery data is rejected without clearing it', async () => {
  const storage = memoryStorage('{not-json');
  const store = createPendingSaleCheckoutStore(storage);
  await assert.rejects(() => store.load(), /Saved checkout recovery data is unreadable/);
  assert.equal(await storage.getItem('ignored'), '{not-json');
});
