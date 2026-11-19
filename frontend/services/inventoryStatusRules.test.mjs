import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NEAR_EXPIRATION_DEFAULT_DAYS,
  calendarDaysUntil,
  classifyExpirationLevel,
  classifyInventoryStatus,
  classifyStockLevel,
  manilaCalendarDate,
  resolveNearExpirationDays,
} from './inventoryStatusRules.ts';
import { classifyExpirationAlert, classifyStockAlert } from '../staff/inventoryAlerts.ts';
import { inventoryExpirationStatus, inventoryStockStatus } from '../staff/inventoryReports.ts';
import { classifyOwnerExpirationAlert, classifyOwnerStockAlert } from '../owner/ownerAlerts.ts';
import { getInventoryStockStatus } from '../owner/ownerInventoryStatus.ts';
import { summarizeOwnerInventoryStatus } from '../owner/ownerDashboardSummary.ts';

const TODAY = '2026-11-20';
const MIN = 5;

test('the default near-expiration window is 3 days', () => {
  assert.equal(NEAR_EXPIRATION_DEFAULT_DAYS, 3);
  assert.equal(resolveNearExpirationDays(undefined), 3);
  assert.equal(resolveNearExpirationDays(null), 3);
  assert.equal(resolveNearExpirationDays(Number.NaN), 3);
  assert.equal(resolveNearExpirationDays(7), 7);
});

test('stock level boundaries: 0, the minimum itself, and minimum + 1', () => {
  assert.equal(classifyStockLevel(0, MIN), 'Out of Stock');
  assert.equal(classifyStockLevel(0.001, MIN), 'Low Stock');
  assert.equal(classifyStockLevel(MIN, MIN), 'Low Stock');
  assert.equal(classifyStockLevel(MIN + 1, MIN), 'In Stock');
  // No minimum configured: only a zero balance is flagged.
  assert.equal(classifyStockLevel(0, 0), 'Out of Stock');
  assert.equal(classifyStockLevel(1, 0), 'In Stock');
});

test('expiration boundaries: in 3 days, in 4 days, today, and yesterday', () => {
  const days = (date) => calendarDaysUntil(date, TODAY);
  assert.equal(days('2026-11-23'), 3);
  assert.equal(days('2026-11-24'), 4);
  assert.equal(days('2026-11-20'), 0);
  assert.equal(days('2026-11-19'), -1);
  assert.equal(classifyExpirationLevel(days('2026-11-23')), 'Near Expiration');
  assert.equal(classifyExpirationLevel(days('2026-11-24')), null);
  assert.equal(classifyExpirationLevel(days('2026-11-20')), 'Near Expiration');
  assert.equal(classifyExpirationLevel(days('2026-11-19')), 'Expired');
});

test('calendar-day arithmetic is exact across month and year ends and ignores timestamps', () => {
  assert.equal(calendarDaysUntil('2027-01-01', '2026-12-31'), 1);
  assert.equal(calendarDaysUntil('2026-12-01T16:00:00.000Z', '2026-11-30'), 1);
  assert.equal(calendarDaysUntil('2026-11-30', '2026-11-30'), 0);
  assert.throws(() => calendarDaysUntil('not-a-date', TODAY), RangeError);
});

test('Manila calendar date rolls over at 00:00 Asia/Manila', () => {
  assert.equal(manilaCalendarDate(new Date('2026-11-19T15:59:59Z')), '2026-11-19');
  assert.equal(manilaCalendarDate(new Date('2026-11-19T16:00:00Z')), '2026-11-20');
});

test('item status combines stock and expiration with Out of Stock first', () => {
  const status = (quantity, expirationDate) => classifyInventoryStatus({ quantity, minimumStock: MIN, expirationDate, today: TODAY });
  assert.equal(status(0, '2026-11-19'), 'Out of Stock');
  assert.equal(status(MIN + 1, '2026-11-19'), 'Expired');
  assert.equal(status(MIN + 1, '2026-11-20'), 'Near Expiration');
  assert.equal(status(MIN + 1, '2026-11-23'), 'Near Expiration');
  assert.equal(status(MIN + 1, '2026-11-24'), 'Normal');
  assert.equal(status(MIN, '2026-11-24'), 'Low Stock');
  assert.equal(status(MIN + 1, null), 'Normal');
});

test('Staff and Owner Mobile helpers agree with the shared rules on every boundary', () => {
  const stockCases = [[0, 'Out of Stock'], [0.5, 'Low Stock'], [MIN, 'Low Stock'], [MIN + 1, 'In Stock']];
  for (const [quantity, level] of stockCases) {
    const staff = { 'Out of Stock': 'outOfStock', 'Low Stock': 'lowStock', 'In Stock': null }[level];
    const owner = level === 'In Stock' ? null : level;
    const report = level === 'In Stock' ? 'Normal' : level;
    assert.equal(classifyStockAlert(quantity, MIN), staff, `staff alert ${quantity}`);
    assert.equal(classifyOwnerStockAlert(quantity, MIN), owner, `owner alert ${quantity}`);
    assert.equal(inventoryStockStatus(quantity, MIN), report, `staff report ${quantity}`);
    assert.equal(getInventoryStockStatus(quantity, MIN), report, `owner row ${quantity}`);
    const summary = summarizeOwnerInventoryStatus([{ quantity, minimum_stock: MIN }]);
    assert.deepEqual(summary, {
      normal: level === 'In Stock' ? 1 : 0,
      lowStock: level === 'Low Stock' ? 1 : 0,
      outOfStock: level === 'Out of Stock' ? 1 : 0,
    }, `owner dashboard ${quantity}`);
  }

  const expirationCases = [
    ['2026-11-23', 3, 'Near Expiration'],
    ['2026-11-24', 4, null],
    ['2026-11-20', 0, 'Near Expiration'],
    ['2026-11-19', -1, 'Expired'],
  ];
  const businessDate = new Date(2026, 10, 20);
  for (const [date, days, level] of expirationCases) {
    const staff = { 'Near Expiration': 'nearExpiration', Expired: 'expired' }[level] ?? null;
    const report = { 'Near Expiration': 'Near Expiry', Expired: 'Expired' }[level] ?? null;
    assert.equal(classifyExpirationAlert(days, 3), staff, `staff alert ${date}`);
    assert.equal(classifyOwnerExpirationAlert(days, 3), level, `owner alert ${date}`);
    assert.equal(inventoryExpirationStatus(date, 3, businessDate), report, `staff report ${date}`);
    assert.equal(inventoryExpirationStatus(date, 3, TODAY), report, `staff report (key) ${date}`);
    assert.equal(
      getInventoryStockStatus(MIN + 1, MIN, date, TODAY, 3),
      level ?? 'Normal',
      `owner row ${date}`,
    );
  }
});

test('an owner-configured alert period overrides the default', () => {
  assert.equal(classifyExpirationLevel(5, 7), 'Near Expiration');
  assert.equal(classifyExpirationLevel(5, 3), null);
  assert.equal(inventoryExpirationStatus('2026-11-25', 7, TODAY), 'Near Expiry');
});
