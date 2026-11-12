import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPendingInventoryCountCorrectionStore,
  isDefinitiveCorrectionRequestRejection,
  PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY,
} from './inventoryCountCorrectionRecovery.ts';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
}

const request = {
  requestId: '4e571182-8cf0-4bdb-8714-57f857972d8c',
  actorId: 'staff-1',
  branchId: 'branch-1',
  countLineId: 'line-1',
  correctedActualQuantity: 7,
  reason: 'Corrected count after recount',
  createdAt: '2026-11-13T00:00:00.000Z',
};

test('a pending count correction and its idempotency key survive store recreation', async () => {
  const storage = memoryStorage();
  await createPendingInventoryCountCorrectionStore(storage).save(request);
  const recovered = await createPendingInventoryCountCorrectionStore(storage).load();
  assert.deepEqual(recovered, [request]);
  assert.ok(storage.values.has(PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY));
});

test('confirmed correction retries are removed explicitly without affecting another request', async () => {
  const store = createPendingInventoryCountCorrectionStore(memoryStorage());
  await store.save(request);
  const other = { ...request, requestId: '9e571182-8cf0-4bdb-8714-57f857972d8c', countLineId: 'line-2' };
  await store.save(other);
  assert.deepEqual(await store.resolve(request.requestId), [other]);
});

test('corrupt persisted correction data fails visibly instead of being discarded', async () => {
  const storage = memoryStorage();
  storage.values.set(PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY, '{bad');
  await assert.rejects(
    createPendingInventoryCountCorrectionStore(storage).load(),
    /unreadable/,
  );
  assert.equal(storage.values.get(PENDING_INVENTORY_COUNT_CORRECTIONS_STORAGE_KEY), '{bad');
});

test('only an explicit rejected RPC response is safe to remove from retry storage', () => {
  assert.equal(isDefinitiveCorrectionRequestRejection('P0001'), true);
  assert.equal(isDefinitiveCorrectionRequestRejection('22023'), true);
  assert.equal(isDefinitiveCorrectionRequestRejection('42501'), false);
  assert.equal(isDefinitiveCorrectionRequestRejection('23505'), false);
  assert.equal(isDefinitiveCorrectionRequestRejection('PGRST000'), false);
  assert.equal(isDefinitiveCorrectionRequestRejection(undefined), false);
});
