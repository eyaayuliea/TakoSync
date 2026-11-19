export type OwnerLoginErrorCode =
  | 'email_not_found'
  | 'incorrect_password'
  | 'unauthorized_access'
  | 'connection_failure';

const ownerLoginErrorMessages: Record<OwnerLoginErrorCode, string> = {
  email_not_found: 'Email is incorrect. Please check your email.',
  incorrect_password: 'Password is incorrect. Please try again.',
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
