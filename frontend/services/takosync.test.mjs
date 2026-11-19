import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePreparedBatterConsumption,
  filterStaffSaleHistory,
  filterUnresolvedSales,
  findDuplicateSaleVariantIds,
  getStaffSaleFeedback,
  getOwnerSaleInventoryStatusLabel,
  filterOwnerSalesByInventoryState,
  isInventoryProcessingSuccessful,
  normalizeSalePayload,
  runInventoryRetryOnce,
  shouldOfferInventoryRetry,
  shouldIncludeOwnerSaleInSummary,
  SalePayloadValidationError,
  SaleSubmissionRejectedError,
  isRetryableSaleSubmissionError,
  validateSaleSubmission,
} from './ownerSalesStatus.ts';

test('sale validation rejects malformed checkout payloads before persistence', () => {
  const valid = {
    transactionReference: 'SALE-1',
    branchId: 'branch-a',
    paymentMethod: 'Cash',
    totalAmount: 10,
    items: [{ variantId: 'variant-a', quantity: 1, unitPrice: 10 }],
    addons: [],
  };

  assert.doesNotThrow(() => validateSaleSubmission(valid));
  assert.doesNotThrow(() => validateSaleSubmission({ ...valid, paymentMethod: 'QR' }));
  assert.doesNotThrow(() => validateSaleSubmission({
    ...valid,
    addons: [{ addonId: 'addon-a', unitPrice: 1.5 }],
  }));
  assert.throws(() => validateSaleSubmission({ ...valid, paymentMethod: 'Card' }), /Select Cash or QR/);
  assert.throws(() => validateSaleSubmission({ ...valid, paymentMethod: 'Cheque' }), /Select Cash or QR/);
  assert.throws(() => validateSaleSubmission({ ...valid, totalAmount: 0 }), /greater than zero/);
  assert.throws(() => validateSaleSubmission({ ...valid, items: [] }), /at least one item/);
  assert.throws(() => validateSaleSubmission({ ...valid, items: [{ variantId: 'variant-a', quantity: 0, unitPrice: 10 }] }), /positive whole-number quantity/);
  assert.throws(
    () => validateSaleSubmission({ ...valid, items: [{ variantId: 'variant-a', quantity: 1.5, unitPrice: 10 }] }),
    SalePayloadValidationError,
  );
  assert.throws(
    () => validateSaleSubmission({ ...valid, items: [{ variantId: 'variant-a', quantity: 1, unitPrice: 10 }, { variantId: 'variant-a', quantity: 1, unitPrice: 10 }] }),
    /variant may only appear once/,
  );
  assert.throws(
    () => validateSaleSubmission({ ...valid, addons: [{ addonId: 'addon-a', unitPrice: 1 }, { addonId: 'addon-a', unitPrice: 1 }] }),
    /add-on may only appear once/,
  );
  assert.throws(
    () => validateSaleSubmission({ ...valid, addons: [{ addonId: 'addon-a', quantity: 0.5, unitPrice: 1 }] }),
    /positive whole-number quantity/,
  );
});

test('checkout retry classification separates definitive failures from uncertain outcomes', () => {
  assert.equal(isRetryableSaleSubmissionError(new Error('request timeout')), true);
  assert.equal(isRetryableSaleSubmissionError(new SalePayloadValidationError('invalid cart')), false);
  assert.equal(isRetryableSaleSubmissionError(new SaleSubmissionRejectedError('insufficient stock')), false);
});

test('sale retry payload normalization is order-independent but price-sensitive', () => {
  const first = normalizeSalePayload({
    branchId: 'branch-a', paymentMethod: ' Cash ', totalAmount: 13,
    items: [{ variantId: 'variant-b', quantity: 1, unitPrice: 10 }, { variantId: 'variant-a', quantity: 1, unitPrice: 2 }],
    addons: [{ addonId: 'addon-b', unitPrice: 1 }, { addonId: 'addon-a', unitPrice: 0.5 }],
  });
  const reordered = normalizeSalePayload({
    branchId: 'branch-a', paymentMethod: 'cash', totalAmount: 13,
    items: [{ variantId: 'variant-a', quantity: 1, unitPrice: 2 }, { variantId: 'variant-b', quantity: 1, unitPrice: 10 }],
    addons: [{ addonId: 'addon-a', unitPrice: 0.5, quantity: 1 }, { addonId: 'addon-b', unitPrice: 1, quantity: 1 }],
  });
  assert.deepEqual(first, reordered);
  assert.notDeepEqual(first, normalizeSalePayload({ ...reordered, addons: [{ addonId: 'addon-a', unitPrice: 0.75 }] }));
  const differentQuantity = normalizeSalePayload({
    ...reordered,
    items: [{ ...reordered.items[0], quantity: 2 }, reordered.items[1]],
  });
  assert.notDeepEqual(first, differentQuantity);
  const differentAddonQuantity = normalizeSalePayload({
    ...reordered,
    addons: [{ addonId: 'addon-a', unitPrice: 0.5, quantity: 2 }],
  });
  assert.notDeepEqual(first, differentAddonQuantity);
});

const sales = [
  { status: 'completed', total_amount: 10, inventory_processing_status: 'completed', inventory_processing_error: null },
  { status: 'completed', total_amount: 20, inventory_processing_status: 'pending', inventory_processing_error: null },
  { status: 'completed', total_amount: 30, inventory_processing_status: 'failed', inventory_processing_error: 'Ingredient deduction failed' },
  { status: 'completed', total_amount: 40, inventory_processing_status: undefined, inventory_processing_error: null },
  { status: 'cancelled', total_amount: 0, inventory_processing_status: 'completed', inventory_processing_error: null },
];

test('Owner summaries include completed sales regardless of inventory processing status', () => {
  const visibleSales = sales.filter(shouldIncludeOwnerSaleInSummary);
  assert.equal(visibleSales.length, 4);
  assert.deepEqual(visibleSales.map((sale) => sale.inventory_processing_status), ['completed', 'pending', 'failed', undefined]);
  assert.equal(getOwnerSaleInventoryStatusLabel(sales[0]), 'Completed');
  assert.equal(getOwnerSaleInventoryStatusLabel(sales[1]), 'Pending');
  assert.equal(getOwnerSaleInventoryStatusLabel(sales[2]), 'Failed');
  assert.equal(isInventoryProcessingSuccessful(sales[0]), true);
  assert.equal(isInventoryProcessingSuccessful(sales[1]), false);
  assert.equal(isInventoryProcessingSuccessful(sales[2]), false);
  assert.equal(isInventoryProcessingSuccessful(sales[3]), false);
  assert.equal(getOwnerSaleInventoryStatusLabel({ status: 'pending' }), 'Pending');
  assert.equal(getOwnerSaleInventoryStatusLabel({ status: 'completed' }), 'Pending');
  assert.equal(getOwnerSaleInventoryStatusLabel({ status: 'completed', inventory_processing_status: 'unknown' }), 'Pending');
  assert.equal(getOwnerSaleInventoryStatusLabel({ status: 'cancelled' }), 'Failed');
});

test('owner sales reconciliation separates recorded sales from inventory-confirmed sales', () => {
  assert.deepEqual(filterOwnerSalesByInventoryState(sales, 'all').map((sale) => sale.inventory_processing_status), ['completed', 'pending', 'failed', undefined]);
  assert.deepEqual(filterOwnerSalesByInventoryState(sales, 'confirmed').map((sale) => sale.inventory_processing_status), ['completed']);
  assert.deepEqual(filterOwnerSalesByInventoryState(sales, 'needs_processing').map((sale) => sale.inventory_processing_status), ['pending', 'failed', undefined]);
});

test('sale payload normalization tolerates missing arrays and empty identifiers', () => {
  const normalized = normalizeSalePayload({
    branchId: '  branch-a  ',
    paymentMethod: ' Cash ',
    totalAmount: 12.345,
    items: [{ variantId: '  v-2  ', quantity: 1, unitPrice: 6.5 }, { variantId: '', quantity: 1, unitPrice: 0 }, undefined],
    addons: [{ addonId: '  addon-b  ', unitPrice: 2.5 }, { addonId: '', unitPrice: 1.2, quantity: undefined }],
  });

  assert.deepEqual(normalized.branchId, 'branch-a');
  assert.equal(normalized.paymentMethod, 'cash');
  assert.equal(normalized.totalAmount, 12.35);
  assert.deepEqual(normalized.items.map((item) => item.variantId), ['v-2']);
  assert.deepEqual(normalized.addons.map((addon) => addon.addonId), ['addon-b']);
});

test('staff checkout feedback distinguishes recorded and inventory outcomes', () => {
  assert.match(getStaffSaleFeedback('SALE-1', 'completed'), /recorded successfully/);
  assert.match(getStaffSaleFeedback('SALE-2', 'pending'), /recorded; inventory processing is pending/);
  assert.match(getStaffSaleFeedback('SALE-3', 'failed'), /recorded, but inventory processing failed/);
  assert.match(getStaffSaleFeedback('SALE-4', 'processing'), /recorded; inventory processing is in progress/);
});

test('Staff offers repeatable inventory recovery until processing is confirmed complete', () => {
  for (const status of ['pending', 'processing', 'failed', null, undefined]) {
    assert.equal(shouldOfferInventoryRetry(status), true, `${status} remains eligible for retry`);
  }
  assert.equal(shouldOfferInventoryRetry('completed'), false);
});

const recoverySales = [
  { id: 'pending', transaction_reference: 'SALE-P', branch_id: 'branch-a', total_amount: 10, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'pending', inventory_processing_error: null, created_at: '2026-11-12T10:00:00Z' },
  { id: 'processing', transaction_reference: 'SALE-W', branch_id: 'branch-a', total_amount: 12, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'processing', inventory_processing_error: null, created_at: '2026-11-12T10:01:00Z' },
  { id: 'failed', transaction_reference: 'SALE-F', branch_id: 'branch-a', total_amount: 14, payment_method: 'Card', status: 'completed', inventory_processing_status: 'failed', inventory_processing_error: 'Recorded for support', created_at: '2026-11-12T10:02:00Z' },
  { id: 'completed', transaction_reference: 'SALE-C', branch_id: 'branch-a', total_amount: 16, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed', inventory_processing_error: null, created_at: '2026-11-12T10:03:00Z' },
  { id: 'other-branch', transaction_reference: 'SALE-O', branch_id: 'branch-b', total_amount: 18, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'failed', inventory_processing_error: null, created_at: '2026-11-12T10:04:00Z' },
  { id: 'cancelled', transaction_reference: 'SALE-X', branch_id: 'branch-a', total_amount: 0, payment_method: 'Cash', status: 'cancelled', inventory_processing_status: 'failed', inventory_processing_error: null, created_at: '2026-11-12T10:05:00Z' },
];

test('persistent recovery retrieval includes pending and failed sales, excluding completed, cancelled, and other branches', () => {
  const recoveredAfterRecreation = filterUnresolvedSales([...recoverySales], 'branch-a');
  assert.deepEqual(recoveredAfterRecreation.map((sale) => sale.id), ['pending', 'processing', 'failed']);
});

test('receipt history includes every non-cancelled recorded sale for the assigned branch', () => {
  const history = filterStaffSaleHistory(recoverySales, 'branch-a');
  assert.deepEqual(history.map((sale) => sale.id), ['pending', 'processing', 'failed', 'completed']);
});

test('successful recovery refresh removes the completed sale while failed recovery remains visible', () => {
  const failedAttempt = recoverySales.map((sale) =>
    sale.id === 'failed' ? { ...sale, inventory_processing_status: 'failed' } : sale,
  );
  assert.deepEqual(filterUnresolvedSales(failedAttempt, 'branch-a').map((sale) => sale.id), ['pending', 'processing', 'failed']);

  const successfulAttempt = recoverySales.map((sale) =>
    sale.id === 'failed' ? { ...sale, inventory_processing_status: 'completed' } : sale,
  );
  assert.deepEqual(filterUnresolvedSales(successfulAttempt, 'branch-a').map((sale) => sale.id), ['pending', 'processing']);
});

test('concurrent retries for the same sale are coalesced and failed retries can be attempted again', async () => {
  const locks = new Set();
  let releaseRetry;
  const retryResult = new Promise((resolve) => {
    releaseRetry = resolve;
  });
  let attempts = 0;
  const firstRetry = runInventoryRetryOnce('failed', locks, async () => {
    attempts += 1;
    return retryResult;
  });
  const overlappingRetry = await runInventoryRetryOnce('failed', locks, async () => {
    attempts += 1;
  });
  assert.equal(overlappingRetry, null);
  assert.equal(attempts, 1);
  releaseRetry('failed');
  assert.equal(await firstRetry, 'failed');
  assert.equal(await runInventoryRetryOnce('failed', locks, async () => {
    attempts += 1;
    return 'completed';
  }), 'completed');
  assert.equal(attempts, 2);
});

test('duplicate menu variants are identified before sale submission', () => {
  const duplicateIds = findDuplicateSaleVariantIds([
    { variantId: 'v-1' },
    { variantId: 'v-2' },
    { variantId: 'v-1' },
    { variantId: 'v-3' },
  ]);
  assert.deepEqual(duplicateIds, ['v-1']);
  assert.deepEqual(findDuplicateSaleVariantIds([{ variantId: 'v-1' }, { variantId: 'v-2' }]), []);
});

test('prepared batter calculations follow the configured yield and batch quantities', () => {
  const preparedQuantity = 5;
  const estimatedYieldPieces = 125;
  const soldPieces = 125;
  assert.equal(calculatePreparedBatterConsumption(soldPieces, preparedQuantity, estimatedYieldPieces), 5);
  assert.equal(calculatePreparedBatterConsumption(50, preparedQuantity, estimatedYieldPieces), 2);
  assert.equal(calculatePreparedBatterConsumption(0, preparedQuantity, estimatedYieldPieces), 0);
});

test('completed recorded sales enter Owner totals regardless of inventory status', () => {
  const completedSales = sales.filter(shouldIncludeOwnerSaleInSummary);
  const cancelledSales = sales.filter((sale) => sale.status === 'cancelled');
  assert.equal(cancelledSales.length, 1);
  assert.equal(completedSales.length, 4);
  assert.deepEqual(
    sales
      .filter((sale) => sale.status === 'completed')
      .map((sale) => sale.inventory_processing_status),
    ['completed', 'pending', 'failed', undefined],
  );
});

test('Owner sales totals include pending and failed inventory processing', () => {
  const completedSales = sales.filter(shouldIncludeOwnerSaleInSummary);
  const totalSalesValue = completedSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
  assert.equal(totalSalesValue, 100);
  assert.equal(completedSales.filter(isInventoryProcessingSuccessful).length, 1);
  assert.deepEqual(
    sales.filter((sale) => sale.status === 'completed').map((sale) => sale.inventory_processing_status),
    ['completed', 'pending', 'failed', undefined],
  );
});
