// Pure date helpers for the Owner Sales Summary. Daily, Weekly and Monthly are all derived from
// one anchor date (the day the owner picked, or today), so the pickers drive the data and no
// sample date is ever baked in. All values are Manila calendar-date keys (YYYY-MM-DD); the
// arithmetic is done in UTC on those keys so it does not depend on the device time zone.

export type OwnerSalesTabPeriod = 'Daily' | 'Weekly' | 'Monthly';

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function isDateKey(value: string): boolean {
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toUtc(value: string): Date {
  const match = DATE_KEY.exec(value);
  if (!match) throw new Error(`Invalid date key: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToKey(value: string, days: number): string {
  const date = toUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

export function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function monthKeyBounds(year: number, monthIndex: number): { start: string; end: string } {
  const month = String(monthIndex + 1).padStart(2, '0');
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDayOfMonth(year, monthIndex)).padStart(2, '0')}`,
  };
}

/** Monday to Sunday week containing the given date. */
export function weekKeyBounds(value: string): { start: string; end: string } {
  const date = toUtc(value);
  const start = addDaysToKey(value, -((date.getUTCDay() + 6) % 7));
  return { start, end: addDaysToKey(start, 6) };
}

export type OwnerSalesPeriodSelection = { fromText: string; toText: string };

/** From/to keys for a Daily, Weekly or Monthly view anchored on a date. */
export function ownerSalesPeriodSelection(period: OwnerSalesTabPeriod, anchor: string): OwnerSalesPeriodSelection {
  if (!isDateKey(anchor)) throw new Error(`Invalid anchor date: ${anchor}`);
  if (period === 'Weekly') {
    const { start, end } = weekKeyBounds(anchor);
    return { fromText: start, toText: end };
  }
  if (period === 'Monthly') {
    const date = toUtc(anchor);
    const { start, end } = monthKeyBounds(date.getUTCFullYear(), date.getUTCMonth());
    return { fromText: start, toText: end };
  }
  return { fromText: anchor, toText: anchor };
}

export function isFutureDateKey(value: string, today: string): boolean {
  return value > today;
}

/** Keep the chosen day when it falls in the new range; otherwise move to the nearest allowed day. */
export function anchorForRange(current: string, range: { start: string; end: string }, today: string): string {
  if (current >= range.start && current <= range.end) return current;
  const target = today >= range.start && today <= range.end ? today : range.start;
  return target > today ? today : target;
}

function dayMonth(value: string, withYear: boolean): string {
  const date = toUtc(value);
  return `${date.getUTCDate()} ${MONTH_SHORT[date.getUTCMonth()]}${withYear ? ` ${date.getUTCFullYear()}` : ''}`;
}

export type OwnerSalesWeekOption = {
  start: string;
  end: string;
  dropdownLabel: string;
  sheetLabel: string;
  current: boolean;
};

export function ownerSalesWeekOption(anchor: string, today: string): OwnerSalesWeekOption {
  const { start, end } = weekKeyBounds(anchor);
  const s = toUtc(start);
  const e = toUtc(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const sameMonth = sameYear && s.getUTCMonth() === e.getUTCMonth();
  const startLabel = sameMonth ? String(s.getUTCDate()) : dayMonth(start, !sameYear);
  const endLabel = dayMonth(end, true);
  return {
    start,
    end,
    dropdownLabel: `${startLabel}–${endLabel}`,
    sheetLabel: `${startLabel} – ${endLabel}`,
    current: today >= start && today <= end,
  };
}

/** The current week followed by earlier weeks, newest first. Future weeks are never offered. */
export function recentOwnerSalesWeeks(today: string, count = 8): OwnerSalesWeekOption[] {
  const currentStart = weekKeyBounds(today).start;
  return Array.from({ length: count }, (_, index) => ownerSalesWeekOption(addDaysToKey(currentStart, -7 * index), today));
}

export function ownerSalesMonthLabel(anchor: string): string {
  const date = toUtc(anchor);
  return `${MONTH_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function ownerSalesMonthOf(anchor: string): { year: number; month: number } {
  const date = toUtc(anchor);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

export function isFutureMonth(year: number, monthIndex: number, today: string): boolean {
  return monthKeyBounds(year, monthIndex).start > today;
}

export function ownerSalesDayLabel(anchor: string): string {
  const date = toUtc(anchor);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
  return `${weekday}, ${String(date.getUTCDate()).padStart(2, '0')} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Label for a Custom range handed over from the Owner dashboard. */
export function ownerSalesRangeLabel(from: string, to: string): string {
  if (!isDateKey(from) || !isDateKey(to)) return 'Custom range';
  return from === to ? ownerSalesDayLabel(from) : `${dayMonth(from, true)} – ${dayMonth(to, true)}`;
}

export type OwnerSalesInitialView = {
  period: 'Daily' | 'Weekly' | 'Monthly' | 'Custom';
  anchor: string;
  fromText: string;
  toText: string;
};

/**
 * The view the Sales Summary opens with: the period handed over by the dashboard, anchored on
 * today. A valid custom range from the dashboard is kept as a Custom view.
 */
export function initialOwnerSalesView(
  initialPeriod: 'Today' | 'Daily' | 'Weekly' | 'Monthly' | 'Custom',
  today: string,
  customStart?: string,
  customEnd?: string,
): OwnerSalesInitialView {
  if (
    initialPeriod === 'Custom' &&
    customStart && customEnd &&
    isDateKey(customStart) && isDateKey(customEnd) &&
    customStart <= customEnd
  ) {
    return { period: 'Custom', anchor: customEnd > today ? today : customEnd, fromText: customStart, toText: customEnd };
  }
  const period = initialPeriod === 'Weekly' ? 'Weekly' : initialPeriod === 'Monthly' ? 'Monthly' : 'Daily';
  return { period, anchor: today, ...ownerSalesPeriodSelection(period, today) };
}
