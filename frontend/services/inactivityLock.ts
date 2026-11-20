export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

export type SessionIdentity = {
  id: string;
  role: 'Staff' | 'Owner';
  branchId: string | null;
};

export const activityStorageKey = (identity: SessionIdentity) =>
  '@takosync/activity/v1/' + JSON.stringify([identity.id, identity.role, identity.branchId]);

export function inactivityRemaining(lastActivity: number, now: number): number {
  if (!Number.isFinite(lastActivity) || lastActivity <= 0 || now < lastActivity) return 0;
  return Math.max(0, INACTIVITY_TIMEOUT_MS - (now - lastActivity));
}

export function readActivityTimestamp(value: string | null): number {
  return value === null ? 0 : Number(value);
}

export class LockedSessionEndedError extends Error {
  constructor() {
    super('Your session or branch access changed. Please sign in again.');
  }
}

export function matchesSessionIdentity(actual: SessionIdentity | null, expected: SessionIdentity): boolean {
  return actual !== null &&
    actual.id === expected.id && actual.role === expected.role && actual.branchId === expected.branchId;
}

/** Verify the existing authorization before and after the independent password check. */
export async function verifyInactivityUnlock<T extends SessionIdentity>(
  expected: SessionIdentity,
  currentSession: () => Promise<T | null>,
  checkCredentials: () => Promise<SessionIdentity>,
): Promise<T> {
  if (!matchesSessionIdentity(await currentSession(), expected)) throw new LockedSessionEndedError();

  const account = await checkCredentials();
  if (account.id !== expected.id) throw new Error('Use the credentials for the account that locked this workspace.');
  if (!matchesSessionIdentity(account, expected)) throw new LockedSessionEndedError();

  const current = await currentSession();
  if (!current || !matchesSessionIdentity(current, expected)) throw new LockedSessionEndedError();
  return current;
}
