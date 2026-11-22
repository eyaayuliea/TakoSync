// OW-11 Daily Closing Report on the Owner Web Portal: one row per branch and
// business day of the period, with "No closing recorded" for days without one.
import {
  buildDailyClosingReportRows,
  formatPeso,
  overShortLabel,
  summarizeDailyClosingRows,
  type DailyClosing,
} from '../services/dailyClosing.ts';

const DAY = 24 * 60 * 60 * 1000;

function manilaDateKey(at: number): string {
  return new Date(at + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The Manila business dates of a [start, end) range, newest first, never after today. */
export function businessDatesInRange(range: { start: Date; end: Date }, now: Date = new Date()): string[] {
  const today = manilaDateKey(now.getTime());
  const dates: string[] = [];
  for (let at = range.end.getTime() - DAY; at >= range.start.getTime(); at -= DAY) {
    const key = manilaDateKey(at);
    if (key <= today && !dates.includes(key)) dates.push(key);
  }
  return dates;
}

export const DAILY_CLOSING_HEADERS = [
  'Business date', 'Branch', 'Recorded by', 'Opening float', 'Cash sales (excl. voided)',
  'Voided cash sales (already excluded)', 'Expected cash', 'Closing cash count', 'Over / short',
];

export function buildWebDailyClosingReport(input: {
  closings: DailyClosing[];
  branches: Array<{ id: string; name: string }>;
  range: { start: Date; end: Date };
  branchId: string | null;
  now?: Date;
  formatDate: (businessDate: string) => string;
  formatDateTime: (iso: string) => string;
}): { rows: string[][]; summary: Array<[string, string]> } {
  const reportRows = buildDailyClosingReportRows({
    closings: input.closings,
    branches: input.branches,
    dates: businessDatesInRange(input.range, input.now),
    branchId: input.branchId,
  });
  const rows = reportRows.map((row) => {
    const closing = row.closing;
    if (!closing) return [input.formatDate(row.businessDate), row.branchName, 'No closing recorded', '—', '—', '—', '—', '—', '—'];
    // c3: recorded cash sales exclude voided cash sales; c4: expected = float + sales − voided.
    const netCashSales = Math.round((closing.recordedCashSales - closing.voidedCashSales) * 100) / 100;
    return [
      input.formatDate(row.businessDate),
      row.branchName,
      `${closing.recordedByName ?? 'Staff account'}\n${input.formatDateTime(closing.recordedAt)}`,
      formatPeso(closing.openingFloat),
      formatPeso(netCashSales),
      formatPeso(closing.voidedCashSales),
      formatPeso(closing.expectedCash),
      formatPeso(closing.closingCashCount),
      overShortLabel(closing.overShort).text,
    ];
  });
  const totals = summarizeDailyClosingRows(reportRows);
  return {
    rows,
    summary: [
      ['Closings recorded', String(totals.closed)],
      ['No closing recorded', String(totals.missing)],
      ['Total over', formatPeso(totals.totalOver)],
      ['Total short', formatPeso(totals.totalShort)],
    ],
  };
}
