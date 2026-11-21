// ST-15 c3–c6: staff change their own password with the current password, a
// new password, and its confirmation.

export const STAFF_PASSWORD_MIN_LENGTH = 8;

export const CURRENT_PASSWORD_INCORRECT_MESSAGE = 'Your current password is incorrect. Please try again.';

export type StaffPasswordChangeField = 'current' | 'password' | 'confirmation';

/**
 * Checks the form before anything is sent. Returns the first problem with the
 * field it belongs to, or null when the form is ready.
 */
export function validateStaffPasswordChange(input: {
  currentPassword: string;
  newPassword: string;
  confirmation: string;
  employeeId: string | null;
  requireCurrentPassword: boolean;
}): { field: StaffPasswordChangeField; message: string } | null {
  if (input.requireCurrentPassword && !input.currentPassword) {
    return { field: 'current', message: 'Enter your current password.' };
  }
  if (input.newPassword.length < STAFF_PASSWORD_MIN_LENGTH) {
    return { field: 'password', message: `New password must be at least ${STAFF_PASSWORD_MIN_LENGTH} characters.` };
  }
  if (input.employeeId && input.newPassword === input.employeeId) {
    return { field: 'password', message: 'Choose a password different from your Employee ID.' };
  }
  if (input.requireCurrentPassword && input.newPassword === input.currentPassword) {
    return { field: 'password', message: 'Choose a new password different from your current password.' };
  }
  if (input.newPassword !== input.confirmation) {
    return { field: 'confirmation', message: 'The new password and its confirmation do not match.' };
  }
  return null;
}
