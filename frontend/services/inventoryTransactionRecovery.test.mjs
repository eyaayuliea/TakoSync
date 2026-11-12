import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetryPendingInventoryTransaction,
  createPendingInventoryTransactionStore,
  runInventoryTransactionRequestOnce,
  sameInventoryTransactionPayload,
  sameInventoryTransactionWorkflow,
} from './inventoryTransactionRecovery.ts';

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

const request = {
  requestId: '44f364f9-b661-42e5-9d9a-bd1f6c6d574a',
  actorId: 'staff-a',
  actorLabel: 'Staff A',
  branchId: 'branch-a',
  branchLabel: 'Branch A',
  transactionType: 'stock_in',
  transactions: [{
    ingredientId: 'flour',
    type: 'stock_in',
    quantity: 3,
    unit: 'kg',
    transactionDate: '2026-11-13',
    reason: 'Stock-In',
    notes: 'Supplier 123',
    batchReference: null,
    expirationDate: '2026-12-01',
  }],
  createdAt: '2026-11-13T01:00:00.000Z',
  status: 'processing',
  reference: null,
};

test('pending request key and exact payload survive store recreation and processing recovers as pending', async () => {
  const storage = createMemoryStorage();
  const firstStore = createPendingInventoryTransactionStore(storage);
  await firstStore.save(request);
  const restored = await createPendingInventoryTransactionStore(storage).load();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].requestId, request.requestId);
  assert.deepEqual(restored[0].transactions, request.transactions);
  assert.equal(restored[0].branchId, request.branchId);
  assert.equal(restored[0].status, 'pending');
});

test('confirmed request is removed only when explicitly resolved', async () => {
  const store = createPendingInventoryTransactionStore(createMemoryStorage());
  await store.save(request);
  const pending = await store.markProcessing(request.requestId);
  assert.equal(pending[0].status, 'processing');
  const resolved = await store.resolve(request.requestId);
  assert.deepEqual(resolved, []);
});

test('edited payload differs from the original and therefore must use a separate request key', () => {
  const edited = request.transactions.map((transaction) => ({ ...transaction, quantity: 4 }));
  assert.equal(sameInventoryTransactionPayload(request.transactions, edited), false);
  assert.equal(sameInventoryTransactionPayload(request.transactions, request.transactions), true);
});

test('waste reasons and usage modes remain within their existing transaction workflows', () => {
  assert.equal(sameInventoryTransactionWorkflow('waste', 'spoilage'), true);
  assert.equal(sameInventoryTransactionWorkflow('usage', 'stock_out'), true);
  assert.equal(sameInventoryTransactionWorkflow('stock_in', 'waste'), false);
});

test('retry is permitted only for the original actor and branch', () => {
  assert.equal(canRetryPendingInventoryTransaction(request, 'staff-a', 'branch-a'), true);
  assert.equal(canRetryPendingInventoryTransaction(request, 'staff-b', 'branch-a'), false);
  assert.equal(canRetryPendingInventoryTransaction(request, 'staff-a', 'branch-b'), false);
});

test('overlapping retries are blocked and a failed retry releases the request lock', async () => {
  const locks = new Set();
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  let attempts = 0;
  const first = runInventoryTransactionRequestOnce(request.requestId, locks, async () => {
    attempts += 1;
    await waiting;
    return 'saved';
  });
  assert.equal(await runInventoryTransactionRequestOnce(request.requestId, locks, async () => {
    attempts += 1;
    return 'duplicate';
  }), null);
  release();
  assert.equal(await first, 'saved');
  assert.equal(attempts, 1);
  await assert.rejects(runInventoryTransactionRequestOnce(request.requestId, locks, async () => {
    throw new Error('network timeout');
  }));
  assert.equal(locks.has(request.requestId), false);
});
