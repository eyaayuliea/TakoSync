import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidWasteQuantityText, validateWasteForm } from './wasteValidation.ts';

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
  assert.equal(empty.errors.quantity, 'Octopus has no stock to waste.');
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
