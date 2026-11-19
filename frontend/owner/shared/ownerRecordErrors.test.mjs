import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeOwnerRecordError,
  OWNER_RECORD_NETWORK_MESSAGE,
} from './ownerRecordErrors.ts';

test('a schema-cache error is not reported as a network problem and keeps the real message', () => {
  const error = new Error("Could not find the function public.record_inventory_transactions_idempotent(p_branch_id) in the schema cache");
  const info = describeOwnerRecordError(error);
  assert.match(info.message, /apply the latest database migrations/);
  assert.notEqual(info.message, OWNER_RECORD_NETWORK_MESSAGE);
  assert.equal(info.detail, error.message);
});

test('a missing table is reported as a database problem', () => {
  const info = describeOwnerRecordError({ message: 'relation "public.inventory_count_correction_requests" does not exist' });
  assert.match(info.message, /missing something/);
  assert.match(info.detail, /inventory_count_correction_requests/);
});

test('permission and session failures explain the access problem', () => {
  assert.match(describeOwnerRecordError(new Error('permission denied for table sales')).message, /not allowed/);
  assert.match(describeOwnerRecordError(new Error('new row violates row-level security policy')).message, /not allowed/);
  assert.match(describeOwnerRecordError(new Error('JWT expired')).message, /Sign in again/);
});

test('real connectivity failures keep the internet message', () => {
  assert.equal(describeOwnerRecordError(new TypeError('Network request failed')).message, OWNER_RECORD_NETWORK_MESSAGE);
  assert.equal(describeOwnerRecordError(new Error('Failed to fetch')).message, OWNER_RECORD_NETWORK_MESSAGE);
  const sameText = describeOwnerRecordError(new Error(OWNER_RECORD_NETWORK_MESSAGE));
  assert.equal(sameText.detail, null);
});

test('unknown errors are still friendly and show the underlying text', () => {
  const info = describeOwnerRecordError(new Error('Owner branches are unavailable for Stock-In records.'));
  assert.equal(info.message, 'Unable to load records. Please try again.');
  assert.equal(info.detail, 'Owner branches are unavailable for Stock-In records.');
  assert.deepEqual(describeOwnerRecordError(undefined), { message: 'Unable to load records. Please try again.', detail: null });
  assert.equal(describeOwnerRecordError('x'.repeat(500)).detail.length, 240);
});
