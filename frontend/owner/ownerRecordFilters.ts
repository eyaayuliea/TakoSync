// OM-16 c3–c4 (and OM-17 c5, OM-18 c4, OM-19 c4, OM-20 c5, OM-21 c4): every
// inventory record list has a branch selector (All Branches, Branch 1–3) and
// a date selector. Branches are matched on their "Branch N" part, because the
// lists build the full branch label in slightly different ways.

import { manilaBusinessDate } from '../services/staffDailySession.ts';

export const ALL_BRANCHES = 'All Branches';

export const OWNER_RECORD_PERIODS = ['All dates', 'Today', 'Last 7 days', 'This month', 'Last month'] as const;
export type OwnerRecordPeriod = (typeof OWNER_RECORD_PERIODS)[number];

/** "Cebu · Branch 2" → "Branch 2"; anything without a branch number is kept as is. */
export function branchKey(name: string): string {
  const match = /branch\s*(\d+)/i.exec(name);
  return match ? `Branch ${Number(match[1])}` : name.trim();
}

/** All Branches first, then each branch once, in number order. */
export function branchFilterOptions(names: string[]): string[] {
  const keys = [...new Set(names.map(branchKey).filter(Boolean))];
  keys.sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  return [ALL_BRANCHES, ...keys];
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The first and last business date (Manila) of a period, or null for all dates. */
export function recordPeriodRange(
  period: OwnerRecordPeriod,
  now: Date = new Date(),
): { start: string; end: string } | null {
  const today = manilaBusinessDate(now);
  switch (period) {
    case 'All dates':
      return null;
    case 'Today':
      return { start: today, end: today };
    case 'Last 7 days':
      return { start: shiftDate(today, -6), end: today };
    case 'This month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'Last month': {
      const end = shiftDate(`${today.slice(0, 7)}-01`, -1);
      return { start: `${end.slice(0, 7)}-01`, end };
    }
  }
}

export function filterOwnerRecords<T>(
  records: T[],
  options: {
    branch: string;
    period: OwnerRecordPeriod;
    branchOf: (record: T) => string;
    dateOf: (record: T) => string | null | undefined;
    now?: Date;
  },
): T[] {
  const range = recordPeriodRange(options.period, options.now);
  return records.filter((record) => {
    if (options.branch !== ALL_BRANCHES && branchKey(options.branchOf(record)) !== options.branch) return false;
    if (!range) return true;
    const value = options.dateOf(record);
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const day = manilaBusinessDate(date);
    return day >= range.start && day <= range.end;
  });
}

/** Empty-state text for a filtered list (OM-16 c6). */
export function filteredEmptyMessage(branch: string, period: OwnerRecordPeriod): string {
  if (branch === ALL_BRANCHES && period === 'All dates') return 'No records yet.';
  const parts = [branch === ALL_BRANCHES ? null : branch, period === 'All dates' ? null : period.toLowerCase()]
    .filter(Boolean)
    .join(', ');
  return `No records for ${parts}.`;
}
