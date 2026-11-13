import type { Json } from '../../backend/types/database';

export type BusinessDaySettings = {
  businessDate: string;
  openingTime: string;
  normalClosingTime: string;
  extendedClosingTime: string;
  extendedClosingEnabled: boolean;
  timezone: 'Asia/Manila';
  millisecondsUntilExpiration: number;
};

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTime(value: Json | undefined, fieldName: string): string {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
    throw new Error(`The server returned an invalid ${fieldName}.`);
  }
  return value.slice(0, 5);
}

export function readBusinessDaySettings(value: Json): BusinessDaySettings {
  if (!isRecord(value) || value.active !== true) {
    throw new Error('An active business session is required to manage today’s closing time.');
  }
  const businessDate = value.business_date;
  const timezone = value.timezone;
  const extendedClosingEnabled = value.extended_closing_enabled;
  const millisecondsUntilExpiration = value.milliseconds_until_expiration;
  if (typeof businessDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new Error('The server returned an invalid Manila business date.');
  }
  if (timezone !== 'Asia/Manila') {
    throw new Error('The server returned an unsupported business timezone.');
  }
  if (typeof extendedClosingEnabled !== 'boolean') {
    throw new Error(
      'Business closing settings are not available yet. The business-day session migration may not be applied to this database.',
    );
  }
  if (
    typeof millisecondsUntilExpiration !== 'number'
    || !Number.isFinite(millisecondsUntilExpiration)
    || millisecondsUntilExpiration < 0
  ) {
    throw new Error('The server returned an invalid business-session deadline.');
  }

  return {
    businessDate,
    openingTime: readTime(value.opening_time, 'opening time'),
    normalClosingTime: readTime(value.normal_closing_time, 'normal closing time'),
    extendedClosingTime: readTime(value.extended_closing_time, 'extended closing time'),
    extendedClosingEnabled,
    timezone,
    millisecondsUntilExpiration,
  };
}

export function formatBusinessTime(value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
}

export type ReportingPeriod = 'Today' | 'This Week' | 'This Month' | 'Custom';

export type ReportingDateRange = { start: Date; end: Date };

function dateKeyFromParts(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

function calendarDateFromKey(value: string): Date {
  if (!isDateKey(value)) throw new Error('Choose a valid business date.');
  return new Date(`${value}T00:00:00.000Z`);
}

function manilaStartForKey(value: string): Date {
  if (!isDateKey(value)) throw new Error('Choose a valid business date.');
  return new Date(`${value}T00:00:00+08:00`);
}

function addCalendarDays(value: string, days: number): string {
  const date = calendarDateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function manilaDateKey(date = new Date()): string {
  return dateKeyFromParts(date);
}

export function manilaHour(date: Date): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
}

export function getManilaReportingRange(
  period: ReportingPeriod,
  now = new Date(),
  customStart?: string,
  customEnd?: string,
): ReportingDateRange | null {
  const today = manilaDateKey(now);
  let startKey: string;
  let endKey: string;

  if (period === 'Custom') {
    if (!customStart || !customEnd || !isDateKey(customStart) || !isDateKey(customEnd) || customStart > customEnd) return null;
    startKey = customStart;
    endKey = addCalendarDays(customEnd, 1);
  } else {
    const start = calendarDateFromKey(today);
    if (period === 'This Month') {
      start.setUTCDate(1);
    } else if (period === 'This Week') {
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    }
    startKey = start.toISOString().slice(0, 10);
    endKey = addCalendarDays(startKey, period === 'Today' ? 1 : period === 'This Week' ? 7 : 31);
    if (period === 'This Month') {
      const nextMonth = calendarDateFromKey(startKey);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
      endKey = nextMonth.toISOString().slice(0, 10);
    }
  }

  return { start: manilaStartForKey(startKey), end: manilaStartForKey(endKey) };
}
