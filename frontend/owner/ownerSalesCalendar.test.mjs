import assert from 'node:assert/strict';
import test from 'node:test';
import {
  anchorForRange,
  isDateKey,
  isFutureMonth,
  ownerSalesMonthLabel,
  ownerSalesPeriodSelection,
  ownerSalesRangeLabel,
  ownerSalesWeekOption,
  recentOwnerSalesWeeks,
  weekKeyBounds,
} from './ownerSalesCalendar.ts';
import { getOwnerSalesMonitoringRange } from './ownerSalesPeriod.ts';

test('date keys are validated strictly', () => {
  assert.equal(isDateKey('2026-11-19'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('11/19/2026'), false);
  assert.equal(isDateKey(''), false);
});

test('Daily, Weekly and Monthly selections derive from the anchor date', () => {
  assert.deepEqual(ownerSalesPeriodSelection('Daily', '2026-11-19'), { fromText: '2026-11-19', toText: '2026-11-19' });
  assert.deepEqual(ownerSalesPeriodSelection('Weekly', '2026-11-19'), { fromText: '2026-11-16', toText: '2026-11-22' });
  assert.deepEqual(ownerSalesPeriodSelection('Weekly', '2026-11-22'), { fromText: '2026-11-16', toText: '2026-11-22' });
  assert.deepEqual(ownerSalesPeriodSelection('Weekly', '2026-11-16'), { fromText: '2026-11-16', toText: '2026-11-22' });
  assert.deepEqual(ownerSalesPeriodSelection('Monthly', '2027-02-10'), { fromText: '2027-02-01', toText: '2027-02-28' });
  assert.deepEqual(ownerSalesPeriodSelection('Monthly', '2028-02-10'), { fromText: '2028-02-01', toText: '2028-02-29' });
});

test('weeks run Monday to Sunday across month and year boundaries', () => {
  assert.deepEqual(weekKeyBounds('2026-12-31'), { start: '2026-12-28', end: '2027-01-03' });
  const crossYear = ownerSalesWeekOption('2026-12-31', '2026-12-31');
  assert.equal(crossYear.dropdownLabel, '28 Dec 2026–3 Jan 2027');
  assert.equal(crossYear.current, true);
  assert.equal(ownerSalesWeekOption('2026-11-12', '2026-11-19').dropdownLabel, '9–15 Nov 2026');
  assert.equal(ownerSalesWeekOption('2026-10-28', '2026-11-19').dropdownLabel, '26 Oct–1 Nov 2026');
  assert.equal(ownerSalesWeekOption('2026-10-28', '2026-11-19').current, false);
});

test('recent weeks start from the real current week and never include future weeks', () => {
  const weeks = recentOwnerSalesWeeks('2026-11-19', 4);
  assert.deepEqual(weeks.map((week) => week.start), ['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26']);
  assert.deepEqual(weeks.map((week) => week.current), [true, false, false, false]);
  const later = recentOwnerSalesWeeks('2027-03-03', 2);
  assert.equal(later[0].start, '2027-03-01');
  assert.ok(later.every((week) => week.start <= '2027-03-03'));
});

test('month helpers follow the real date and block future months', () => {
  assert.equal(ownerSalesMonthLabel('2027-01-15'), 'January 2027');
  assert.equal(isFutureMonth(2026, 11, '2026-11-19'), true);
  assert.equal(isFutureMonth(2026, 10, '2026-11-19'), false);
  assert.equal(isFutureMonth(2027, 0, '2026-11-19'), true);
});

test('switching period keeps the chosen day when it is inside the new range', () => {
  const week = weekKeyBounds('2026-11-12');
  assert.equal(anchorForRange('2026-11-12', week, '2026-11-19'), '2026-11-12');
  assert.equal(anchorForRange('2026-11-05', week, '2026-11-19'), '2026-11-09');
  const currentWeek = weekKeyBounds('2026-11-19');
  assert.equal(anchorForRange('2026-11-05', currentWeek, '2026-11-19'), '2026-11-19');
  assert.equal(anchorForRange('2026-11-05', { start: '2026-11-23', end: '2026-11-29' }, '2026-11-19'), '2026-11-19');
});

test('custom range labels', () => {
  assert.equal(ownerSalesRangeLabel('2026-11-01', '2026-11-03'), '1 Nov 2026 – 3 Nov 2026');
  assert.equal(ownerSalesRangeLabel('2026-11-19', '2026-11-19'), 'Thu, 19 Nov 2026');
  assert.equal(ownerSalesRangeLabel('', ''), 'Custom range');
});

test('monitoring ranges follow the selected date, not "now"', () => {
  const now = new Date('2026-11-19T04:00:00Z');
  const day = getOwnerSalesMonitoringRange('Daily', '2026-10-05', '2026-10-05', now);
  assert.equal(day?.startText, '2026-10-05');
  assert.equal(day?.endText, '2026-10-05');
  assert.equal(day?.start.toISOString(), '2026-10-04T16:00:00.000Z');
  const week = getOwnerSalesMonitoringRange('Weekly', '2026-10-07', '', now);
  assert.deepEqual([week?.startText, week?.endText], ['2026-10-05', '2026-10-11']);
  const month = getOwnerSalesMonitoringRange('Monthly', '2026-09-14', '', now);
  assert.deepEqual([month?.startText, month?.endText], ['2026-09-01', '2026-09-30']);
  assert.equal(month?.end.toISOString(), '2026-09-30T16:00:00.000Z');
});

test('monitoring ranges fall back to the current date and reject invalid text', () => {
  const now = new Date('2026-11-19T04:00:00Z');
  assert.equal(getOwnerSalesMonitoringRange('Daily', '', '', now)?.startText, '2026-11-19');
  assert.deepEqual(
    [getOwnerSalesMonitoringRange('Weekly', '', '', now)?.startText, getOwnerSalesMonitoringRange('Weekly', '', '', now)?.endText],
    ['2026-11-16', '2026-11-22'],
  );
  assert.equal(getOwnerSalesMonitoringRange('Monthly', 'not-a-date', '', now), null);
  assert.equal(getOwnerSalesMonitoringRange('Custom', '2026-11-05', '2026-11-01', now), null);
  assert.equal(getOwnerSalesMonitoringRange('Today', '', '', now)?.startText, '2026-11-19');
});

import { initialOwnerSalesView } from './ownerSalesCalendar.ts';

test('the opening view is anchored on today for every dashboard period', () => {
  assert.deepEqual(initialOwnerSalesView('Today', '2026-11-19'), { period: 'Daily', anchor: '2026-11-19', fromText: '2026-11-19', toText: '2026-11-19' });
  assert.deepEqual(initialOwnerSalesView('Weekly', '2026-11-19'), { period: 'Weekly', anchor: '2026-11-19', fromText: '2026-11-16', toText: '2026-11-22' });
  assert.deepEqual(initialOwnerSalesView('Monthly', '2026-11-19'), { period: 'Monthly', anchor: '2026-11-19', fromText: '2026-11-01', toText: '2026-11-30' });
  assert.deepEqual(initialOwnerSalesView('Monthly', '2027-01-02'), { period: 'Monthly', anchor: '2027-01-02', fromText: '2027-01-01', toText: '2027-01-31' });
});

test('a valid custom range from the dashboard is kept, an invalid one falls back to today', () => {
  assert.deepEqual(initialOwnerSalesView('Custom', '2026-11-19', '2026-11-01', '2026-11-10'), {
    period: 'Custom', anchor: '2026-11-10', fromText: '2026-11-01', toText: '2026-11-10',
  });
  assert.equal(initialOwnerSalesView('Custom', '2026-11-19', '2026-11-10', '2026-11-01').period, 'Daily');
  assert.equal(initialOwnerSalesView('Custom', '2026-11-19').fromText, '2026-11-19');
});

import { readFileSync } from 'node:fs';

test('the Sales Summary screen has no hardcoded sample dates, weeks or months', () => {
  const source = readFileSync(new URL('./OwnerSalesWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /DAILY_SALES_SAMPLE_DATE/);
  assert.doesNotMatch(source, /2026-1[0-2]-\d\d/);
  assert.doesNotMatch(source, /Nov 2026|Oct 2026/);
  assert.doesNotMatch(source, /year: 2026|=== 2026|>= 2026/);
});
