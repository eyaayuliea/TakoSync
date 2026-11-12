import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPendingDailyStockCheckStore,
  sameDailyStockCheckPayload,
} from './dailyStockCheckRecovery.ts';

const request = {
  requestId: 'daily-request-1',
  actorId: 'staff-1',
  branchId: 'branch-1',
  checkDate: '2026-11-13',
  remarks: 'Closing count',
  lines: [{ ingredientId: 'flour', recordedQuantity: 10, inventoryRevision: 4, physicalQuantity: 9, unit: 'pcs' }],
  createdAt: '2026-11-13T00:00:00.000Z',
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
  };
}

test('same request ID reuses the exact saved payload after restart', async () => {
  const storage = memoryStorage();
  await createPendingDailyStockCheckStore(storage).save(request);
  const recovered = await createPendingDailyStockCheckStore(storage).load();
  assert.deepEqual(recovered, [request]);
  assert.equal(sameDailyStockCheckPayload(recovered[0], request), true);
});

test('changed payload is not considered the same retry', () => {
  assert.equal(sameDailyStockCheckPayload(request, { ...request, remarks: 'Changed' }), false);
  assert.equal(sameDailyStockCheckPayload(request, {
    ...request,
    lines: [{ ...request.lines[0], physicalQuantity: 8 }],
  }), false);
});

test('resolved daily count requests are removed only after confirmation', async () => {
  const storage = memoryStorage();
  const store = createPendingDailyStockCheckStore(storage);
  await store.save(request);
  assert.deepEqual(await store.resolve(request.requestId), []);
  assert.deepEqual(await store.load(), []);
});
