// OW-30 c3–c5: the owner changes the password with the current password, a new
// password and its confirmation, with a specific message for each problem.

export type OwnerPasswordFields = { currentPassword: string; newPassword: string; confirmPassword: string };
export type OwnerPasswordErrors = Partial<Record<keyof OwnerPasswordFields, string>>;

export const OWNER_WRONG_CURRENT_PASSWORD = 'Your current password is incorrect. Please try again.';

export function validateOwnerPasswordChange(fields: OwnerPasswordFields): OwnerPasswordErrors {
  const errors: OwnerPasswordErrors = {};
  if (!fields.currentPassword) errors.currentPassword = 'Enter your current password.';
  if (!fields.newPassword) errors.newPassword = 'Enter a new password.';
  else if (fields.newPassword.length < 8) errors.newPassword = 'The new password must have at least 8 characters.';
  else if (fields.currentPassword && fields.newPassword === fields.currentPassword) {
    errors.newPassword = 'Choose a new password different from your current password.';
  }
  if (!fields.confirmPassword) errors.confirmPassword = 'Confirm the new password.';
  else if (fields.newPassword && fields.confirmPassword !== fields.newPassword) {
    errors.confirmPassword = 'The new password and its confirmation do not match.';
  }
  return errors;
}

/** Thrown with the field messages to show next to the inputs. */
export class OwnerPasswordChangeError extends Error {
  fieldErrors: OwnerPasswordErrors;

  constructor(fieldErrors: OwnerPasswordErrors) {
    super(Object.values(fieldErrors)[0] ?? 'Unable to change the password.');
    this.name = 'OwnerPasswordChangeError';
    this.fieldErrors = fieldErrors;
  }
}
