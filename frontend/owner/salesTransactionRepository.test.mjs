import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSalesTransactions,
  completedTotal,
  getForcedSalesTransactionState,
} from './salesTransactionRepository.ts';

const bundle = {
  sales: [
    { id: 's2', transaction_reference: 'TXN-0002', branch_id: 'b2', staff_id: 'u2', total_amount: '297.50', payment_method: 'QR', status: 'completed', created_at: '2026-11-19T09:30:00Z' },
    { id: 's1', transaction_reference: 'TXN-0001', branch_id: 'b1', staff_id: 'u1', total_amount: '99.00', payment_method: 'Cash', status: 'completed', created_at: '2026-11-19T08:00:00Z' },
  ],
  branches: [
    { id: 'b1', city: 'Quezon City', code: 'BR-01' },
    { id: 'b2', city: 'Makati', code: 'BR-02' },
  ],
  profiles: [{ id: 'u1', full_name: 'Ana Reyes' }, { id: 'u2', full_name: null }],
  items: [
    { id: 'i1', sale_id: 's1', product_id: 'p1', product_variant_id: 'v1', quantity: '1.000', unit_price: '89.00', subtotal: '89.00' },
    { id: 'i2', sale_id: 's2', product_id: 'p1', product_variant_id: 'v2', quantity: '3.000', unit_price: '89.00', subtotal: '267.00' },
  ],
  products: [{ id: 'p1', product_name: 'Takoyaki' }],
  variants: [{ id: 'v1', size_label: '8 pcs' }, { id: 'v2', size_label: '8 pcs' }],
  addons: [
    { id: 'a1', sale_id: 's1', addon_id: 'x1', quantity: '1.000', unit_price: '10.00', subtotal: '10.00' },
    { id: 'a2', sale_id: 's2', addon_id: 'x2', quantity: '1.000', unit_price: '15.00', subtotal: '15.00' },
  ],
  addonNames: [{ id: 'x1', addon_name: 'Flakes' }, { id: 'x2', addon_name: 'Takoyaki sauce' }],
  hasMore: false,
};

test('saved sales across branches become records with their own items and add-ons', () => {
  const [second, first] = buildSalesTransactions(bundle);
  assert.equal(second.transactionReference, 'TXN-0002');
  assert.equal(second.branchName, 'Makati · Branch 2');
  assert.equal(first.branchName, 'Quezon City · Branch 1');
  assert.equal(first.recordedBy, 'Ana Reyes (employee account)');
  assert.equal(second.recordedBy, 'Employee account');
  assert.deepEqual(first.items, [
    { name: 'Takoyaki (8 pcs)', quantity: 1, unitPrice: 89, lineTotal: 89 },
    { name: 'Add-on: Flakes', quantity: 1, unitPrice: 10, lineTotal: 10 },
  ]);
  assert.equal(second.items.length, 2);
});

test('the saved total is used (it includes add-ons) and no fake cash details are invented', () => {
  const [second, first] = buildSalesTransactions(bundle);
  assert.equal(first.total, 99);
  assert.equal(second.total, 297.5);
  assert.equal(first.paymentMethod, 'Cash');
  assert.equal(first.amountTendered, null);
  assert.equal(first.change, null);
  assert.equal(first.status, 'Recorded');
});

test('no sales produce an empty list, not sample data', () => {
  assert.deepEqual(buildSalesTransactions({ ...bundle, sales: [], items: [], addons: [] }), []);
});

test('missing lookups degrade to labels instead of throwing or hiding the sale', () => {
  const [record] = buildSalesTransactions({
    ...bundle,
    sales: [bundle.sales[1]],
    branches: [],
    profiles: [],
    products: [],
    variants: [],
    addonNames: [],
  });
  assert.equal(record.branchName, 'Branch unavailable');
  assert.equal(record.items[0].name, 'Product unavailable');
  assert.equal(record.items[1].name, 'Add-on: Add-on unavailable');
  assert.equal(record.total, 99);
});

test('design-preview states can force loading, empty and error but never inject sample sales', () => {
  const original = process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE;
  try {
    for (const state of ['loading', 'empty', 'error']) {
      process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE = state;
      assert.equal(getForcedSalesTransactionState(), state);
    }
    for (const state of ['success', 'load_more', 'bogus']) {
      process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE = state;
      assert.equal(getForcedSalesTransactionState(), null);
    }
  } finally {
    if (original === undefined) delete process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE;
    else process.env.EXPO_PUBLIC_FORCE_SALES_TRANSACTION_STATE = original;
  }
});

test('a sale opened by id keeps its real status instead of always saying Recorded', () => {
  const [pending] = buildSalesTransactions({ ...bundle, sales: [{ ...bundle.sales[0], status: 'pending' }] });
  const [cancelled] = buildSalesTransactions({ ...bundle, sales: [{ ...bundle.sales[0], status: 'cancelled' }] });
  assert.equal(pending.status, 'Pending');
  assert.equal(cancelled.status, 'Cancelled');
});

test('OM-09 c3–c5: cash details, Bulk Order, and Voided status come from the saved sale', () => {
  const [cash] = buildSalesTransactions({
    ...bundle,
    sales: [{ ...bundle.sales[1], cash_received: '100.00', change_amount: '1.00', served_by_name: 'Ana Reyes' }],
  });
  assert.equal(cash.amountTendered, 100);
  assert.equal(cash.change, 1);
  assert.equal(cash.recordedBy, 'Ana Reyes (employee account)');

  const [voided] = buildSalesTransactions({ ...bundle, sales: [{ ...bundle.sales[0], status: 'voided' }] });
  assert.equal(voided.status, 'Voided');

  const bulkBundle = {
    ...bundle,
    sales: [bundle.sales[0]],
    items: [{ id: 'i-bulk', sale_id: bundle.sales[0].id, product_id: bundle.items[0].product_id, product_variant_id: null, quantity: 5, unit_price: 10, subtotal: 50 }],
  };
  assert.equal(buildSalesTransactions(bulkBundle)[0].isBulkOrder, true);
});

test('OM-09 c5: voided transactions are not added to the total', () => {
  const transactions = buildSalesTransactions({
    ...bundle,
    sales: [bundle.sales[0], { ...bundle.sales[1], status: 'voided' }],
  });
  assert.equal(completedTotal(transactions), 297.5);
});
