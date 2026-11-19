import { getManilaReportingRange, manilaDateKey } from '../services/businessDaySettings.ts';
import { isDateKey, ownerSalesPeriodSelection } from './ownerSalesCalendar.ts';

export type OwnerSalesPeriod = 'Today' | 'Daily' | 'Weekly' | 'Monthly' | 'Custom';

export type OwnerSalesDateRange = {
  start: Date;
  end: Date;
  startText: string;
  endText: string;
};

/** Maps the Sales workspace labels onto the shared Manila business-day rules. */
export function getOwnerSalesDateRange(
  period: OwnerSalesPeriod,
  customStart: string,
  customEnd: string,
  now = new Date(),
): OwnerSalesDateRange | null {
  const sharedPeriod = period === 'Today' || period === 'Daily'
    ? 'Today'
    : period === 'Weekly'
      ? 'This Week'
      : period === 'Monthly'
        ? 'This Month'
        : 'Custom';
  const range = getManilaReportingRange(sharedPeriod, now, customStart, customEnd);
  if (!range) return null;

  return {
    ...range,
    startText: manilaDateKey(range.start),
    endText: manilaDateKey(new Date(range.end.getTime() - 1)),
  };
}

/**
 * Range for the Sales Summary tabs. Daily, Weekly and Monthly follow the date the owner picked
 * (`anchor`, falling back to today when it is empty) instead of always meaning "now". Today and
 * Custom keep their usual meaning. Returns null for text that is not a valid date.
 */
export function getOwnerSalesMonitoringRange(
  period: OwnerSalesPeriod,
  anchor: string,
  customEnd: string,
  now = new Date(),
): OwnerSalesDateRange | null {
  if (period === 'Today' || period === 'Custom') return getOwnerSalesDateRange(period, anchor, customEnd, now);
  const day = anchor.trim() === '' ? manilaDateKey(now) : anchor.trim();
  if (!isDateKey(day)) return null;
  const { fromText, toText } = ownerSalesPeriodSelection(period, day);
  return getOwnerSalesDateRange('Custom', fromText, toText, now);
}
