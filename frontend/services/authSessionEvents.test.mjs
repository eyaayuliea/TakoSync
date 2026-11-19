import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./testTsLoader.mjs', import.meta.url);
const {
  getAuthenticatedMobileDestination,
  shouldClearMobileSession,
} = await import('./authSessionEvents.ts');

test('clears the mobile session when Supabase reports an unexpected sign-out', () => {
  assert.equal(shouldClearMobileSession('SIGNED_OUT', false), true);
});

test('does not override the navigation chosen by an explicit logout', () => {
  assert.equal(shouldClearMobileSession('SIGNED_OUT', true), false);
});

test('keeps the mobile session during ordinary Auth lifecycle events', () => {
  for (const event of ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
    assert.equal(shouldClearMobileSession(event, false), false);
  }
});

test('Staff sessions open the workspace after authentication', () => {
  assert.equal(getAuthenticatedMobileDestination('Staff'), 'staffWorkspace');
});

test('Owner sessions always open the Owner dashboard', () => {
  assert.equal(getAuthenticatedMobileDestination('Owner'), 'dashboard');
});
