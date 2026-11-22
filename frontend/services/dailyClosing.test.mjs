import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDailyClosingReportRows,
  dailyClosingErrorMessage,
  dailyClosingPeriodDates,
  isMissingDailyClosingSupport,
  mapDailyClosingRow,
  overShortLabel,
  parseCashAmount,
  summarizeDailyClosingRows,
  validateClosingCashCountInput,
  validateOpeningFloatInput,
  mapOpeningFloatRow,
} from './dailyClosing.ts';

function closing(overrides = {}) {
  return mapDailyClosingRow({
    id: 'c1', reference: 'CLOSE-20261125-0001', branch_id: 'b1', business_date: '2026-11-25',
    opening_float: '1000.00', closing_cash_count: '4250.00', recorded_cash_sales: '3300.00',
    voided_cash_sales: '50.00', expected_cash: '4250.00', over_short: '0.00', cash_transaction_count: 12,
    recorded_by: 'staff-1', recorded_at: '2026-11-25T13:00:00Z',
    ...overrides,
  }, new Map([['staff-1', 'Ana']]));
}

test('peso amounts accept commas and up to two decimals', () => {
  assert.equal(parseCashAmount('1,500'), 1500);
  assert.equal(parseCashAmount('₱ 4,250.75'), 4250.75);
  assert.equal(parseCashAmount('0'), 0);
  assert.equal(parseCashAmount('12.345'), null);
  assert.equal(parseCashAmount('-5'), null);
  assert.equal(parseCashAmount('abc'), null);
  assert.equal(parseCashAmount(''), null);
});

test('the opening float and the closing count are each required, in pesos (ST-06 c7, c8)', () => {
  assert.deepEqual(validateOpeningFloatInput(' '), { valid: false, error: 'Enter the opening float.' });
  assert.match(validateOpeningFloatInput('12.345').error, /in pesos/);
  assert.deepEqual(validateOpeningFloatInput('1,000'), { valid: true, amount: 1000 });
  assert.deepEqual(validateOpeningFloatInput('0'), { valid: true, amount: 0 });
  assert.deepEqual(validateClosingCashCountInput(''), { valid: false, error: 'Enter the closing cash count.' });
  assert.match(validateClosingCashCountInput('42.505').error, /in pesos/);
  assert.deepEqual(validateClosingCashCountInput('4250.50'), { valid: true, amount: 4250.5 });
});

test('opening float rows map to the screen model and its server messages are kept', () => {
  const mapped = mapOpeningFloatRow({
    id: 'f1', reference: 'FLOAT-20261122-0001', branch_id: 'b1', business_date: '2026-11-22', amount: '1000.00',
    recorded_by: 'staff-1', recorded_at: '2026-11-22T01:00:00Z',
  }, new Map([['staff-1', 'Ana']]));
  assert.equal(mapped.amount, 1000);
  assert.equal(mapped.recordedByName, 'Ana');
  assert.equal(
    dailyClosingErrorMessage({ message: 'Record the opening float for this business day before the closing.' }),
    'Record the opening float for this business day before the closing.',
  );
  assert.equal(
    dailyClosingErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "daily_opening_floats_branch_id_business_date_key"' }),
    'The opening float for this business day has already been recorded.',
  );
});

test('over and short are labelled with text; balanced shows zero (OW-11 c6, OM-11 c4)', () => {
  assert.deepEqual(overShortLabel(12.5), { kind: 'over', text: 'Over ₱12.50' });
  assert.deepEqual(overShortLabel(-5), { kind: 'short', text: 'Short ₱5.00' });
  assert.deepEqual(overShortLabel(0), { kind: 'balanced', text: 'Balanced (₱0.00)' });
  assert.equal(overShortLabel(0.004).kind, 'balanced', 'rounding noise is balanced');
});

test('report periods list business dates newest first and never the future', () => {
  const now = new Date('2026-11-25T06:00:00Z'); // 25 Nov in Manila
  assert.deepEqual(dailyClosingPeriodDates('Today', now), ['2026-11-25']);
  const week = dailyClosingPeriodDates('Last 7 days', now);
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-11-25');
  assert.equal(week[6], '2026-11-19');
  const month = dailyClosingPeriodDates('This month', now);
  assert.equal(month.length, 25);
  assert.equal(month.at(-1), '2026-11-01');
  const last = dailyClosingPeriodDates('Last month', now);
  assert.equal(last.length, 31);
  assert.equal(last[0], '2026-10-31');
  // 11 PM UTC on 31 Dec is already 1 Jan in Manila.
  assert.deepEqual(dailyClosingPeriodDates('Today', new Date('2026-12-31T23:00:00Z')), ['2027-01-01']);
});

test('days without a closing are listed as No closing recorded (OW-11 c7, OM-11 c5)', () => {
  const rows = buildDailyClosingReportRows({
    closings: [closing()],
    branches: [{ id: 'b1', name: 'Branch 1' }, { id: 'b2', name: 'Branch 2' }],
    dates: ['2026-11-24', '2026-11-25'],
  });
  assert.deepEqual(rows.map((row) => [row.businessDate, row.branchName, Boolean(row.closing)]), [
    ['2026-11-25', 'Branch 1', true],
    ['2026-11-25', 'Branch 2', false],
    ['2026-11-24', 'Branch 1', false],
    ['2026-11-24', 'Branch 2', false],
  ]);
  const branchOnly = buildDailyClosingReportRows({
    closings: [closing()],
    branches: [{ id: 'b1', name: 'Branch 1' }, { id: 'b2', name: 'Branch 2' }],
    dates: ['2026-11-25'],
    branchId: 'b2',
  });
  assert.deepEqual(branchOnly.map((row) => row.branchId), ['b2'], 'the report can be limited to one branch');
});

test('the report summary totals over and short separately', () => {
  const rows = buildDailyClosingReportRows({
    closings: [
      closing({ over_short: '20.00' }),
      closing({ id: 'c2', branch_id: 'b2', over_short: '-7.50' }),
    ],
    branches: [{ id: 'b1', name: 'Branch 1' }, { id: 'b2', name: 'Branch 2' }, { id: 'b3', name: 'Branch 3' }],
    dates: ['2026-11-25'],
  });
  assert.deepEqual(summarizeDailyClosingRows(rows), { closed: 2, missing: 1, totalOver: 20, totalShort: 7.5 });
});

test('closing rows map numbers and the recording employee (OM-11 c2, c3)', () => {
  const mapped = closing();
  assert.equal(mapped.openingFloat, 1000);
  assert.equal(mapped.expectedCash, 4250);
  assert.equal(mapped.recordedByName, 'Ana');
});

test('server errors become specific messages; a second closing is refused (ST-06 c10)', () => {
  assert.equal(
    dailyClosingErrorMessage({ message: 'The closing for this business day has already been recorded.' }),
    'The closing for this business day has already been recorded.',
  );
  assert.equal(
    dailyClosingErrorMessage({ code: '23505', message: 'duplicate key value' }),
    'The closing for this business day has already been recorded.',
  );
  assert.equal(dailyClosingErrorMessage({ message: 'Failed to fetch' }), 'No connection. Check the internet connection and try again.');
  assert.equal(dailyClosingErrorMessage({ message: 'odd' }), 'Unable to save. Please try again.');
  assert.equal(isMissingDailyClosingSupport({ code: 'PGRST205' }), true);
  assert.equal(isMissingDailyClosingSupport({ code: '42501', message: 'permission denied' }), false);
});
