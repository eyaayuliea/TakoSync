export type OwnerLoginErrorCode =
  | 'email_not_found'
  | 'incorrect_password'
  | 'unauthorized_access'
  | 'connection_failure';

const ownerLoginErrorMessages: Record<OwnerLoginErrorCode, string> = {
  email_not_found: 'Email not found. Please check your email.',
  incorrect_password: 'Incorrect password. Please try again.',
  unauthorized_access: 'This account does not have Owner access.',
  connection_failure: 'Unable to connect. Please check your internet connection and try again.',
};

export class OwnerLoginError extends Error {
  readonly code: OwnerLoginErrorCode;

  constructor(code: OwnerLoginErrorCode) {
    super(ownerLoginErrorMessages[code]);
    this.name = 'OwnerLoginError';
    this.code = code;
  }
}

/**
 * Owner login must show the approved connection message when the device is
 * offline or the service does not answer in time (OM-01 criterion 6), never a
 * developer-oriented configuration message.
 */
export function isOwnerConnectionFailure(error: unknown): boolean {
  if (error instanceof OwnerLoginError) return error.code === 'connection_failure';
  if (error instanceof TypeError) return true;
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : typeof (error as { message?: unknown } | null)?.message === 'string' ? String((error as { message: string }).message) : '';
  return status === 0 || /unable to reach|failed to fetch|network|connection|timed? ?out|timeout/i.test(message);
}
