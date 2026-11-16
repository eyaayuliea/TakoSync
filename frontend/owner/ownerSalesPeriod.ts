import { getManilaReportingRange, manilaDateKey } from '../services/businessDaySettings.ts';

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
