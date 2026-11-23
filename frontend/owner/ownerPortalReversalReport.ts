// OW-20 Reversal Report on the Owner Web Portal: entries reversed with the
// owner's approval, with the original entry (still kept) and the reversing
// Entry Reversal entry that was posted. Rejected requests are not listed (c7).
import { entryReversalTypeLabel, type EntryReversalRequest } from '../services/entryReversals.ts';

export type ReversingEntry = { reference: string; quantity: number; unit: string; transactionDate: string };

export const REVERSAL_REPORT_HEADERS = [
  'Entry type · reference', 'Item', 'Quantity', 'Branch', 'Original entry',
  'Reason · requested by', 'Approved by · date & time', 'Reversing entry · date & time',
];

const quantityText = (quantity: number, unit: string) =>
  `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(quantity)} ${unit}`;

export function buildWebReversalReport(input: {
  requests: Array<EntryReversalRequest & { branchName: string }>;
  reversingEntries: ReadonlyMap<string, ReversingEntry[]>;
  range: { start: Date; end: Date };
  branchId: string | null;
  formatDateTime: (iso: string) => string;
}): { rows: string[][]; summary: Array<[string, string]>; references: string[] } {
  const start = input.range.start.getTime();
  const end = input.range.end.getTime();
  const approved = input.requests
    .filter((request) => request.status === 'approved' && request.decidedAt)
    .filter((request) => !input.branchId || request.branchId === input.branchId)
    .filter((request) => {
      const at = Date.parse(request.decidedAt as string);
      return Number.isFinite(at) && at >= start && at < end;
    })
    .sort((left, right) => (right.decidedAt as string).localeCompare(left.decidedAt as string));

  const rows = approved.map((request) => {
    const posted = input.reversingEntries.get(request.reference) ?? [];
    return [
      `${entryReversalTypeLabel(request.entryType)}\n${request.entryReference}`,
      request.itemName,
      quantityText(request.quantity, request.unit),
      request.branchName,
      `Kept in history\nRecorded ${input.formatDateTime(request.entryRecordedAt)}`,
      `${request.reason}\n${request.requestedByName ?? 'Staff account'}`,
      `${request.decidedByName ?? 'Owner'}\n${input.formatDateTime(request.decidedAt as string)}`,
      posted.length
        ? posted.map((entry) => `${entry.reference} (${quantityText(entry.quantity, entry.unit)})\n${input.formatDateTime(entry.transactionDate)}`).join('\n')
        : 'Not found',
    ];
  });

  const byType = new Map<string, number>();
  for (const request of approved) {
    const label = entryReversalTypeLabel(request.entryType);
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }
  return {
    rows,
    summary: [['Reversed entries', String(approved.length)], ...[...byType.entries()].map(([label, count]): [string, string] => [label, String(count)])],
    references: approved.map((request) => request.reference),
  };
}
