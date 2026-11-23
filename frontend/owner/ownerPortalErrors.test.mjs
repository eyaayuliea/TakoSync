import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OWNER_PORTAL_ACCESS_MESSAGE,
  OWNER_PORTAL_CONNECTION_MESSAGE,
  OWNER_PORTAL_SETUP_MESSAGE,
  isOwnerPortalConnectionError,
  ownerPortalErrorText,
} from './ownerPortalErrors.ts';

const fallback = 'Unable to load this section. Please try again.';

test('OW-31 c2, c10: a lost connection shows the connection message, never "TypeError: Failed to fetch"', () => {
  assert.equal(ownerPortalErrorText(new TypeError('Failed to fetch'), fallback), OWNER_PORTAL_CONNECTION_MESSAGE);
  assert.equal(ownerPortalErrorText('TypeError: Failed to fetch', fallback), OWNER_PORTAL_CONNECTION_MESSAGE);
  assert.equal(ownerPortalErrorText(new Error('NetworkError when attempting to fetch resource.'), fallback), OWNER_PORTAL_CONNECTION_MESSAGE);
  assert.equal(ownerPortalErrorText({ status: 0, message: '' }, fallback), OWNER_PORTAL_CONNECTION_MESSAGE);
  assert.equal(isOwnerPortalConnectionError(new Error('Load failed')), true);
  assert.equal(isOwnerPortalConnectionError(new Error('Enter a username')), false);
});

test('OW-31 c10: technical details are replaced by the fallback', () => {
  for (const raw of [
    "TypeError: Cannot read properties of undefined (reading 'map')",
    'duplicate key value violates unique constraint "profiles_username_key"',
    '{"code":"PGRST116","message":"JSON object requested"}',
    'Edge Function returned a non-2xx status code',
    '',
  ]) assert.equal(ownerPortalErrorText(new Error(raw), fallback), fallback, raw);
  assert.equal(ownerPortalErrorText(null, fallback), fallback);
});

test('setup and access problems get their own plain messages', () => {
  assert.equal(ownerPortalErrorText(new Error('Could not find the function public.x in the schema cache'), fallback), OWNER_PORTAL_SETUP_MESSAGE);
  assert.equal(ownerPortalErrorText(new Error('permission denied for table sales'), fallback), OWNER_PORTAL_ACCESS_MESSAGE);
});

test("the app's own plain messages are kept", () => {
  assert.equal(ownerPortalErrorText(new Error('An assigned branch is required.'), fallback), 'An assigned branch is required.');
  assert.equal(ownerPortalErrorText('Cash amounts cannot be negative.', fallback), 'Cash amounts cannot be negative.');
});
