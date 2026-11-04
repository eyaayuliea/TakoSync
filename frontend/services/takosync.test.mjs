import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePreparedBatterConsumption,
  findDuplicateSaleVariantIds,
  getStaffSaleFeedback,
  getOwnerSaleInventoryStatusLabel,
  isInventoryProcessingSuccessful,
  normalizeSalePayload,
  shouldIncludeOwnerSaleInSummary,
} from './ownerSalesStatus.ts';

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
  { status: 'completed', inventory_processing_status: 'completed', inventory_processing_error: null },
  { status: 'completed', inventory_processing_status: 'pending', inventory_processing_error: null },
  { status: 'completed', inventory_processing_status: 'failed', inventory_processing_error: 'Ingredient deduction failed' },
  { status: 'cancelled', inventory_processing_status: 'completed', inventory_processing_error: null },
];

test('owner sales include completed sales regardless of inventory processing status', () => {
  const visibleSales = sales.filter(shouldIncludeOwnerSaleInSummary);
  assert.equal(visibleSales.length, 3);
  assert.deepEqual(visibleSales.map((sale) => sale.inventory_processing_status), [
    'completed',
    'pending',
    'failed',
  ]);
  assert.equal(getOwnerSaleInventoryStatusLabel(sales[0]), 'Completed');
  assert.equal(getOwnerSaleInventoryStatusLabel(sales[1]), 'Pending');
  assert.equal(getOwnerSaleInventoryStatusLabel(sales[2]), 'Failed');
  assert.equal(isInventoryProcessingSuccessful(sales[0]), true);
  assert.equal(isInventoryProcessingSuccessful(sales[1]), false);
  assert.equal(isInventoryProcessingSuccessful(sales[2]), false);
});

test('staff checkout feedback distinguishes recorded and inventory outcomes', () => {
  assert.match(getStaffSaleFeedback('SALE-1', 'completed'), /recorded successfully/);
  assert.match(getStaffSaleFeedback('SALE-2', 'pending'), /being processed/);
  assert.match(getStaffSaleFeedback('SALE-3', 'failed'), /inventory processing failed/);
});

test('duplicate checkout and retry attempts are detected before inventory writes', () => {
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

test('cancelled sales are excluded from completed sales totals and summaries', () => {
  const completedSales = sales.filter(shouldIncludeOwnerSaleInSummary);
  const cancelledSales = sales.filter((sale) => sale.status === 'cancelled');
  assert.equal(cancelledSales.length, 1);
  assert.equal(completedSales.length + cancelledSales.length, sales.length);
  assert.deepEqual(
    sales
      .filter((sale) => sale.status === 'completed')
      .reduce((sum, sale) => sum + (sale.inventory_processing_status === 'completed' ? 1 : 0), 0),
    1,
  );
  assert.deepEqual(
    sales
      .filter((sale) => sale.status === 'completed')
      .map((sale) => sale.inventory_processing_status),
    ['completed', 'pending', 'failed'],
  );
});

test('completed sales totals include pending and failed inventory processing without being counted as successful inventory completion', () => {
  const completedSales = sales.filter(shouldIncludeOwnerSaleInSummary);
  const totalSalesValue = completedSales.reduce((sum, sale) => sum + (sale.status === 'completed' ? 1 : 0), 0);
  assert.equal(totalSalesValue, 3);
  const successfulInventoryCount = completedSales.filter((sale) => sale.inventory_processing_status === 'completed').length;
  const pendingInventoryCount = completedSales.filter((sale) => sale.inventory_processing_status === 'pending').length;
  const failedInventoryCount = completedSales.filter((sale) => sale.inventory_processing_status === 'failed').length;
  assert.equal(successfulInventoryCount, 1);
  assert.equal(pendingInventoryCount, 1);
  assert.equal(failedInventoryCount, 1);
});
