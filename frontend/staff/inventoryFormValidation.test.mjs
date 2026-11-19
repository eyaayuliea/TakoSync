import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidWasteQuantityText,
  validateStockInForm,
  validateStockOutForm,
  validateWasteForm,
} from './inventoryFormValidation.ts';

const reasons = ['Waste', 'Spillage', 'Spoilage', 'Other'];
const octopus = { name: 'Octopus', quantity: 500, unit: 'g', quantityPrecision: 0 };
const sauce = { name: 'Takoyaki sauce', quantity: 2.5, unit: 'ml', quantityPrecision: 2 };
const base = { ingredient: octopus, quantityValue: '100', date: new Date('2026-11-19T00:00:00+08:00'), reason: 'Spillage', allowedReasons: reasons, checkAvailableStock: true };

test('a complete, in-stock waste entry is valid', () => {
  assert.deepEqual(validateWasteForm(base), { errors: {}, summary: '' });
});

test('missing fields are named individually', () => {
  const result = validateWasteForm({ ...base, ingredient: null, quantityValue: '', reason: '' });
  assert.equal(result.errors.item, 'Select the ingredient that was wasted.');
  assert.equal(result.errors.quantity, 'Enter the quantity wasted.');
  assert.equal(result.errors.reason, 'Select a reason.');
  assert.equal(result.errors.date, undefined);
  assert.equal(result.summary, 'Complete the required fields: Ingredient, Quantity wasted, Reason.');
});

test('a single missing field is described in the singular', () => {
  const result = validateWasteForm({ ...base, date: null });
  assert.equal(result.summary, 'Complete the required field: Transaction date.');
});

test('quantity above stock is reported as exceeding stock, not as a missing field', () => {
  const result = validateWasteForm({ ...base, quantityValue: '600' });
  assert.equal(result.errors.quantity, 'Only 500 g of Octopus in stock. Enter 500 or less.');
  assert.equal(result.summary, result.errors.quantity);
  assert.doesNotMatch(result.summary, /required/);
});

test('stock is only compared when requested and an empty shelf has its own message', () => {
  assert.deepEqual(validateWasteForm({ ...base, quantityValue: '600', checkAvailableStock: false }).errors, {});
  const empty = validateWasteForm({ ...base, ingredient: { ...octopus, quantity: 0 }, quantityValue: '1' });
  assert.equal(empty.errors.quantity, 'Octopus has no stock available.');
});

test('precision problems say how many decimals the ingredient allows', () => {
  assert.equal(
    validateWasteForm({ ...base, quantityValue: '1.5' }).errors.quantity,
    'Octopus is counted in whole g. Remove the decimals.',
  );
  assert.equal(
    validateWasteForm({ ...base, ingredient: sauce, quantityValue: '1.234' }).errors.quantity,
    'Use at most 2 decimal places for Takoyaki sauce.',
  );
  assert.equal(validateWasteForm({ ...base, ingredient: sauce, quantityValue: '1.25' }).summary, '');
});

test('zero, negative and non-numeric quantities are rejected with a quantity message', () => {
  for (const value of ['0', '-3', 'abc']) {
    const result = validateWasteForm({ ...base, quantityValue: value });
    assert.equal(result.errors.quantity, 'Quantity must be a number greater than 0.', value);
  }
});

test('quantity text validation follows ingredient precision', () => {
  assert.equal(isValidWasteQuantityText('12', 0), true);
  assert.equal(isValidWasteQuantityText('12.5', 0), false);
  assert.equal(isValidWasteQuantityText('.5', 1), true);
  assert.equal(isValidWasteQuantityText('1.25', 1), false);
});

// ---- Stock-In ----------------------------------------------------------------------------

const day = (value) => new Date(`${value}T00:00:00+08:00`);
const stockIn = {
  ingredient: { ...octopus, expirationTracking: false },
  quantityValue: '250',
  transactionDate: day('2026-11-19'),
  expirationDate: null,
};

test('stock-in: a complete entry is valid and does not compare against stock', () => {
  assert.deepEqual(validateStockInForm({ ...stockIn, quantityValue: '99999' }), { errors: {}, summary: '' });
});

test('stock-in: missing fields are named, with their own messages', () => {
  const result = validateStockInForm({ ingredient: null, quantityValue: '', transactionDate: null, expirationDate: null });
  assert.equal(result.errors.ingredient, 'Select the ingredient being received.');
  assert.equal(result.errors.quantity, 'Enter the quantity received.');
  assert.equal(result.errors.transactionDate, 'Select the transaction date.');
  assert.equal(result.summary, 'Complete the required fields: Ingredient, Quantity, Transaction date.');
});

test('stock-in: quantity problems are not reported as missing fields', () => {
  const zero = validateStockInForm({ ...stockIn, quantityValue: '0' });
  assert.equal(zero.errors.quantity, 'Quantity must be a number greater than 0.');
  assert.equal(zero.summary, zero.errors.quantity);
  assert.equal(
    validateStockInForm({ ...stockIn, quantityValue: '2.5' }).errors.quantity,
    'Octopus is counted in whole g. Remove the decimals.',
  );
  assert.equal(
    validateStockInForm({ ...stockIn, ingredient: { ...sauce, expirationTracking: false }, quantityValue: '1.234' }).errors.quantity,
    'Use at most 2 decimal places for Takoyaki sauce.',
  );
});

test('stock-in: expiration tracking, invalid and earlier dates each have a message', () => {
  const tracked = { ...stockIn, ingredient: { ...octopus, expirationTracking: true } };
  const missing = validateStockInForm(tracked);
  assert.equal(missing.errors.expirationDate, 'Select the expiration date. Octopus is tracked for expiry.');
  assert.equal(missing.summary, 'Complete the required field: Expiration date.');

  const earlier = validateStockInForm({ ...tracked, expirationDate: day('2026-11-01') });
  assert.equal(earlier.errors.expirationDate, 'Expiration date cannot be earlier than the transaction date.');
  assert.doesNotMatch(earlier.summary, /required/);

  const invalid = validateStockInForm({ ...tracked, expirationDate: new Date('nope') });
  assert.equal(invalid.errors.expirationDate, 'Enter a valid expiration date.');

  assert.deepEqual(validateStockInForm({ ...tracked, expirationDate: day('2026-11-19') }).errors, {});
  assert.deepEqual(validateStockInForm({ ...stockIn, expirationDate: day('2026-12-01') }).errors, {});
});

// ---- Stock-Out ---------------------------------------------------------------------------

const stockOut = { ingredient: octopus, quantityValue: '100', transactionDate: day('2026-11-19'), reason: 'Kitchen usage' };

test('stock-out: a complete, in-stock entry is valid', () => {
  assert.deepEqual(validateStockOutForm(stockOut), { errors: {}, summary: '' });
});

test('stock-out: missing fields are named', () => {
  const result = validateStockOutForm({ ingredient: null, quantityValue: '', transactionDate: null, reason: '  ' });
  assert.equal(result.errors.ingredient, 'Select the ingredient that was used.');
  assert.equal(result.errors.quantity, 'Enter the quantity used.');
  assert.equal(result.errors.reason, 'Enter the reason for using this stock.');
  assert.equal(result.summary, 'Complete the required fields: Ingredient, Quantity used, Transaction date, Reason.');
});

test('stock-out: exceeding stock and precision are specific, not "required"', () => {
  const over = validateStockOutForm({ ...stockOut, quantityValue: '501' });
  assert.equal(over.errors.quantity, 'Only 500 g of Octopus in stock. Enter 500 or less.');
  assert.equal(over.summary, over.errors.quantity);
  assert.equal(
    validateStockOutForm({ ...stockOut, quantityValue: '1.5' }).errors.quantity,
    'Octopus is counted in whole g. Remove the decimals.',
  );
  assert.equal(
    validateStockOutForm({ ...stockOut, ingredient: { ...octopus, quantity: 0 }, quantityValue: '1' }).errors.quantity,
    'Octopus has no stock available.',
  );
});

test('stock-out: a cooking batch only needs the date and reason', () => {
  const batch = validateStockOutForm({
    ingredient: null, quantityValue: '', transactionDate: null, reason: '', validateIngredientAndQuantity: false,
  });
  assert.deepEqual(Object.keys(batch.errors).sort(), ['reason', 'transactionDate']);
  assert.equal(batch.summary, 'Complete the required fields: Transaction date, Reason.');
});
