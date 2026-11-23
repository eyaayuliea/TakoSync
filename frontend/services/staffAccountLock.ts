// OW-27 c1, c9: the lock status shown for each Staff account. An account is
// locked for 15 minutes after 5 failed logins (ST-01 c3); the lock ends by
// itself or when the owner resets the password (OW-27 c10).

export type StaffLockStatus = { locked: boolean; label: string };

export function staffLockStatus(
  account: { locked_until?: string | null },
  now: Date = new Date(),
): StaffLockStatus {
  const until = account.locked_until ? new Date(account.locked_until) : null;
  if (!until || Number.isNaN(until.getTime()) || until.getTime() <= now.getTime()) {
    return { locked: false, label: 'Not locked' };
  }
  const time = until.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
  return { locked: true, label: `Locked until ${time}` };
}

/** OW-27 c10: the confirmation shown before a password reset. */
export function staffPasswordResetPrompt(account: { full_name?: string | null; username: string }): string {
  const name = account.full_name?.trim() || account.username;
  return `Reset ${name}'s password to their Employee ID? They must change it at their next login. A locked account is unlocked.`;
}
