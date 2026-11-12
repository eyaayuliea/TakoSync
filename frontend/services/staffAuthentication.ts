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
  | 'inactive_account';

export function staffLoginErrorMessage(code: StaffLoginErrorCode): string {
  switch (code) {
    case 'unknown_username':
      return 'Username not found. Please check your username.';
    case 'incorrect_password':
      return 'Incorrect password. Please try again.';
    case 'inactive_account':
      return 'This account is inactive. Please contact the owner.';
  }
}
