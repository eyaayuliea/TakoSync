import assert from 'node:assert/strict';
import test from 'node:test';
import { OwnerPasswordChangeError, validateOwnerPasswordChange } from './ownerPasswordChange.ts';

const ok = { currentPassword: 'old-password', newPassword: 'new-password-1', confirmPassword: 'new-password-1' };

test('OW-30 c3, c4: valid input has no errors', () => {
  assert.deepEqual(validateOwnerPasswordChange(ok), {});
});

test('OW-30 c4: each field has a specific message', () => {
  assert.deepEqual(validateOwnerPasswordChange({ currentPassword: '', newPassword: '', confirmPassword: '' }), {
    currentPassword: 'Enter your current password.',
    newPassword: 'Enter a new password.',
    confirmPassword: 'Confirm the new password.',
  });
  assert.equal(validateOwnerPasswordChange({ ...ok, newPassword: 'short', confirmPassword: 'short' }).newPassword, 'The new password must have at least 8 characters.');
  assert.equal(validateOwnerPasswordChange({ ...ok, confirmPassword: 'different-1' }).confirmPassword, 'The new password and its confirmation do not match.');
  assert.equal(validateOwnerPasswordChange({ ...ok, newPassword: 'old-password', confirmPassword: 'old-password' }).newPassword, 'Choose a new password different from your current password.');
});

test('the error carries the field messages', () => {
  const error = new OwnerPasswordChangeError({ currentPassword: 'Wrong.' });
  assert.equal(error.message, 'Wrong.');
  assert.deepEqual(error.fieldErrors, { currentPassword: 'Wrong.' });
});
