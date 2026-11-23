import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALL_BRANCHES,
  branchFilterOptions,
  branchKey,
  filterOwnerRecords,
  filteredEmptyMessage,
  filterOwnerRecordsBySelection,
  ownerReportSelectionCaption,
  ownerReportSelectionDates,
  recordPeriodRange,
} from './ownerRecordFilters.ts';

const now = new Date('2026-11-25T06:00:00Z'); // 25 Nov, Manila

const records = [
  { id: 'a', branch: 'Manila · Branch 1', at: '2026-11-25T02:00:00Z' }, // 25 Nov
  { id: 'b', branch: 'Branch 2', at: '2026-11-24T15:30:00Z' }, // 24 Nov 11:30 PM Manila
  { id: 'c', branch: "Gelo's Takoyaki · Branch 3", at: '2026-10-31T03:00:00Z' }, // 31 Oct
  { id: 'd', branch: 'Branch 1', at: '2026-11-24T16:30:00Z' }, // 25 Nov 12:30 AM Manila
];

function run(branch, period) {
  return filterOwnerRecords(records, {
    branch, period, now, branchOf: (record) => record.branch, dateOf: (record) => record.at,
  }).map((record) => record.id);
}

test('branch labels reduce to their Branch N part', () => {
  assert.equal(branchKey('Manila · Branch 1'), 'Branch 1');
  assert.equal(branchKey("Gelo's Takoyaki · Branch 03"), 'Branch 3');
  assert.equal(branchKey('Branch unavailable'), 'Branch unavailable');
});

test('the branch selector offers All Branches, then each branch in order (OM-16 c3)', () => {
  assert.deepEqual(branchFilterOptions(['Branch 10', 'Cebu · Branch 2', 'Branch 1', 'Manila · Branch 1']), [
    ALL_BRANCHES, 'Branch 1', 'Branch 2', 'Branch 10',
  ]);
});

test('the branch selector narrows the list', () => {
  assert.deepEqual(run(ALL_BRANCHES, 'All dates'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(run('Branch 1', 'All dates'), ['a', 'd']);
  assert.deepEqual(run('Branch 3', 'All dates'), ['c']);
});

test('the date selector uses Manila business dates (OM-16 c4)', () => {
  assert.deepEqual(run(ALL_BRANCHES, 'Today'), ['a', 'd'], '12:30 AM Manila is today, 11:30 PM yesterday is not');
  assert.deepEqual(run(ALL_BRANCHES, 'Last 7 days'), ['a', 'b', 'd']);
  assert.deepEqual(run(ALL_BRANCHES, 'This month'), ['a', 'b', 'd']);
  assert.deepEqual(run(ALL_BRANCHES, 'Last month'), ['c']);
  assert.deepEqual(run('Branch 2', 'Today'), []);
});

test('period ranges', () => {
  assert.equal(recordPeriodRange('All dates', now), null);
  assert.deepEqual(recordPeriodRange('Last 7 days', now), { start: '2026-11-19', end: '2026-11-25' });
  assert.deepEqual(recordPeriodRange('Last month', new Date('2026-01-10T00:00:00Z')), { start: '2025-12-01', end: '2025-12-31' });
});

test('records without a usable date are left out of a dated period only', () => {
  const rows = [{ branch: 'Branch 1', at: null }, { branch: 'Branch 1', at: 'not a date' }];
  const options = { branch: ALL_BRANCHES, now, branchOf: (r) => r.branch, dateOf: (r) => r.at };
  assert.equal(filterOwnerRecords(rows, { ...options, period: 'All dates' }).length, 2);
  assert.equal(filterOwnerRecords(rows, { ...options, period: 'Today' }).length, 0);
});

test('the empty state names the selection (OM-16 c6)', () => {
  assert.equal(filteredEmptyMessage(ALL_BRANCHES, 'All dates'), 'No records yet.');
  assert.equal(filteredEmptyMessage('Branch 2', 'Today'), 'No records for Branch 2, today.');
  assert.equal(filteredEmptyMessage(ALL_BRANCHES, 'Last 7 days'), 'No records for last 7 days.');
});

test('OM-09/10/11 c1: a Sales page selection filters by its business dates and branch', () => {
  const selection = { startDate: '2026-11-25', endDate: '2026-11-25', branch: ALL_BRANCHES, periodLabel: 'Wed, 25 Nov 2026', branchLabel: 'All branches' };
  const ids = (sel) => filterOwnerRecordsBySelection(records, { selection: sel, branchOf: (r) => r.branch, dateOf: (r) => r.at }).map((r) => r.id);
  assert.deepEqual(ids(selection), ['a', 'd']);
  assert.deepEqual(ids({ ...selection, branch: 'Branch 1' }), ['a', 'd']);
  assert.deepEqual(ids({ ...selection, startDate: '2026-11-01', endDate: '2026-11-30', branch: 'Branch 2' }), ['b']);
  assert.deepEqual(ids({ ...selection, startDate: '2026-10-01', endDate: '2026-10-31' }), ['c']);
});

test('OM-03 c4: the caption names the period, the branch and the time the figures reflect', () => {
  const selection = { startDate: '2026-11-01', endDate: '2026-11-30', branch: 'Branch 1', periodLabel: 'November 2026', branchLabel: 'Manila · Branch 1' };
  assert.equal(ownerReportSelectionCaption(selection, now), 'November 2026 · Manila · Branch 1 · as of 2:00 PM');
  assert.equal(ownerReportSelectionCaption(selection, null), 'November 2026 · Manila · Branch 1');
  // Daily Closing lists each day of the selection, newest first, but never a future day.
  assert.deepEqual(ownerReportSelectionDates({ ...selection, startDate: '2026-11-22' }, now), ['2026-11-25', '2026-11-24', '2026-11-23', '2026-11-22']);
  assert.deepEqual(ownerReportSelectionDates({ ...selection, startDate: '2026-12-01', endDate: '2026-12-31' }, now), []);
});
