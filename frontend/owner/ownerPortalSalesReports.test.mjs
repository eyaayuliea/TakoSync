import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSaleDetailRows,
  buildWebBranchSalesReport,
  buildWebProductsSoldReport,
  buildWebTransactionSummaryReport,
  TRANSACTION_SUMMARY_HEADERS,
} from './ownerPortalSalesReports.ts';

const sale = (id, overrides = {}) => ({
  id, transaction_reference: `SALE-${id}`, branch_id: 'b1', total_amount: 100, payment_method: 'Cash', status: 'completed',
  inventory_processing_status: 'completed', created_at: `2026-11-23T0${id}:00:00Z`, recorded_by_name: 'Ana Reyes',
  cash_received: 500, change_amount: 400, ...overrides,
});
const branches = [{ id: 'b1', name: 'Manila · Branch 1' }, { id: 'b2', name: 'Branch 2' }, { id: 'b3', name: 'Branch 3' }];
const sales = [
  sale('1', { total_amount: 99.1 }),
  sale('2', { branch_id: 'b2', total_amount: 50.2, payment_method: 'QR', cash_received: null, change_amount: null }),
  sale('3', { status: 'voided', total_amount: 49 }),
];
const items = [
  { sale_id: '1', product_id: 'octo', product_name: 'Octobits Takoyaki', variant_label: '4 PCS', quantity: 5, subtotal: 89.1 },
  { sale_id: '2', product_id: 'octo', product_name: 'Octobits Takoyaki', variant_label: '8 PCS', quantity: 1, subtotal: 50.2 },
  { sale_id: '3', product_id: 'octo', product_name: 'Octobits Takoyaki', variant_label: '4 PCS', quantity: 9, subtotal: 49 },
];
const addons = [
  { sale_id: '1', addon_id: 'sauce', addon_name: 'Takoyaki sauce', quantity: 2, subtotal: 10 },
  { sale_id: '3', addon_id: 'sauce', addon_name: 'Takoyaki sauce', quantity: 7, subtotal: 35 },
];

test('OW-07 c2–c5: every branch is listed, voided sales are left out, and the grand total is the sum', () => {
  const report = buildWebBranchSalesReport(sales, branches);
  assert.deepEqual(report.rows, [
    ['Manila · Branch 1', '1', '₱99.10'],
    ['Branch 2', '1', '₱50.20'],
    ['Branch 3', '0', '₱0.00'],
    ['Grand total', '2', '₱149.30'],
  ]);
  assert.equal(report.total, 149.3);
});

test('OW-08 c2–c5: products by flavor and portion, highest quantity first, add-ons listed, voided excluded', () => {
  const report = buildWebProductsSoldReport(sales, items, addons);
  assert.deepEqual(report.productRows, [
    ['Octobits Takoyaki', '4 PCS', '5', '₱89.10'],
    ['Octobits Takoyaki', '8 PCS', '1', '₱50.20'],
  ]);
  assert.deepEqual(report.addonRows, [['Takoyaki sauce', '2', '₱10.00']]);
  assert.equal(report.quantity, 6);
  assert.equal(report.total, 149.3);
});

test('OW-09 c2–c7: completed and voided sales with payment, Bulk Order and status; voided not in the total', () => {
  const report = buildWebTransactionSummaryReport({
    sales: [...sales, sale('4', { status: 'completed', inventory_processing_status: 'failed' })],
    items,
    branchName: (id) => branches.find((branch) => branch.id === id)?.name ?? 'Branch',
    formatDateTime: (iso) => iso.slice(11, 16),
  });
  assert.equal(report.rows[0].length, TRANSACTION_SUMMARY_HEADERS.length);
  assert.deepEqual(report.rows.map((row) => row[0]), ['SALE-3', 'SALE-2', 'SALE-1']);
  assert.deepEqual(report.rows[0].slice(5), ['Bulk Order', 'Voided', '₱49.00\n(not counted)']);
  assert.deepEqual(report.rows[1].slice(4), ['QR', '—', 'Completed', '₱50.20']);
  assert.deepEqual(report.rows[2], ['SALE-1', 'Manila · Branch 1', '01:00', 'Ana Reyes', 'Cash\nCash ₱500.00 · Change ₱400.00', 'Bulk Order', 'Completed', '₱99.10']);
  assert.deepEqual([report.completed, report.voided, report.total], [2, 1, 149.3]);
  assert.deepEqual(report.saleIds, ['3', '2', '1']);
});

test('OW-03 c8: the details of a sale list each item with quantity, unit price at the time of sale and line amount', () => {
  const detail = buildSaleDetailRows('1', [{ ...items[0], unit_price: 17.82 }], addons);
  assert.deepEqual(detail.rows, [
    ['Octobits Takoyaki · 4 PCS', '5', '₱17.82', '₱89.10'],
    ['Add-on: Takoyaki sauce', '2', '₱5.00', '₱10.00'],
  ]);
  assert.equal(detail.total, 99.1);
  assert.deepEqual(buildSaleDetailRows('missing', items, addons).rows, []);
});
