import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStaffPasswordChange } from './staffPasswordChange.ts';

const base = {
  currentPassword: 'oldpass123',
  newPassword: 'newpass123',
  confirmation: 'newpass123',
  employeeId: 'EMP-0001',
  requireCurrentPassword: true,
};

test('a complete, valid change passes (ST-15 c3)', () => {
  assert.equal(validateStaffPasswordChange(base), null);
});

test('the current password is required from Profile (ST-15 c3)', () => {
  assert.deepEqual(validateStaffPasswordChange({ ...base, currentPassword: '' }), {
    field: 'current', message: 'Enter your current password.',
  });
  assert.equal(
    validateStaffPasswordChange({ ...base, currentPassword: '', requireCurrentPassword: false }),
    null,
    'not asked when the account must change its initial password',
  );
});

test('the new password has at least 8 characters and matches its confirmation (ST-15 c4)', () => {
  assert.deepEqual(validateStaffPasswordChange({ ...base, newPassword: 'short', confirmation: 'short' }), {
    field: 'password', message: 'New password must be at least 8 characters.',
  });
  assert.deepEqual(validateStaffPasswordChange({ ...base, confirmation: 'newpass124' }), {
    field: 'confirmation', message: 'The new password and its confirmation do not match.',
  });
});

test('the new password must differ from the Employee ID and the current password', () => {
  assert.equal(
    validateStaffPasswordChange({ ...base, newPassword: 'EMP-0001', confirmation: 'EMP-0001' })?.message,
    'Choose a password different from your Employee ID.',
  );
  assert.equal(
    validateStaffPasswordChange({ ...base, newPassword: 'oldpass123', confirmation: 'oldpass123' })?.message,
    'Choose a new password different from your current password.',
  );
});
