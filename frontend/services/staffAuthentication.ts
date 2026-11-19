export function normalizeStaffUsername(value: string): string {
  const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (!normalized) return '';
  return normalized.endsWith('_staff') ? normalized : `${normalized}_staff`;
}

function staffUsernameHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function staffAuthAlias(username: string): string {
  const normalized = normalizeStaffUsername(username);
  if (!normalized) throw new Error('Please enter your username.');
  return `staff-${staffUsernameHash(normalized)}@auth.takosync.internal`;
}

export type StaffLoginErrorCode =
  | 'unknown_username'
  | 'incorrect_password'
  | 'inactive_account'
  | 'connection_failure';

export class StaffLoginError extends Error {
  readonly code: StaffLoginErrorCode;

  constructor(code: StaffLoginErrorCode) {
    super(staffLoginErrorMessage(code));
    this.name = 'StaffLoginError';
    this.code = code;
  }
}

export function staffLoginErrorMessage(code: StaffLoginErrorCode): string {
  switch (code) {
    case 'unknown_username':
      return 'Username not found. Please check your username.';
    case 'incorrect_password':
      return 'Incorrect password. Please try again.';
    case 'inactive_account':
      return 'This account is inactive. Please contact the owner.';
    case 'connection_failure':
      return 'Unable to connect. Please check your internet connection and try again.';
  }
}

export type StaffLoginFeedback = {
  usernameError: string;
  passwordError: string;
  banner: string;
  clearPassword: boolean;
};

/**
 * Maps a failed Staff login to where ST-01 says the message belongs: an unknown
 * username under the Username field (Password cleared), a wrong password under
 * the Password field (Password cleared, Username kept), and inactive-account or
 * connection failures as a banner that keeps the entries.
 */
export function staffLoginFeedback(error: unknown): StaffLoginFeedback {
  const feedback: StaffLoginFeedback = { usernameError: '', passwordError: '', banner: '', clearPassword: false };
  if (error instanceof StaffLoginError) {
    if (error.code === 'unknown_username') {
      feedback.usernameError = error.message;
      feedback.clearPassword = true;
    } else if (error.code === 'incorrect_password') {
      feedback.passwordError = error.message;
      feedback.clearPassword = true;
    } else {
      feedback.banner = error.message;
    }
    return feedback;
  }
  feedback.banner = error instanceof Error ? error.message : 'Unable to sign in. Please try again.';
  return feedback;
}
