import assert from 'node:assert/strict';
import test from 'node:test';
import { differenceTone, expiryStatusColor, formatDate, formatDateTime, formatDifference, formatPeso, formatQuantity, formatTransactionId, formatEmployeeId, ownerStatusColors, stockStatusColor } from './ownerFormatters.ts';

test('formats Owner dates in Manila design format', () => {
  assert.equal(formatDateTime('2026-11-12T02:30:00Z'), '12 Nov 2026 · 10:30 AM');
  assert.equal(formatDateTime('2026-11-12T04:00:00Z'), '12 Nov 2026 · 12:00 PM');
  assert.equal(formatDateTime('2026-11-11T16:00:00Z'), '12 Nov 2026 · 12:00 AM');
  assert.equal(formatDateTime('2026-11-12T05:00:00Z'), '12 Nov 2026 · 1:00 PM');
  assert.equal(formatDate('2026-11-12T16:00:00Z'), '13 Nov 2026');
});

test('formats pesos and signed quantities', () => {
  assert.equal(formatPeso(4263), '₱4,263');
  assert.equal(formatPeso(14263.75), '₱14,263.75');
  assert.equal(formatQuantity(12, 'kg'), '12 kg');
  assert.equal(formatQuantity(5, 'kg', true), '+5 kg');
  assert.equal(formatQuantity(0, 'pcs'), '0 pcs');
  assert.equal(formatQuantity(0.3, 'kg'), '0.3 kg');
  assert.equal(formatQuantity(2.5, 'L'), '2.5 L');
  assert.equal(formatDifference(-2, 'kg'), '−2 kg');
  assert.equal(formatDifference(0, 'pcs'), '0 pcs');
});

test('formats Owner references and status tones', () => {
  assert.equal(formatTransactionId('1112', 47), 'TXN-1112-0047');
  assert.equal(formatEmployeeId(14), 'EMP-014');
  assert.equal(differenceTone(-1), 'negative');
  assert.equal(differenceTone(0), 'zero');
  assert.equal(differenceTone(1), 'positive');
  assert.equal(ownerStatusColors.difference.negative, '#F52F2E');
  assert.equal(ownerStatusColors.difference.zero, '#589144');
  assert.equal(ownerStatusColors.difference.positive, '#FCA639');
  assert.equal(stockStatusColor('Normal'), '#589144');
  assert.equal(stockStatusColor('Low Stock'), '#FDE672');
  assert.equal(stockStatusColor('Out of Stock'), '#F52F2E');
  assert.equal(expiryStatusColor('Near Expiration'), '#FCA639');
  assert.equal(expiryStatusColor('Expired'), '#F52F2E');
});
