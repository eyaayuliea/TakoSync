import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStockInRequest,
  parseStockInReceipt,
  purchaseUnitOf,
  stockInBaseQuantity,
  stockInErrorMessage,
  stockInLineQuantityLabel,
  validateStockIn,
} from './stockIn.ts';

const octopus = { id: 'octopus', name: 'Octopus', category: 'Seafood', unit: 'kg', expirationTracking: true, packageQuantity: null, packageUnit: null, packageLabel: null };
const sauce = { id: 'sauces', name: 'Takoyaki sauce', category: 'Condiments', unit: 'L', expirationTracking: true, packageQuantity: 360, packageUnit: 'ml', packageLabel: 'One bottle' };
const packaging = { id: 'packaging', name: 'Packaging', category: 'Supplies', unit: 'pack', expirationTracking: false, packageQuantity: 100, packageUnit: 'pcs', packageLabel: 'One pack' };
const flour = { id: 'flour', name: 'All-purpose flour', category: 'Dry Goods', unit: 'kg', expirationTracking: false, packageQuantity: null, packageUnit: null, packageLabel: null };
const items = [octopus, sauce, packaging, flour];
const today = '2026-11-22';
const header = { supplierReference: ' Seaside Market ', datePurchased: '2026-11-21', dateReceived: today };
const line = (overrides) => ({ key: 'k', ingredientId: 'flour', quantity: '5', unit: 'base', expirationDate: '', ...overrides });

test('ST-09 c4: a purchase unit exists only when the package size converts to the base unit', () => {
  assert.deepEqual(purchaseUnitOf(sauce), { label: 'Pack (360 ml)', basePerPack: 0.36 });
  assert.equal(purchaseUnitOf(octopus), null);
  assert.equal(purchaseUnitOf(packaging), null, 'pcs cannot be converted to pack');
  assert.equal(stockInBaseQuantity(line({ ingredientId: 'sauces', quantity: '3', unit: 'pack' }), sauce), 1.08);
  assert.equal(stockInBaseQuantity(line({ quantity: '2.5' }), flour), 2.5);
  assert.equal(stockInBaseQuantity(line({ quantity: '0' }), flour), null);
  assert.equal(stockInBaseQuantity(line({ quantity: 'abc' }), flour), null);
});

test('ST-09 c2–c3: specific messages for each missing or invalid value', () => {
  const result = validateStockIn(
    { supplierReference: '', datePurchased: '', dateReceived: today },
    [line({ ingredientId: '', quantity: '' }), line({ ingredientId: 'octopus', quantity: '0' }),
      line({ ingredientId: 'octopus', quantity: '1', expirationDate: '2026-11-20' }), line({ ingredientId: 'flour', unit: 'pack' })],
    items, today,
  );
  assert.equal(result.valid, false);
  assert.equal(result.header.datePurchased, 'Select the date purchased.');
  assert.deepEqual(result.lines[0], { ingredient: 'Select the ingredient being received.', quantity: 'Enter the quantity received.' });
  assert.equal(result.lines[1].quantity, 'Quantity must be a number greater than 0.');
  assert.equal(result.lines[1].expirationDate, 'Select the expiration date. Octopus is tracked for expiry.');
  assert.equal(result.lines[2].ingredient, 'Octopus is listed more than once. Combine it into one line.');
  assert.equal(result.lines[2].expirationDate, 'Expiration date cannot be earlier than the date received.');
  assert.equal(result.lines[3].unit, 'All-purpose flour has no purchase-unit conversion. Enter the quantity in kg.');
  assert.match(result.summary, /^Fix \d+ problems before saving\./);
});

test('header dates: received not in the future, purchased not after received; at least one line', () => {
  assert.equal(validateStockIn({ ...header, dateReceived: '2026-11-23' }, [line()], items, today).header.dateReceived,
    'The date received cannot be in the future.');
  assert.equal(validateStockIn({ ...header, datePurchased: '2026-11-23', dateReceived: today }, [line()], items, today).header.datePurchased,
    'The date purchased cannot be later than the date received.');
  assert.equal(validateStockIn(header, [], items, today).summary, 'Add at least one item to the Stock-In.');
  assert.equal(validateStockIn(header, [line()], items, today).valid, true);
});

test('the request carries the header and one entry per line', () => {
  assert.deepEqual(
    buildStockInRequest(header, [line({ ingredientId: 'sauces', quantity: '3', unit: 'pack', expirationDate: '2026-12-22' }), line({ quantity: '1,000' })]),
    {
      header: { supplier_reference: 'Seaside Market', date_purchased: '2026-11-21', date_received: today },
      lines: [
        { ingredient_id: 'sauces', quantity: 3, unit: 'pack', expiration_date: '2026-12-22' },
        { ingredient_id: 'flour', quantity: 1000, unit: 'base', expiration_date: null },
      ],
    },
  );
  assert.equal(buildStockInRequest({ ...header, supplierReference: '  ' }, []).header.supplier_reference, null);
});

test('the saved receipt is read back with converted quantities', () => {
  const receipt = parseStockInReceipt({
    receipt: { id: 'r1', reference: 'STOCKIN-20261122-0001', branch_id: 'b1', supplier_reference: null, date_purchased: '2026-11-21', date_received: today, recorded_at: 't' },
    lines: [{ line_index: 1, ingredient_id: 'sauces', ingredient_name: 'Takoyaki sauce', entered_quantity: 3, entered_unit: 'pack',
      base_quantity: 1.08, base_unit: 'L', expiration_date: '2026-12-22', movement_reference: 'TX-1', before_quantity: 10, after_quantity: 11.08 }],
  });
  assert.equal(receipt.reference, 'STOCKIN-20261122-0001');
  assert.equal(stockInLineQuantityLabel(receipt.lines[0]), '3 pack = 1.08 L');
  assert.equal(stockInLineQuantityLabel({ enteredQuantity: 5, enteredUnit: 'kg', baseQuantity: 5, baseUnit: 'kg' }), '5 kg');
  assert.equal(parseStockInReceipt({ receipt: {} }), null);
});

test('server messages written for staff are shown as they are', () => {
  assert.equal(stockInErrorMessage({ code: '22023', message: 'Octopus: select the expiration date. It is tracked for expiry.' }),
    'Octopus: select the expiration date. It is tracked for expiry.');
  assert.match(stockInErrorMessage({ message: 'TypeError: Failed to fetch' }), /^No connection\./);
  assert.match(stockInErrorMessage({ code: 'PGRST202', message: 'Could not find the function public.record_stock_in' }), /not available yet/);
  assert.equal(stockInErrorMessage({ message: 'odd' }), 'Unable to save the Stock-In. Please try again.');
});
