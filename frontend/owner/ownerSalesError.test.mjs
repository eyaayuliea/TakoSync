import assert from 'node:assert/strict';
import test from 'node:test';
import { describeOwnerSalesError } from './ownerSalesError.ts';

test('invalid filter input is a validation error that retrying cannot fix', () => {
  const info = describeOwnerSalesError('Enter valid start and end dates. The end date must not be before the start date.');
  assert.equal(info.kind, 'validation');
  assert.match(info.message, /^Enter valid start and end dates/);
  assert.equal(info.detail, null);
});

test('a network failure keeps the connection message', () => {
  const info = describeOwnerSalesError(new Error('Failed to fetch'));
  assert.equal(info.kind, 'load');
  assert.match(info.message, /internet connection/i);
});

test('a missing database object is not reported as a connection problem', () => {
  const info = describeOwnerSalesError(new Error('Could not find the table public.sales in the schema cache'));
  assert.equal(info.kind, 'load');
  assert.doesNotMatch(info.message, /internet connection/i);
  assert.match(info.message, /migrations/i);
  assert.match(info.detail ?? '', /schema cache/);
});

test('unknown errors keep the underlying text as detail', () => {
  const info = describeOwnerSalesError(new Error('boom'));
  assert.equal(info.message, 'Unable to load sales data. Please try again.');
  assert.equal(info.detail, 'boom');
});
