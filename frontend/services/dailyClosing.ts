// ST-06 c7–c10 Opening Float and Daily Closing, and the OW-11 / OM-11 Daily
// Closing Report (Requirements Engineering v6 ST-06 c3). Staff record the
// opening float once at the start of the business day, before the first sale,
// and the closing cash count at the end. The server (record_opening_float,
// record_daily_closing) stores both and computes the cash comparison; these
// helpers parse input and build the report.

import { manilaBusinessDate } from './staffDailySession.ts';

export type DailyClosing = {
  id: string;
  reference: string;
  branchId: string;
  businessDate: string;
  openingFloat: number;
  closingCashCount: number;
  recordedCashSales: number;
  voidedCashSales: number;
  expectedCash: number;
  overShort: number;
  cashTransactionCount: number;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: string;
};

export function mapDailyClosingRow(
  row: {
    id: string;
    reference: string;
    branch_id: string;
    business_date: string;
    opening_float: number | string;
    closing_cash_count: number | string;
    recorded_cash_sales: number | string;
    voided_cash_sales: number | string;
    expected_cash: number | string;
    over_short: number | string;
    cash_transaction_count: number;
    recorded_by: string;
    recorded_at: string;
  },
  names: Map<string, string> = new Map(),
): DailyClosing {
  return {
    id: row.id,
    reference: row.reference,
    branchId: row.branch_id,
    businessDate: row.business_date,
    openingFloat: Number(row.opening_float),
    closingCashCount: Number(row.closing_cash_count),
    recordedCashSales: Number(row.recorded_cash_sales),
    voidedCashSales: Number(row.voided_cash_sales),
    expectedCash: Number(row.expected_cash),
    overShort: Number(row.over_short),
    cashTransactionCount: Number(row.cash_transaction_count),
    recordedBy: row.recorded_by,
    recordedByName: names.get(row.recorded_by) ?? null,
    recordedAt: row.recorded_at,
  };
}

export type OpeningFloat = {
  id: string;
  reference: string;
  branchId: string;
  businessDate: string;
  amount: number;
  recordedBy: string;
  recordedByName: string | null;
  recordedAt: string;
};

export function mapOpeningFloatRow(
  row: {
    id: string;
    reference: string;
    branch_id: string;
    business_date: string;
    amount: number | string;
    recorded_by: string;
    recorded_at: string;
  },
  names: Map<string, string> = new Map(),
): OpeningFloat {
  return {
    id: row.id,
    reference: row.reference,
    branchId: row.branch_id,
    businessDate: row.business_date,
    amount: Number(row.amount),
    recordedBy: row.recorded_by,
    recordedByName: names.get(row.recorded_by) ?? null,
    recordedAt: row.recorded_at,
  };
}

/** Reads a peso amount typed by staff ("1,500", "1500.50"). Returns null when invalid. */
export function parseCashAmount(text: string): number | null {
  const cleaned = text.replace(/[₱,\s]/g, '');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export type CashAmountInput = { valid: true; amount: number } | { valid: false; error: string };

/** ST-06 c7: the opening float is required, in pesos, with at most two decimals. */
export function validateOpeningFloatInput(text: string): CashAmountInput {
  if (!text.trim()) return { valid: false, error: 'Enter the opening float.' };
  const amount = parseCashAmount(text);
  if (amount === null) return { valid: false, error: 'Enter the opening float in pesos, for example 1000 or 1000.50.' };
  return { valid: true, amount };
}

/** ST-06 c8: the closing cash count is required, in pesos, with at most two decimals. */
export function validateClosingCashCountInput(text: string): CashAmountInput {
  if (!text.trim()) return { valid: false, error: 'Enter the closing cash count.' };
  const amount = parseCashAmount(text);
  if (amount === null) return { valid: false, error: 'Enter the cash count in pesos, for example 4250 or 4250.75.' };
  return { valid: true, amount };
}

export function formatPeso(value: number): string {
  return `₱${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type OverShort = { kind: 'over' | 'short' | 'balanced'; text: string };

/** OW-11 c6 / OM-11 c4: over and short are labelled with text; a balanced closing shows zero. */
export function overShortLabel(amount: number): OverShort {
  const cents = Math.round(amount * 100);
  if (cents > 0) return { kind: 'over', text: `Over ${formatPeso(cents / 100)}` };
  if (cents < 0) return { kind: 'short', text: `Short ${formatPeso(cents / 100)}` };
  return { kind: 'balanced', text: 'Balanced (₱0.00)' };
}

export const DAILY_CLOSING_PERIODS = ['Today', 'Last 7 days', 'This month', 'Last month'] as const;
export type DailyClosingPeriod = (typeof DAILY_CLOSING_PERIODS)[number];

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The business dates of a report period, newest first, never in the future (Manila time). */
export function dailyClosingPeriodDates(period: DailyClosingPeriod, now: Date = new Date()): string[] {
  const today = manilaBusinessDate(now);
  let start: string;
  let end = today;
  if (period === 'Today') {
    start = today;
  } else if (period === 'Last 7 days') {
    start = shiftDate(today, -6);
  } else if (period === 'This month') {
    start = `${today.slice(0, 7)}-01`;
  } else {
    const firstOfThisMonth = `${today.slice(0, 7)}-01`;
    end = shiftDate(firstOfThisMonth, -1);
    start = `${end.slice(0, 7)}-01`;
  }
  const dates: string[] = [];
  for (let date = end; date >= start; date = shiftDate(date, -1)) dates.push(date);
  return dates;
}

export type DailyClosingReportRow = {
  key: string;
  branchId: string;
  branchName: string;
  businessDate: string;
  /** null: "No closing recorded" (OW-11 c7 / OM-11 c5). */
  closing: DailyClosing | null;
};

/** One row per branch and business date of the period, newest first. */
export function buildDailyClosingReportRows(input: {
  closings: DailyClosing[];
  branches: Array<{ id: string; name: string }>;
  dates: string[];
  branchId?: string | null;
}): DailyClosingReportRow[] {
  const byKey = new Map(input.closings.map((closing) => [`${closing.branchId}:${closing.businessDate}`, closing]));
  const branches = input.branchId ? input.branches.filter((branch) => branch.id === input.branchId) : input.branches;
  const dates = [...input.dates].sort((left, right) => right.localeCompare(left));
  return dates.flatMap((date) => branches.map((branch) => ({
    key: `${branch.id}:${date}`,
    branchId: branch.id,
    branchName: branch.name,
    businessDate: date,
    closing: byKey.get(`${branch.id}:${date}`) ?? null,
  })));
}

export function summarizeDailyClosingRows(rows: DailyClosingReportRow[]): {
  closed: number;
  missing: number;
  totalOver: number;
  totalShort: number;
} {
  let closed = 0;
  let missing = 0;
  let over = 0;
  let short = 0;
  for (const row of rows) {
    if (!row.closing) {
      missing += 1;
      continue;
    }
    closed += 1;
    const cents = Math.round(row.closing.overShort * 100);
    if (cents > 0) over += cents;
    if (cents < 0) short += -cents;
  }
  return { closed, missing, totalOver: over / 100, totalShort: short / 100 };
}

export const OPENING_FLOAT_REQUIRED_MESSAGE = 'Record the opening float for this business day before the closing.';

const KNOWN_DAILY_CLOSING_MESSAGES = [
  'The closing for this business day has already been recorded.',
  'The opening float for this business day has already been recorded.',
  OPENING_FLOAT_REQUIRED_MESSAGE,
  'Enter the opening float.',
  'Enter the closing cash count.',
  'Cash amounts cannot be negative.',
  'Cash amounts can have at most two decimal places.',
  'Cash amounts are too large.',
  'This branch is not your assigned branch.',
];

export function dailyClosingErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? '';
  if (error?.code === '23505') {
    return /opening_float/.test(message)
      ? 'The opening float for this business day has already been recorded.'
      : 'The closing for this business day has already been recorded.';
  }
  const known = KNOWN_DAILY_CLOSING_MESSAGES.find((text) => message.includes(text));
  if (known) return known;
  if (/fetch|network|timeout/i.test(message)) return 'No connection. Check the internet connection and try again.';
  if (isMissingDailyClosingSupport(error)) return 'Daily closing is not available yet. Ask the owner to update the system.';
  return 'Unable to save. Please try again.';
}

export function isMissingDailyClosingSupport(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || error.code === 'PGRST202'
    || error.code === '42883'
    || /daily_closings|daily_opening_floats|record_daily_closing|record_opening_float/.test(error.message ?? '')
      && /does not exist|could not find|schema cache/i.test(error.message ?? '');
}
