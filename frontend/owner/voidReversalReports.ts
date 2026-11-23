// OM-10 Void Report and OM-22 Reversal Report: read-only lists of approved
// requests. Rejected requests are never listed (OM-22 c4).

export function approvedOnly<T extends { status: string }>(requests: T[]): T[] {
  return requests.filter((request) => request.status === 'approved');
}

/** OM-10 c5: the number and total amount of the voided sales shown. */
export function summarizeVoidReport(rows: Array<{ sale: { totalAmount: number } | null }>): { count: number; total: number } {
  let cents = 0;
  for (const row of rows) cents += Math.round((row.sale?.totalAmount ?? 0) * 100);
  return { count: rows.length, total: cents / 100 };
}

/** Newest first by the given date. */
export function newestFirst<T>(rows: T[], dateOf: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((left, right) => (dateOf(right) ?? '').localeCompare(dateOf(left) ?? ''));
}
