import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAmount, formatPeso } from './money.ts';

test('a price always shows two decimals', () => {
  assert.equal(formatPeso(45), '₱45.00');
  assert.equal(formatPeso(0), '₱0.00');
  assert.equal(formatPeso(49.5), '₱49.50');
  assert.equal(formatPeso(139.99), '₱139.99');
});

test('thousands are separated and cents are rounded', () => {
  assert.equal(formatPeso(4263), '₱4,263.00');
  assert.equal(formatPeso(1234567.891), '₱1,234,567.89');
  assert.equal(formatPeso(0.005), '₱0.01');
  assert.equal(formatPeso(999.999), '₱1,000.00');
});

test('negative and unusable amounts', () => {
  assert.equal(formatPeso(-45), '-₱45.00');
  assert.equal(formatPeso(-0.001), '₱0.00');
  assert.equal(formatPeso(Number.NaN), '₱0.00');
  assert.equal(formatAmount(1500), '1,500.00');
});
