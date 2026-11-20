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

test('pending QR checkout recovery is accepted and Card checkout recovery is rejected', async () => {
  const qrSale = { ...pendingSale, paymentMethod: 'QR' };
  const qrStore = createPendingSaleCheckoutStore(memoryStorage());
  await qrStore.save(qrSale);
  assert.deepEqual(await qrStore.load(), [qrSale]);

  const cardStore = createPendingSaleCheckoutStore(memoryStorage(JSON.stringify([
    { ...pendingSale, paymentMethod: 'Card' },
  ])));
  await assert.rejects(() => cardStore.load(), /Saved checkout recovery data is invalid/);
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

test('a retry after restart cannot overwrite the original payment or items', async () => {
  const storage = memoryStorage();
  const firstStore = createPendingSaleCheckoutStore(storage);
  await firstStore.save(pendingSale);

  const restartedStore = createPendingSaleCheckoutStore(storage);
  await assert.rejects(
    restartedStore.save({ ...pendingSale, paymentMethod: 'QR' }),
    /already has a saved payment and item list/,
  );
  await assert.rejects(
    restartedStore.save({ ...pendingSale, actorId: 'different-staff' }),
    /already has a saved payment and item list/,
  );
  await restartedStore.save({ ...pendingSale, createdAt: '2026-11-13T01:15:00.000Z' });
  assert.deepEqual(await restartedStore.load(), [pendingSale]);
});
