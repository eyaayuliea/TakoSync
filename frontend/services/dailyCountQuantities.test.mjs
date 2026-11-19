import assert from 'node:assert/strict';
import test from 'node:test';
import {
  batterBottlesToMl,
  batterMlToBottles,
  dailyQuantityErrorText,
  getDailyCountBasis,
  isValidDailyQuantity,
  roundDailyQuantity,
} from './dailyCountQuantities.ts';

test('batter is counted in the stored unit (bottles), not the displayed millilitres', () => {
  // Staff inventory shows batter as bottles * 680 ml; the database compares bottles.
  const displayed = { id: 'prepared-batter', unit: 'ml', quantity: 24 * 680, quantityPrecision: 0 };
  const basis = getDailyCountBasis(displayed);
  assert.deepEqual(basis, { unit: 'bottle', recordedQuantity: 24, precision: 0 });
});

test('the batter conversion round-trips and keeps the stored precision', () => {
  assert.equal(batterMlToBottles(batterBottlesToMl(22.7)), 22.7);
  assert.equal(batterMlToBottles(15463.8), 22.741);
  assert.equal(batterMlToBottles(680), 1);
  assert.equal(batterMlToBottles(0), 0);
});

test('the reported -15,463.8 ml batter discrepancy is not produced for an exact count', () => {
  const basis = getDailyCountBasis({ id: 'prepared-batter', unit: 'ml', quantity: 23 * 680 });
  const physical = 23;
  assert.equal(roundDailyQuantity(physical - basis.recordedQuantity, basis.unit, basis.precision), 0);
});

test('batter physical counts must be whole bottles', () => {
  const basis = getDailyCountBasis({ id: 'prepared-batter', unit: 'ml', quantity: 680 });
  assert.equal(isValidDailyQuantity('3', basis.unit, basis.precision), true);
  assert.equal(isValidDailyQuantity('3.5', basis.unit, basis.precision), false);
  assert.equal(isValidDailyQuantity('2040', basis.unit, basis.precision), true);
  assert.equal(dailyQuantityErrorText('3.5', basis.unit, basis.precision), 'Enter a whole number of bottles.');
});

test('other ingredients keep their own unit and ingredient precision', () => {
  assert.deepEqual(
    getDailyCountBasis({ id: 'octopus', unit: 'g', quantity: 1200, quantityPrecision: 0 }),
    { unit: 'g', recordedQuantity: 1200, precision: 0 },
  );
  assert.deepEqual(
    getDailyCountBasis({ id: 'bacon-bits', unit: 'g', quantity: 10.5, quantityPrecision: 3 }),
    { unit: 'g', recordedQuantity: 10.5, precision: 3 },
  );
  assert.equal(isValidDailyQuantity('10.123', 'g', 3), true);
  assert.equal(isValidDailyQuantity('10.1234', 'g', 3), false);
  assert.equal(isValidDailyQuantity('10.5', 'g', 0), false);
  assert.equal(isValidDailyQuantity('12', 'pcs'), true);
  assert.equal(isValidDailyQuantity('12.5', 'pcs'), false);
  assert.equal(isValidDailyQuantity('1.25', 'ml'), true);
  assert.equal(isValidDailyQuantity('', 'g', 2), false);
  assert.equal(dailyQuantityErrorText('', 'g', 2), 'Enter a quantity.');
  assert.equal(dailyQuantityErrorText('-1', 'g', 2), 'Quantity cannot be negative.');
  assert.equal(dailyQuantityErrorText('1.234', 'g', 2), 'Enter a valid quantity (up to 2 decimals).');
  assert.equal(roundDailyQuantity(0.1 + 0.2 - 0.3, 'g', 2), 0);
});
