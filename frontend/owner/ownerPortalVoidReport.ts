// OW-10 Void Report on the Owner Web Portal: every sale whose void request the
// owner approved (c6), with the staff reason and requester (c3, c4), the
// approving owner and time (c5), newest sale first, with the count and total
// amount (c7). Pending and rejected requests are not voids and are not listed.

export type WebVoidReportSource = {
  id: string;
  reference: string;
  branchId: string;
  branchName: string;
  reason: string;
  requestedByName: string | null;
  requestedAt: string;
  status: string;
  decidedByName: string | null;
  decidedAt: string | null;
  sale: { transactionReference: string; totalAmount: number; createdAt: string } | null;
};

export type WebVoidReportRow = {
  id: string;
  transactionReference: string;
  branchName: string;
  saleCreatedAt: string | null;
  saleTotal: number;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approvedBy: string;
  approvedAt: string | null;
};

export const WEB_VOID_REPORT_HEADERS = [
  'Reference', 'Branch', 'Sale date & time', 'Sale total', 'Reason',
  'Requested by · date & time', 'Approved by · date & time',
];

export function buildWebVoidReport(
  requests: WebVoidReportSource[],
  filter: { start: Date; end: Date; branchId: string | null },
): { rows: WebVoidReportRow[]; count: number; total: number } {
  const start = filter.start.getTime();
  const end = filter.end.getTime();
  const rows = requests
    .filter((row) => row.status === 'approved')
    .filter((row) => !filter.branchId || row.branchId === filter.branchId)
    .filter((row) => {
      // The period is the sale's original date (c2); the request date is the fallback.
      const at = Date.parse(row.sale?.createdAt ?? row.requestedAt);
      return Number.isFinite(at) && at >= start && at < end;
    })
    .sort((left, right) => (right.sale?.createdAt ?? right.requestedAt).localeCompare(left.sale?.createdAt ?? left.requestedAt))
    .map((row): WebVoidReportRow => ({
      id: row.id,
      transactionReference: row.sale?.transactionReference ?? row.reference,
      branchName: row.branchName,
      saleCreatedAt: row.sale?.createdAt ?? null,
      saleTotal: row.sale?.totalAmount ?? 0,
      reason: row.reason,
      requestedBy: row.requestedByName ?? 'Staff account',
      requestedAt: row.requestedAt,
      approvedBy: row.decidedByName ?? 'Owner',
      approvedAt: row.decidedAt,
    }));
  let cents = 0;
  for (const row of rows) cents += Math.round(row.saleTotal * 100);
  return { rows, count: rows.length, total: cents / 100 };
}
