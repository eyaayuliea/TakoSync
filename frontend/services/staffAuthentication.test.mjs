import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStaffUsername,
  staffAuthAlias,
  staffLoginErrorMessage,
} from './staffAuthentication.ts';

test('Staff usernames normalize consistently and aliases never expose the username', () => {
  assert.equal(normalizeStaffUsername('Bien'), 'bien_staff');
  assert.equal(normalizeStaffUsername('Jubeth'), 'jubeth_staff');
  assert.equal(normalizeStaffUsername('bien_staff'), 'bien_staff');
  assert.equal(normalizeStaffUsername(' ANNA '), 'anna_staff');
  assert.equal(normalizeStaffUsername(''), '');
  assert.equal(normalizeStaffUsername('  Ana  Cruz '), 'ana cruz_staff');
  assert.equal(normalizeStaffUsername('ＡＮＡ　ＣＲＵＺ'), 'ana cruz_staff');
  assert.equal(staffAuthAlias('Ana Cruz'), staffAuthAlias('  ana   cruz '));
  assert.match(staffAuthAlias('Ana Cruz'), /^staff-[0-9a-f]{8}@auth\.takosync\.internal$/);
  assert.doesNotMatch(staffAuthAlias('Ana Cruz'), /ana|cruz/i);
});

test('Staff login messages remain explicit and distinct', () => {
  assert.equal(staffLoginErrorMessage('unknown_username'), 'Username not found. Please check your username.');
  assert.equal(staffLoginErrorMessage('incorrect_password'), 'Incorrect password. Please try again.');
  assert.equal(staffLoginErrorMessage('inactive_account'), 'This account is inactive. Please contact the owner.');
});

test('Staff login failures are placed under the field the ST-01 criteria name', async () => {
  const { staffLoginFeedback, StaffLoginError } = await import('./staffAuthentication.ts');
  assert.deepEqual(staffLoginFeedback(new StaffLoginError('unknown_username')), {
    usernameError: 'Username not found. Please check your username.',
    passwordError: '',
    banner: '',
    clearPassword: true,
  });
  assert.deepEqual(staffLoginFeedback(new StaffLoginError('incorrect_password')), {
    usernameError: '',
    passwordError: 'Incorrect password. Please try again.',
    banner: '',
    clearPassword: true,
  });
  assert.deepEqual(staffLoginFeedback(new StaffLoginError('inactive_account')), {
    usernameError: '',
    passwordError: '',
    banner: 'This account is inactive. Please contact the owner.',
    clearPassword: false,
  });
  const connection = staffLoginFeedback(new StaffLoginError('connection_failure'));
  assert.equal(connection.banner, 'Unable to connect. Please check your internet connection and try again.');
  assert.equal(connection.clearPassword, false);
});
