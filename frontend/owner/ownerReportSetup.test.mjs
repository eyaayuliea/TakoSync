import assert from 'node:assert/strict';
import test from 'node:test';
import { reportSetupMessage } from './ownerReportSetup.ts';

const setup = (overrides) => ({ report: 'Void Report', period: 'Custom', startDate: '2026-11-01', endDate: '2026-11-30', ...overrides });

test('OW-05 c3: Generate Report needs a report type and a valid period', () => {
  assert.equal(reportSetupMessage(setup({ report: null })), 'Select a report type.');
  assert.equal(reportSetupMessage(setup({ period: 'This Month', startDate: '' })), '');
  assert.equal(reportSetupMessage(setup({})), '');
  assert.equal(reportSetupMessage(setup({ startDate: '' })), 'Enter the start and end dates.');
  assert.equal(reportSetupMessage(setup({ startDate: '2026-11-31' })), 'Enter the start date as YYYY-MM-DD.');
  assert.equal(reportSetupMessage(setup({ endDate: '30/11/2026' })), 'Enter the end date as YYYY-MM-DD.');
});

test('OW-05 c4: an end date earlier than the start date has its own message', () => {
  assert.equal(reportSetupMessage(setup({ startDate: '2026-11-30', endDate: '2026-11-01' })), 'The end date cannot be earlier than the start date.');
  assert.equal(reportSetupMessage(setup({ startDate: '2026-11-30', endDate: '2026-11-30' })), '');
});

test('OW-12: a snapshot report ignores the period', () => {
  assert.equal(reportSetupMessage(setup({ report: 'Expected Stock Quantity Report', usesPeriod: false, startDate: '' })), '');
});
