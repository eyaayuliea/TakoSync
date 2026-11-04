import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculatePreparedBatterConsumption,
  findDuplicateSaleVariantIds,
  getOwnerSaleInventoryStatusLabel,
  isInventoryProcessingSuccessful,
  shouldIncludeOwnerSaleInSummary,
} from './ownerSalesStatus.ts';

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
