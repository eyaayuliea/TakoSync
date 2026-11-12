import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStaffDailySalesSummary,
  getStaffDailySalesLoadResult,
  getManilaBusinessDayRange,
  isFutureBusinessDate,
  STAFF_DAILY_SALES_LOAD_ERROR,
} from './staffDailySales.ts';

const sales = [
  { id: 'sale-1', branch_id: 'branch-a', total_amount: 31, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed' },
  { id: 'sale-2', branch_id: 'branch-a', total_amount: '18.50', payment_method: 'Card', status: 'completed', inventory_processing_status: 'failed' },
  { id: 'sale-3', branch_id: 'branch-a', total_amount: 99, payment_method: 'Cash', status: 'pending' },
  { id: 'sale-4', branch_id: 'branch-a', total_amount: 100, payment_method: 'Cash', status: 'cancelled' },
  { id: 'sale-5', branch_id: 'branch-b', total_amount: 250, payment_method: 'Cash', status: 'completed' },
];

const saleItems = [
  { id: 'line-1', sale_id: 'sale-1', product_id: 'product-a', quantity: 2, subtotal: 25 },
  { id: 'line-2', sale_id: 'sale-1', product_id: 'product-b', quantity: 1, subtotal: 6 },
  { id: 'line-3', sale_id: 'sale-2', product_id: 'product-a', quantity: '3', subtotal: '18.50' },
  { id: 'line-4', sale_id: 'sale-3', product_id: 'product-b', quantity: 9, subtotal: 99 },
  { id: 'line-5', sale_id: 'sale-5', product_id: 'product-b', quantity: 20, subtotal: 250 },
];

function summarize(overrides = {}) {
  return buildStaffDailySalesSummary({
    branchId: 'branch-a',
    sales,
    saleItems,
    productNames: [
      { id: 'product-a', product_name: 'Octobits Cheese' },
      { id: 'product-b', product_name: 'Classic Takoyaki' },
    ],
    ...overrides,
  });
}

test('daily total and transaction count use confirmed sales only', () => {
  const summary = summarize();
  assert.equal(summary.totalSales, 49.5);
  assert.equal(summary.transactionCount, 2);
});

test('inventory-processing failures do not remove a recorded sale from sales totals', () => {
  const summary = summarize();
  assert.equal(summary.transactionCount, 2);
  assert.equal(summary.paymentMethods.find((item) => item.paymentMethod === 'Card')?.totalSales, 18.5);
});

test('payment methods report transaction counts and amounts that sum to the daily total', () => {
  const summary = summarize();
  assert.deepEqual(summary.paymentMethods, [
    { paymentMethod: 'Card', transactionCount: 1, totalSales: 18.5 },
    { paymentMethod: 'Cash', transactionCount: 1, totalSales: 31 },
  ]);
  assert.equal(summary.paymentMethods.reduce((sum, item) => sum + item.totalSales, 0), summary.totalSales);
});

test('products aggregate quantities and sales amounts and sort by highest quantity', () => {
  const summary = summarize();
  assert.deepEqual(summary.products, [
    { productId: 'product-a', productName: 'Octobits Cheese', quantity: 5, totalSales: 43.5 },
    { productId: 'product-b', productName: 'Classic Takoyaki', quantity: 1, totalSales: 6 },
  ]);
});

test('branch filtering and duplicate sale/item records cannot inflate the summary', () => {
  const summary = summarize({
    sales: [...sales, sales[0]],
    saleItems: [...saleItems, saleItems[0]],
  });
  assert.equal(summary.transactionCount, 2);
  assert.equal(summary.totalSales, 49.5);
  assert.equal(summary.products[0].quantity, 5);
});

test('empty business days report zero totals and no breakdown rows', () => {
  const summary = buildStaffDailySalesSummary({
    branchId: 'branch-a',
    sales: [],
    saleItems: [],
    productNames: [],
  });
  assert.deepEqual(summary, {
    transactionCount: 0,
    totalSales: 0,
    paymentMethods: [],
    products: [],
  });
});

test('daily sales query failures return the required retryable error instead of empty totals', async () => {
  const result = await getStaffDailySalesLoadResult(async () => {
    throw new Error('Supabase query failed');
  });
  assert.deepEqual(result, {
    summary: null,
    error: 'Unable to load data. Please check your internet connection and try again.',
  });
  assert.equal(STAFF_DAILY_SALES_LOAD_ERROR, result.error);
});

test('Manila business-day bounds use inclusive midnight and exclusive next midnight', () => {
  assert.deepEqual(getManilaBusinessDayRange(new Date(2026, 10, 12)), {
    businessDate: '2026-11-12',
    start: '2026-11-12T00:00:00+08:00',
    end: '2026-11-13T00:00:00+08:00',
  });
  assert.equal(
    getManilaBusinessDayRange(new Date(2026, 11, 31)).end,
    '2027-01-01T00:00:00+08:00',
  );
});

test('future business dates are unavailable while today and past dates remain selectable', () => {
  const today = new Date(2026, 10, 12);
  assert.equal(isFutureBusinessDate(new Date(2026, 10, 12), today), false);
  assert.equal(isFutureBusinessDate(new Date(2026, 10, 11), today), false);
  assert.equal(isFutureBusinessDate(new Date(2026, 10, 13), today), true);
});
