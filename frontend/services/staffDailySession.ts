// ST-01 criteria 5–8: the Staff daily session and inactivity lock.
//
// The business day ends at the cut-off (default 12:00 midnight Philippine time,
// decided in #22). The current business date always comes from the server, never
// the phone clock; the session's start is Supabase Auth's server-recorded
// `last_sign_in_at`.

/** Default inactivity period before the Staff screen locks (owner-adjustable later). */
export const DEFAULT_STAFF_INACTIVITY_LOCK_MS = 5 * 60_000;

export const DAILY_SESSION_ENDED_MESSAGE = 'Your business day has ended. Please log in again.';

// Philippine time is UTC+8 all year (no daylight saving time).
const MANILA_OFFSET_MS = 8 * 60 * 60_000;

/** The Manila calendar date (YYYY-MM-DD) of an instant, with the default midnight cut-off. */
export function manilaBusinessDate(instant: Date): string {
  if (Number.isNaN(instant.getTime())) throw new Error('Invalid date.');
  return new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * True once the server's business date is later than the business date the
 * session started on. Missing or unreadable values never expire the session, so
 * an unavailable server check cannot log staff out by itself.
 */
export function isDailySessionExpired(
  signedInAt: string | null | undefined,
  serverBusinessDate: string | null | undefined,
): boolean {
  if (!signedInAt || !serverBusinessDate || !/^\d{4}-\d{2}-\d{2}$/.test(serverBusinessDate)) return false;
  const started = new Date(signedInAt);
  if (Number.isNaN(started.getTime())) return false;
  return serverBusinessDate > manilaBusinessDate(started);
}

/** True when no activity has been seen for the lock period. */
export function shouldLockForInactivity(
  lastActivityAt: number,
  now: number,
  timeoutMs: number = DEFAULT_STAFF_INACTIVITY_LOCK_MS,
): boolean {
  return now - lastActivityAt >= timeoutMs;
}
