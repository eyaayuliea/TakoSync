// OW-05 c3–c4 / OW-12 c3: what is still missing from the report setup, or ''
// when the owner can select Generate Report.
import type { ReportingPeriod } from '../services/businessDaySettings';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_KEY.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function reportSetupMessage(setup: {
  report: string | null;
  period: ReportingPeriod;
  startDate: string;
  endDate: string;
  /** Snapshot reports (Expected Stock) are not date-filtered. */
  usesPeriod?: boolean;
}): string {
  if (!setup.report) return 'Select a report type.';
  if (setup.usesPeriod === false || setup.period !== 'Custom') return '';
  const start = setup.startDate.trim();
  const end = setup.endDate.trim();
  if (!start || !end) return 'Enter the start and end dates.';
  if (!isCalendarDate(start)) return 'Enter the start date as YYYY-MM-DD.';
  if (!isCalendarDate(end)) return 'Enter the end date as YYYY-MM-DD.';
  if (end < start) return 'The end date cannot be earlier than the start date.';
  return '';
}
