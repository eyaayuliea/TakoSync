import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStaffSaleReceipt,
  formatStaffSaleReceipt,
  formatStaffSaleReceiptHtml,
  saleReceiptFileName,
} from './saleReceipt.ts';

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

test('the receipt shows the Bulk Order flag from the saved sale', () => {
  assert.equal(buildStaffSaleReceipt(receiptInput).isBulkOrder, false, '2 items');
  const bulkInput = { ...receiptInput, items: [{ ...receiptInput.items[0], quantity: 5, subtotal: 62.5 }] };
  const bulk = buildStaffSaleReceipt(bulkInput);
  assert.equal(bulk.isBulkOrder, true, '5 items');
  assert.match(formatStaffSaleReceipt(bulk), /^Bulk Order$/m);
  assert.doesNotMatch(formatStaffSaleReceipt(buildStaffSaleReceipt(receiptInput)), /Bulk Order/);
  assert.equal(
    buildStaffSaleReceipt({ ...bulkInput, sale: { ...bulkInput.sale, is_bulk_order: false } }).isBulkOrder,
    false,
    'a saved flag wins over the derived one',
  );
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

test('a voided sale receipt is marked VOID (ST-05 c9, ST-07 c7)', () => {
  const completed = buildStaffSaleReceipt(receiptInput);
  assert.equal(completed.isVoided, false);
  assert.doesNotMatch(formatStaffSaleReceipt(completed), /VOID/);

  const voided = buildStaffSaleReceipt({ ...receiptInput, sale: { ...receiptInput.sale, status: 'voided' } });
  assert.equal(voided.isVoided, true);
  const text = formatStaffSaleReceipt(voided);
  assert.match(text.split('\n')[0], /\*\*\* VOID \*\*\*/);
  assert.match(text, /not counted in sales totals/);
});

test('the receipt shows the employee and, for cash, the cash received and change (ST-05 c2, c5)', () => {
  const receipt = buildStaffSaleReceipt({
    ...receiptInput,
    sale: { ...receiptInput.sale, cash_received: '50.00', change_amount: '19.00', served_by_name: 'Ana Reyes' },
  });
  assert.equal(receipt.servedBy, 'Ana Reyes');
  assert.equal(receipt.cashReceived, 50);
  assert.equal(receipt.change, 19);
  const text = formatStaffSaleReceipt(receipt);
  assert.match(text, /Served by: Ana Reyes/);
  assert.match(text, /Cash received: 50\.00/);
  assert.match(text, /Change: 19\.00/);
});

test('older sales without saved details fall back to the looked-up name and omit cash lines', () => {
  const receipt = buildStaffSaleReceipt({ ...receiptInput, servedByName: 'Ben Cruz' });
  assert.equal(receipt.servedBy, 'Ben Cruz');
  assert.equal(receipt.cashReceived, null);
  assert.doesNotMatch(formatStaffSaleReceipt(receipt), /Cash received/);
  assert.equal(buildStaffSaleReceipt(receiptInput).servedBy, null);
});

test('the printable receipt matches the saved sale (ST-05 c3, c4, c5, c7)', () => {
  const html = formatStaffSaleReceiptHtml(buildStaffSaleReceipt({
    ...receiptInput,
    sale: { ...receiptInput.sale, cash_received: 50, change_amount: 19, served_by_name: 'Ana Reyes' },
  }));
  assert.match(html, /SALE-20261112-ABC123/);
  assert.match(html, /Date Purchased/);
  assert.match(html, /Served by/);
  assert.match(html, /Octobits Cheese &middot; 4 PCS/);
  assert.match(html, /2 &times; &#8369;12\.50/);
  assert.match(html, /&#8369;25\.00/);
  assert.match(html, /Total<\/td><td class="amount">&#8369;31\.00/);
  assert.match(html, /Cash received<\/td><td class="amount">&#8369;50\.00/);
  assert.match(html, /Change<\/td><td class="amount">&#8369;19\.00/);
  assert.match(html, /not an official receipt/);
  assert.doesNotMatch(html, /class="void"/);
});

test('the printable receipt of a voided sale is marked VOID (ST-05 c9)', () => {
  const html = formatStaffSaleReceiptHtml(buildStaffSaleReceipt({
    ...receiptInput,
    sale: { ...receiptInput.sale, status: 'voided' },
  }));
  assert.match(html, /<div class="void">VOID<\/div>/);
});

test('names are escaped in the printable receipt', () => {
  const html = formatStaffSaleReceiptHtml(buildStaffSaleReceipt({
    ...receiptInput,
    products: [{ id: 'product-1', product_name: '<b>Octo & Co</b>' }],
  }));
  assert.match(html, /&lt;b&gt;Octo &amp; Co&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Octo/);
});

test('the PDF file is named after the transaction reference', () => {
  assert.equal(saleReceiptFileName(buildStaffSaleReceipt(receiptInput)), 'SALE-20261112-ABC123-receipt.pdf');
});
