import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStaffSaleReceipt, formatStaffSaleReceipt } from './saleReceipt.ts';

const receiptInput = {
  sale: {
    id: 'sale-1',
    transaction_reference: 'SALE-20261112-ABC123',
    branch_id: 'branch-1',
    total_amount: 31,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'pending',
    created_at: '2026-11-12T10:30:00.000Z',
  },
  branchId: 'branch-1',
  branchName: 'Manila · Branch 1',
  items: [{
    id: 'line-1',
    product_id: 'product-1',
    product_variant_id: 'variant-1',
    quantity: 2,
    unit_price: 12.5,
    subtotal: 25,
  }],
  addons: [{
    id: 'addon-line-1',
    addon_id: 'addon-1',
    quantity: 2,
    unit_price: 3,
    subtotal: 6,
  }],
  products: [{ id: 'product-1', product_name: 'Octobits Cheese' }],
  variants: [{ id: 'variant-1', size_label: '4 PCS' }],
  addonNames: [{ id: 'addon-1', addon_name: 'Extra sauce' }],
};

test('receipt is composed from persisted sale, product, variant, and add-on values', () => {
  const receipt = buildStaffSaleReceipt(receiptInput);
  assert.equal(receipt.transactionReference, 'SALE-20261112-ABC123');
  assert.equal(receipt.branchName, 'Manila · Branch 1');
  assert.equal(receipt.createdAt, receiptInput.sale.created_at);
  assert.equal(receipt.paymentMethod, 'Cash');
  assert.equal(receipt.totalAmount, 31);
  assert.equal(receipt.inventoryProcessingStatus, 'pending');
  assert.deepEqual(receipt.lines, [
    {
      id: 'line-1',
      name: 'Octobits Cheese',
      variantLabel: '4 PCS',
      quantity: 2,
      unitPrice: 12.5,
      subtotal: 25,
      kind: 'product',
    },
    {
      id: 'addon-line-1',
      name: 'Extra sauce',
      variantLabel: null,
      quantity: 2,
      unitPrice: 3,
      subtotal: 6,
      kind: 'addon',
    },
  ]);
});

test('receipts remain available when inventory processing is pending or failed', () => {
  for (const status of ['pending', 'failed']) {
    const receipt = buildStaffSaleReceipt({
      ...receiptInput,
      sale: { ...receiptInput.sale, inventory_processing_status: status },
    });
    assert.equal(receipt.transactionReference, receiptInput.sale.transaction_reference);
    assert.equal(receipt.inventoryProcessingStatus, status);
  }
});

test('receipt loading rejects a sale outside the assigned branch and never submits a sale', () => {
  assert.throws(
    () => buildStaffSaleReceipt({
      ...receiptInput,
      branchId: 'branch-2',
    }),
    /not available for your assigned branch/,
  );
  assert.equal(buildStaffSaleReceipt(receiptInput).id, receiptInput.sale.id);
});

test('receipt text includes the persisted payment, item prices, and inventory status', () => {
  const text = formatStaffSaleReceipt(buildStaffSaleReceipt({
    ...receiptInput,
    sale: { ...receiptInput.sale, inventory_processing_status: 'failed' },
  }));
  assert.match(text, /SALE-20261112-ABC123/);
  assert.match(text, /Octobits Cheese - 4 PCS x2 @ 12\.50 = 25\.00/);
  assert.match(text, /Extra sauce x2 @ 3\.00 = 6\.00/);
  assert.match(text, /Payment: Cash/);
  assert.match(text, /Total: 31\.00/);
  assert.match(text, /Inventory processing: failed/);
});
