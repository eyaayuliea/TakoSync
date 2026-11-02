export const STAFF_SESSION_DAY_STORAGE_KEY = 'takosync.staff-session-day';

export function getLocalCalendarDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function millisecondsUntilNextLocalDay(date = new Date()): number {
  const nextDay = new Date(date);
  nextDay.setHours(24, 0, 0, 0);
  return Math.max(0, nextDay.getTime() - date.getTime());
}
