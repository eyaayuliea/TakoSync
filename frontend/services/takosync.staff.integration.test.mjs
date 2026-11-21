import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
register('./testTsLoader.mjs', import.meta.url);
const {
  prepareBatterBatch,
  reserveBatterBatchReference,
  processSaleInventory,
  recordInventoryTransactionsIdempotently,
  decideOwnerInventoryCountCorrection,
  validateOwnerInventoryCountCorrection,
  validateOwnerSubmittedInventoryCount,
  submitDailyStockCheck,
  submitSale,
  requestSaleVoid,
  decideSaleVoid,
} = await import('./takosync.ts');
const {
  SaleSubmissionRejectedError,
  isRetryableSaleSubmissionError,
} = await import('./ownerSalesStatus.ts');
import {
  createPendingDailyStockCheckStore,
  sameDailyStockCheckPayload,
} from './dailyStockCheckRecovery.ts';
import {
  createPendingInventoryTransactionStore,
  runInventoryTransactionRequestOnce,
} from './inventoryTransactionRecovery.ts';

class RecordingSupabase {
  calls = [];
  failures = new Map();

  async rpc(name, args) {
    this.calls.push({ name, args });
    const failure = this.failures.get(name);
    if (failure) {
      this.failures.delete(name);
      return { data: null, error: { message: failure } };
    }
    switch (name) {
      case 'record_inventory_transactions_idempotent':
        return {
          data: args.p_transactions.map((transaction, index) => ({
            id: `movement-${index}`,
            reference: `MOV-${args.p_request_id}`,
            branch_id: args.p_branch_id,
            type: transaction.type,
          })),
          error: null,
        };
      case 'next_batter_batch_reference':
        return { data: 'BATCH-20261120-0001', error: null };
      case 'prepare_batter_batch':
        return {
          data: { batch_reference: args.p_batch_reference, bottle_count: 5, prepared_quantity: 5, prepared_unit: 'bottle' },
          error: null,
        };
      case 'submit_sale':
        return {
          data: {
            id: 'sale-1', transaction_reference: args.p_transaction_reference, branch_id: args.p_branch_id,
            total_amount: args.p_total_amount, payment_method: args.p_payment_method, status: 'completed',
            inventory_processing_status: 'completed', inventory_processing_error: null, created_at: '2026-11-13T01:00:00Z',
          },
          error: null,
        };
      case 'process_sale_inventory':
        return { data: { status: 'completed', sale_id: args.p_sale_id }, error: null };
      case 'request_sale_void':
        return {
          data: {
            id: 'void-1', reference: 'VOID-20261122-0001', client_request_id: args.p_client_request_id,
            sale_id: args.p_sale_id, branch_id: 'branch-1', requested_by: 'staff-1', reason: args.p_reason,
            status: 'pending', requested_at: '2026-11-22T03:00:00Z', decided_by: null, decided_at: null,
            decision_reason: null,
          },
          error: null,
        };
      case 'decide_sale_void':
        return {
          data: {
            id: args.p_request_id, reference: 'VOID-20261122-0001', client_request_id: 'c-1', sale_id: 'sale-1',
            branch_id: 'branch-1', requested_by: 'staff-1', reason: 'Wrong flavor',
            status: args.p_decision === 'approve' ? 'approved' : 'rejected', requested_at: '2026-11-22T03:00:00Z',
            decided_by: 'owner-1', decided_at: '2026-11-22T04:00:00Z', decision_reason: args.p_reason,
          },
          error: null,
        };
      case 'decide_inventory_count_correction':
        return { data: { request_id: args.p_request_id, status: args.p_decision }, error: null };
      case 'validate_inventory_count_correction':
        return { data: { request_id: args.p_request_id, outcome: 'adjusted' }, error: null };
      case 'validate_submitted_inventory_count':
        return { data: { daily_stock_count_line_id: args.p_count_line_id, outcome: 'adjusted' }, error: null };
      case 'submit_daily_stock_check':
        return {
          data: {
            id: 'check-1', reference: `IC-${args.p_request_id}`, status: 'pending_owner_review', counted: args.p_lines.length,
            discrepancies: 1, check_date: args.p_check_date,
            lines: args.p_lines.map((line) => ({
              ingredient_id: line.ingredient_id,
              recorded_quantity: line.recorded_quantity,
              physical_quantity: line.physical_quantity,
              difference: line.physical_quantity - line.recorded_quantity,
              unit: line.unit,
              inventory_revision: line.inventory_revision,
            })),
          },
          error: null,
        };
      default:
        throw new Error(`Unexpected RPC ${name}`);
    }
  }
}

const clientForTests = (client) => client;

test('real Staff transaction service submits stock-in, stock-out, and waste payloads with branch context', async () => {
  const client = new RecordingSupabase();
  const transactions = [
    { ingredientId: 'flour', type: 'stock_in', quantity: 2, unit: 'kg', transactionDate: '2026-11-13', reason: 'Stock-In', notes: 'Supplier', batchReference: null, expirationDate: null },
    { ingredientId: 'flour', type: 'stock_out', quantity: 1, unit: 'kg', transactionDate: '2026-11-13', reason: 'Cooking usage', notes: '', batchReference: null, expirationDate: null },
    { ingredientId: 'flour', type: 'waste', quantity: 0.5, unit: 'kg', transactionDate: '2026-11-13', reason: 'Spoilage', notes: 'Expired', batchReference: null, expirationDate: null },
  ];
  for (const [index, transaction] of transactions.entries()) {
    await recordInventoryTransactionsIdempotently('branch-a', `request-${index}`, [transaction], clientForTests(client));
  }

  assert.deepEqual(client.calls.map((call) => call.name), [
    'record_inventory_transactions_idempotent',
    'record_inventory_transactions_idempotent',
    'record_inventory_transactions_idempotent',
  ]);
  assert.deepEqual(client.calls.map((call) => call.args.p_branch_id), ['branch-a', 'branch-a', 'branch-a']);
  assert.deepEqual(client.calls.map((call) => call.args.p_transactions[0].type), ['stock_in', 'stock_out', 'waste']);
  assert.equal(client.calls[2].args.p_transactions[0].reason, 'Spoilage');
});

test('real Staff transaction service reuses request IDs and preserves a pending retry after timeout', async () => {
  const client = new RecordingSupabase();
  client.failures.set('record_inventory_transactions_idempotent', 'network timeout');
  const transaction = {
    ingredientId: 'octopus', type: 'stock_out', quantity: 1, unit: 'kg', transactionDate: '2026-11-13',
    reason: 'Cooking usage', notes: '', batchReference: null, expirationDate: null,
  };
  const request = {
    requestId: 'retry-request-1', actorId: 'staff-a', actorLabel: 'Staff A', branchId: 'branch-a', branchLabel: 'Branch A',
    transactionType: 'stock_out', transactions: [transaction], createdAt: '2026-11-13T01:00:00Z', status: 'pending', reference: null,
  };
  const storage = new Map();
  const store = createPendingInventoryTransactionStore({
    async getItem(key) { return storage.get(key) ?? null; },
    async setItem(key, value) { storage.set(key, value); },
  });
  await store.save(request);
  await assert.rejects(
    runInventoryTransactionRequestOnce(request.requestId, new Set(), () =>
      recordInventoryTransactionsIdempotently(request.branchId, request.requestId, request.transactions, clientForTests(client))),
    /network timeout/,
  );
  const restored = await createPendingInventoryTransactionStore({
    async getItem(key) { return storage.get(key) ?? null; },
    async setItem(key, value) { storage.set(key, value); },
  }).load();
  await recordInventoryTransactionsIdempotently(restored[0].branchId, restored[0].requestId, restored[0].transactions, clientForTests(client));
  assert.deepEqual(client.calls.map((call) => call.args.p_request_id), ['retry-request-1', 'retry-request-1']);
  assert.deepEqual(client.calls[0].args.p_transactions, client.calls[1].args.p_transactions);
});

test('real Staff prepared batter and POS services call their production RPCs', async () => {
  const client = new RecordingSupabase();
  const batch = await prepareBatterBatch('branch-a', 'BAT-1', clientForTests(client));
  const sale = await submitSale({
    branchId: 'branch-a', transactionReference: 'SALE-1', paymentMethod: ' Cash ', totalAmount: 25,
    items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 25 }],
    addons: [{ addonId: 'addon-1', unitPrice: 1.5 }],
  }, clientForTests(client));
  const processing = await processSaleInventory(sale.id, clientForTests(client));

  assert.equal(batch.prepared_quantity, 5);
  assert.equal(sale.branch_id, 'branch-a');
  assert.equal(processing.status, 'completed');
  assert.deepEqual(client.calls.map((call) => call.name), ['prepare_batter_batch', 'submit_sale', 'process_sale_inventory']);
  assert.equal(client.calls[0].args.p_prepared_quantity, 5);
  assert.equal(client.calls[1].args.p_branch_id, 'branch-a');
  assert.deepEqual(client.calls[1].args.p_addons, [{ addon_id: 'addon-1', quantity: 1, unit_price: 1.5 }]);
  assert.equal(client.calls[2].args.p_sale_id, 'sale-1');
});

test('Staff batter preparation reserves a server reference and reuses it for retries', async () => {
  const client = new RecordingSupabase();
  const reference = await reserveBatterBatchReference(clientForTests(client));
  assert.equal(reference, 'BATCH-20261120-0001');
  await prepareBatterBatch('branch-a', reference, new Date(2026, 10, 20), clientForTests(client));
  await prepareBatterBatch('branch-a', reference, new Date(2026, 10, 20), clientForTests(client));
  const prepare = client.calls.filter((call) => call.name === 'prepare_batter_batch');
  assert.equal(prepare.length, 2);
  assert.ok(prepare.every((call) => call.args.p_batch_reference === reference));
});

test('Staff sale service rejects fractional quantities before calling Supabase', async () => {
  const client = new RecordingSupabase();
  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-FRACTIONAL', paymentMethod: 'Cash', totalAmount: 15,
      items: [{ variantId: 'variant-1', quantity: 1.5, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    /positive whole-number quantity/,
  );
  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-DUPLICATE-LINE', paymentMethod: 'Cash', totalAmount: 20,
      items: [
        { variantId: 'variant-1', quantity: 1, unitPrice: 10 },
        { variantId: 'variant-1', quantity: 1, unitPrice: 10 },
      ],
      addons: [],
    }, clientForTests(client)),
    /variant may only appear once/,
  );
  assert.equal(client.calls.length, 0);
});

test('Staff sale service classifies known inventory rejection as non-retryable', async () => {
  const client = new RecordingSupabase();
  client.failures.set('submit_sale', 'sale exceeds available stock');
  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-OUT-OF-STOCK', paymentMethod: 'Cash', totalAmount: 10,
      items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    (error) => error instanceof SaleSubmissionRejectedError
      && !isRetryableSaleSubmissionError(error)
      && /Insufficient inventory/.test(error.message),
  );
  assert.equal(client.calls.filter((call) => call.name === 'submit_sale').length, 1);
});

test('Staff sale submission refuses to present an unresolved inventory sale as completed', async () => {
  const client = new RecordingSupabase();
  const originalRpc = client.rpc.bind(client);
  client.rpc = async (name, args) => {
    const result = await originalRpc(name, args);
    if (name === 'submit_sale') {
      result.data = { ...result.data, inventory_processing_status: 'pending' };
    }
    return result;
  };
  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-INVENTORY-PENDING', paymentMethod: 'Cash', totalAmount: 10,
      items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    /inventory processing is not complete.*retry the same checkout/i,
  );
  assert.equal(client.calls.filter((call) => call.name === 'submit_sale').length, 1);
});

test('real Staff daily count service replays the same request and never calls an inventory mutation RPC', async () => {
  const client = new RecordingSupabase();
  const input = {
    actorId: 'staff-a', branchId: 'branch-a', requestId: 'count-request-1', checkDate: '2026-11-13', remarks: 'Closing count',
    createdAt: '2026-11-13T01:00:00Z',
    lines: [{ ingredientId: 'flour', recordedQuantity: 10, inventoryRevision: 7, physicalQuantity: 9, unit: 'kg' }],
  };
  const first = await submitDailyStockCheck(input, clientForTests(client));
  const storage = new Map();
  const store = createPendingDailyStockCheckStore({
    async getItem(key) { return storage.get(key) ?? null; },
    async setItem(key, value) { storage.set(key, value); },
  });
  await store.save(input);
  const restored = (await store.load())[0];
  const replay = await submitDailyStockCheck(restored, clientForTests(client));

  assert.equal(first.id, replay.id);
  assert.equal(client.calls.length, 2);
  assert.equal(client.calls[0].name, 'submit_daily_stock_check');
  assert.deepEqual(client.calls[0].args, client.calls[1].args);
  assert.equal(client.calls[0].args.p_branch_id, 'branch-a');
  assert.equal(client.calls[0].args.p_request_id, 'count-request-1');
  assert.equal(client.calls.some((call) => call.name === 'record_inventory_transactions_idempotent'), false);
  assert.equal(sameDailyStockCheckPayload(restored, input), true);
});

test('Owner discrepancy actions use the guarded RPCs and normalize reasons', async () => {
  const client = new RecordingSupabase();
  await decideOwnerInventoryCountCorrection({
    requestId: ' correction-1 ',
    decision: 'approved',
    reason: '  Reviewed against the submitted physical count.  ',
  }, clientForTests(client));
  await validateOwnerInventoryCountCorrection({
    requestId: ' correction-1 ',
    reason: '  Authorized after confirming the inventory revision.  ',
  }, clientForTests(client));

  assert.deepEqual(client.calls.map((call) => call.name), [
    'decide_inventory_count_correction',
    'validate_inventory_count_correction',
  ]);
  assert.equal(client.calls[0].args.p_request_id, 'correction-1');
  assert.equal(client.calls[0].args.p_reason, 'Reviewed against the submitted physical count.');
  assert.equal(client.calls[1].args.p_reason, 'Authorized after confirming the inventory revision.');
});

test('Owner discrepancy actions reject missing reasons before calling Supabase', async () => {
  const client = new RecordingSupabase();
  await assert.rejects(
    decideOwnerInventoryCountCorrection({ requestId: 'correction-1', decision: 'rejected', reason: '   ' }, clientForTests(client)),
    /decision reason/,
  );
  await assert.rejects(
    validateOwnerInventoryCountCorrection({ requestId: 'correction-1', reason: '' }, clientForTests(client)),
    /validation reason/,
  );
  assert.equal(client.calls.length, 0);
});

test('Owner can directly validate a submitted discrepancy without a correction request', async () => {
  const client = new RecordingSupabase();
  const result = await validateOwnerSubmittedInventoryCount({
    countLineId: ' count-line-1 ',
    reason: '  Confirmed against the physical count and branch stock.  ',
  }, clientForTests(client));

  assert.equal(result.daily_stock_count_line_id, 'count-line-1');
  assert.equal(client.calls.at(-1).name, 'validate_submitted_inventory_count');
  assert.deepEqual(client.calls.at(-1).args, {
    p_count_line_id: 'count-line-1',
    p_reason: 'Confirmed against the physical count and branch stock.',
  });
});

test('Owner direct count validation rejects a missing reason before calling Supabase', async () => {
  const client = new RecordingSupabase();
  await assert.rejects(
    validateOwnerSubmittedInventoryCount({ countLineId: 'count-line-1', reason: '   ' }, clientForTests(client)),
    /validation reason/,
  );
  assert.equal(client.calls.length, 0);
});

test('real Staff service errors preserve retryable checkout state for ambiguous failures', async () => {
  const client = new RecordingSupabase();
  client.failures.set('submit_sale', 'request timed out');
  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-TIMEOUT', paymentMethod: 'Cash', totalAmount: 10,
      items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    /Checkout status could not be confirmed.*retry the same checkout/,
  );
  assert.equal(client.calls[0].args.p_branch_id, 'branch-a');
});

test('real Staff sale service reports the approved save-failure message when the network is unreachable', async () => {
  const client = new RecordingSupabase();
  client.failures.set('submit_sale', 'TypeError: Failed to fetch');
  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-OFFLINE', paymentMethod: 'Cash', totalAmount: 10,
      items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    { message: 'Unable to save. Please check your internet connection and try again.' },
  );
  assert.equal(client.calls[0].args.p_transaction_reference, 'SALE-OFFLINE');
});

test('real Staff sale service rejects a mismatched saved sale response', async () => {
  const client = new RecordingSupabase();
  const originalRpc = client.rpc.bind(client);
  client.rpc = async (name, args) => {
    const result = await originalRpc(name, args);
    if (name === 'submit_sale') {
      result.data = { ...result.data, branch_id: 'branch-b' };
    }
    return result;
  };

  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-MISMATCH', paymentMethod: 'Cash', totalAmount: 10,
      items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    /saved sale branch did not match/,
  );
});

test('real Staff sale service rejects an incomplete persisted-sale receipt response', async () => {
  const client = new RecordingSupabase();
  const originalRpc = client.rpc.bind(client);
  client.rpc = async (name, args) => {
    const result = await originalRpc(name, args);
    if (name === 'submit_sale') {
      result.data = { ...result.data, id: '', inventory_processing_status: undefined };
    }
    return result;
  };

  await assert.rejects(
    submitSale({
      branchId: 'branch-a', transactionReference: 'SALE-INCOMPLETE', paymentMethod: 'Cash', totalAmount: 10,
      items: [{ variantId: 'variant-1', quantity: 1, unitPrice: 10 }], addons: [],
    }, clientForTests(client)),
    /usable receipt identity/,
  );
});

test('ST-07: a void request sends the trimmed reason and the retry-safe request id', async () => {
  const client = new RecordingSupabase();
  const saved = await requestSaleVoid({ saleId: 'sale-1', reason: '  Wrong flavor ', clientRequestId: 'c-1' }, client);
  assert.deepEqual(client.calls.at(-1), {
    name: 'request_sale_void',
    args: { p_sale_id: 'sale-1', p_reason: 'Wrong flavor', p_client_request_id: 'c-1' },
  });
  assert.equal(saved.status, 'pending');
  assert.equal(saved.reference, 'VOID-20261122-0001');
});

test('ST-07 c3: a blank void reason is rejected before calling Supabase', async () => {
  const client = new RecordingSupabase();
  await assert.rejects(
    requestSaleVoid({ saleId: 'sale-1', reason: '  ', clientRequestId: 'c-1' }, client),
    { message: 'Enter the reason for voiding this sale.' },
  );
  assert.equal(client.calls.length, 0);
});

test('ST-07 c6: the server refusing a second pending request shows its message', async () => {
  const client = new RecordingSupabase();
  client.failures.set('request_sale_void', 'A void request for this sale is already pending.');
  await assert.rejects(
    requestSaleVoid({ saleId: 'sale-1', reason: 'Again', clientRequestId: 'c-2' }, client),
    { message: 'A void request for this sale is already pending.' },
  );
});

test('OM-15: approving and rejecting call decide_sale_void; rejecting needs a reason', async () => {
  const client = new RecordingSupabase();
  const approved = await decideSaleVoid({ requestId: 'void-1', decision: 'approve' }, client);
  assert.equal(approved.status, 'approved');
  assert.deepEqual(client.calls.at(-1).args, { p_request_id: 'void-1', p_decision: 'approve', p_reason: null });

  await assert.rejects(
    decideSaleVoid({ requestId: 'void-1', decision: 'reject', reason: ' ' }, client),
    { message: 'Enter the reason for rejecting this request.' },
  );
  const rejected = await decideSaleVoid({ requestId: 'void-1', decision: 'reject', reason: 'Sale was correct' }, client);
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.decisionReason, 'Sale was correct');
});

test('OM-15 c9: a request someone already decided shows a clear message', async () => {
  const client = new RecordingSupabase();
  client.failures.set('decide_sale_void', 'This request has already been rejected.');
  await assert.rejects(
    decideSaleVoid({ requestId: 'void-1', decision: 'approve' }, client),
    { message: 'This request has already been rejected and can no longer be changed.' },
  );
});
