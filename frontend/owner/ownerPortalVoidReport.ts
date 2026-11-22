// OW-10 Void Report on the Owner Web Portal. Every voided sale whose original sale
// falls in the reporting period, whatever its review status (c6: flagging does not
// remove a void), newest sale first, with the count and total amount (c7).

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
  decisionReason: string | null;
  sale: { transactionReference: string; totalAmount: number; createdAt: string } | null;
};

export type WebVoidReportRow = {
  id: string;
  transactionReference: string;
  branchName: string;
  saleCreatedAt: string | null;
  saleTotal: number;
  reason: string;
  voidedBy: string;
  voidedAt: string;
  reviewStatus: 'Pending Review' | 'Reviewed' | 'Flagged';
  reviewedBy: string | null;
  reviewedAt: string | null;
  flagReason: string | null;
};

const REVIEW_STATUS: Record<string, WebVoidReportRow['reviewStatus']> = {
  pending_review: 'Pending Review',
  reviewed: 'Reviewed',
  flagged: 'Flagged',
};

/** Only voids that took effect: legacy request rows (pending / rejected) never voided a sale. */
function isVoid(row: WebVoidReportSource): boolean {
  return row.status in REVIEW_STATUS;
}

export function buildWebVoidReport(
  voids: WebVoidReportSource[],
  filter: { start: Date; end: Date; branchId: string | null },
): { rows: WebVoidReportRow[]; count: number; total: number } {
  const start = filter.start.getTime();
  const end = filter.end.getTime();
  const rows = voids
    .filter(isVoid)
    .filter((row) => !filter.branchId || row.branchId === filter.branchId)
    .filter((row) => {
      // The period is the sale's original date (c2); the void date is the fallback.
      const at = Date.parse(row.sale?.createdAt ?? row.requestedAt);
      return Number.isFinite(at) && at >= start && at < end;
    })
    .sort((left, right) => (right.sale?.createdAt ?? right.requestedAt).localeCompare(left.sale?.createdAt ?? left.requestedAt))
    .map((row): WebVoidReportRow => {
      const reviewStatus = REVIEW_STATUS[row.status];
      const reviewed = reviewStatus !== 'Pending Review';
      return {
        id: row.id,
        transactionReference: row.sale?.transactionReference ?? row.reference,
        branchName: row.branchName,
        saleCreatedAt: row.sale?.createdAt ?? null,
        saleTotal: row.sale?.totalAmount ?? 0,
        reason: row.reason,
        voidedBy: row.requestedByName ?? 'Staff account',
        voidedAt: row.requestedAt,
        reviewStatus,
        reviewedBy: reviewed ? row.decidedByName ?? 'Owner' : null,
        reviewedAt: reviewed ? row.decidedAt : null,
        flagReason: reviewStatus === 'Flagged' ? row.decisionReason : null,
      };
    });
  let cents = 0;
  for (const row of rows) cents += Math.round(row.saleTotal * 100);
  return { rows, count: rows.length, total: cents / 100 };
}
