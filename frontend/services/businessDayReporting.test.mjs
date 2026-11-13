import assert from 'node:assert/strict';
import test from 'node:test';
import { getManilaReportingRange, manilaDateKey, manilaHour } from './businessDaySettings.ts';

test('derives the Manila business date independently of device timezone', () => {
  assert.equal(manilaDateKey(new Date('2026-11-30T16:30:00.000Z')), '2026-12-01');
  assert.equal(manilaHour(new Date('2026-11-30T16:30:00.000Z')), 0);
});

test('builds Today at Manila midnight boundaries', () => {
  const range = getManilaReportingRange('Today', new Date('2026-11-30T16:30:00.000Z'));
  assert.ok(range);
  assert.equal(range.start.toISOString(), '2026-11-30T16:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-12-01T16:00:00.000Z');
});

test('builds Monday-based week and Manila calendar-month ranges', () => {
  const instant = new Date('2026-12-02T03:00:00.000Z');
  const week = getManilaReportingRange('This Week', instant);
  const month = getManilaReportingRange('This Month', instant);
  assert.ok(week);
  assert.ok(month);
  assert.equal(week.start.toISOString(), '2026-11-29T16:00:00.000Z');
  assert.equal(week.end.toISOString(), '2026-12-06T16:00:00.000Z');
  assert.equal(month.start.toISOString(), '2026-11-30T16:00:00.000Z');
  assert.equal(month.end.toISOString(), '2026-12-31T16:00:00.000Z');
});

test('builds inclusive custom ranges at Manila boundaries', () => {
  const range = getManilaReportingRange(
    'Custom',
    new Date('2026-12-01T00:00:00.000Z'),
    '2026-12-01',
    '2026-12-03',
  );
  assert.ok(range);
  assert.equal(range.start.toISOString(), '2026-11-30T16:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-12-03T16:00:00.000Z');
  assert.equal(getManilaReportingRange('Custom', new Date(), '2026-12-03', '2026-12-01'), null);
});
