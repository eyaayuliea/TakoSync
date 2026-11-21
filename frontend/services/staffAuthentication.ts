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
  | 'locked_account'
  | 'connection_failure';

/** ST-01 c3: lockout details the server returns with a failed attempt. */
export type StaffLoginErrorDetails = {
  /** When a locked account can try again (ISO time). */
  lockedUntil?: string | null;
  /** Wrong-password attempts left before the account locks. */
  attemptsRemaining?: number | null;
  now?: Date;
};

export const STAFF_LOCKOUT_MINUTES = 15;

export class StaffLoginError extends Error {
  readonly code: StaffLoginErrorCode;
  readonly lockedUntil: string | null;

  constructor(code: StaffLoginErrorCode, details: StaffLoginErrorDetails = {}) {
    super(staffLoginErrorMessage(code, details));
    this.name = 'StaffLoginError';
    this.code = code;
    this.lockedUntil = details.lockedUntil ?? null;
  }
}

function minutesUntil(lockedUntil: string | null | undefined, now: Date): number | null {
  if (!lockedUntil) return null;
  const until = new Date(lockedUntil).getTime();
  if (Number.isNaN(until)) return null;
  return Math.max(1, Math.ceil((until - now.getTime()) / 60_000));
}

export function staffLoginErrorMessage(code: StaffLoginErrorCode, details: StaffLoginErrorDetails = {}): string {
  switch (code) {
    case 'unknown_username':
      return 'Username not found. Please try again.';
    case 'incorrect_password': {
      const left = details.attemptsRemaining;
      if (typeof left === 'number' && left > 0 && left <= 2) {
        return `Incorrect password. ${left} ${left === 1 ? 'attempt' : 'attempts'} left before the account is locked for ${STAFF_LOCKOUT_MINUTES} minutes.`;
      }
      return 'Incorrect password. Please try again.';
    }
    case 'locked_account': {
      const minutes = minutesUntil(details.lockedUntil, details.now ?? new Date());
      const wait = minutes === null ? `in ${STAFF_LOCKOUT_MINUTES} minutes` : `in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
      return `This account is locked after 5 failed attempts. Try again ${wait}, or ask the owner to reset your password.`;
    }
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
    } else if (error.code === 'locked_account') {
      feedback.banner = error.message;
      feedback.clearPassword = true;
    } else {
      feedback.banner = error.message;
    }
    return feedback;
  }
  feedback.banner = error instanceof Error ? error.message : 'Unable to sign in. Please try again.';
  return feedback;
}
