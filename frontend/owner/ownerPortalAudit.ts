// OW-29 Inventory Audit History on the Owner Web Portal: every sale, inventory
// movement, count, count revision, discrepancy and adjustment as one read-only
// list of records, each with its details and related records.
import { formatPeso } from '../services/money.ts';
import { lossCategory } from './ownerPortalMovementReports.ts';

export const AUDIT_RECORD_TYPES = [
  'All types', 'Completed Sale', 'Voided Sale', 'Sales Consumption', 'Stock-In', 'Waste', 'Spillage', 'Spoilage',
  'Physical Inventory Count', 'Count Revision', 'Discrepancy', 'Authorized Adjustment', 'Entry Reversal', 'Void Reversal', 'Other Movement',
] as const;
export type AuditRecordType = Exclude<(typeof AUDIT_RECORD_TYPES)[number], 'All types'>;

export type AuditRecord = {
  id: string;
  type: AuditRecordType;
  reference: string;
  branchId: string;
  branch: string;
  item: string;
  quantity: string;
  employee: string;
  at: string;
  details: Array<[string, string]>;
  related: string[]; // ids of related records
};

type Sale = {
  id: string; transaction_reference: string; branch_id: string; total_amount: number | string; payment_method: string;
  status?: string | null; inventory_processing_status?: string | null; created_at: string; recorded_by_name?: string;
  cash_received?: number | string | null; change_amount?: number | string | null;
};
type SaleItem = { sale_id: string; product_name: string; variant_label?: string | null; quantity: number | string; subtotal: number | string };
type Movement = {
  id: string; reference: string; branch_id: string; ingredient_id: string; type: string; quantity: number; unit: string;
  movement?: number; before_quantity?: number; after_quantity?: number; reason: string; notes: string; transaction_date: string; actor_name?: string;
};
type Check = { id: string; reference: string; branch_id: string; status: string; remarks?: string; created_at: string; submitted_by_name?: string };
type CountLine = { id: string; daily_stock_check_id: string; ingredient_id: string; recorded_quantity: number; physical_quantity: number; difference: number; unit: string };
type Review = {
  countLineId: string; reference: string; branchId: string; branch: string; staff: string; ingredient: string; unit: string;
  expected: number; actual: number; correctedActual: number; correctionStatus: 'pending' | 'approved' | 'rejected' | null;
  correctionReason: string; difference: number; remarks: string; submittedAt: string; status: string;
  decisionOwner: string | null; decisionAt: string | null; adjustment: { movementReference: string; approvingOwner: string; approvedAt: string; reason: string } | null;
};

const q = (value: number | string, unit = '') => `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Math.abs(Number(value)))}${unit ? ` ${unit}` : ''}`;
const peso = (value: number | string) => formatPeso(Number(value));

function movementType(movement: Movement): AuditRecordType {
  switch (movement.type) {
    case 'stock_in': return 'Stock-In';
    case 'sales_consumption': return 'Sales Consumption';
    case 'waste':
    case 'spoilage': {
      const category = lossCategory(movement);
      return category === 'Other' ? 'Waste' : category;
    }
    case 'adjustment': return 'Authorized Adjustment';
    case 'entry_reversal': return 'Entry Reversal';
    case 'void_reversal': return 'Void Reversal';
    default: return 'Other Movement';
  }
}

/** OW-29 c2–c7: the records of the loaded period, linked to each other. */
export function buildAuditRecords(input: {
  sales: readonly Sale[];
  items: readonly SaleItem[];
  movements: readonly Movement[];
  checks: readonly Check[];
  countLines: readonly CountLine[];
  reviews: readonly Review[];
  branchName: (branchId: string) => string;
  itemName: (branchId: string, ingredientId: string) => string;
  formatDateTime: (iso: string) => string;
}): AuditRecord[] {
  const records: AuditRecord[] = [];
  const saleRecordId = (id: string) => `sale:${id}`;
  const saleIdByReference = new Map(input.sales.map((sale) => [sale.transaction_reference, sale.id]));
  const movementIdByReference = new Map(input.movements.map((movement) => [movement.reference, movement.id]));
  const lineById = new Map(input.countLines.map((line) => [line.id, line]));
  const checkById = new Map(input.checks.map((check) => [check.id, check]));
  const reviewByLine = new Map(input.reviews.map((review) => [review.countLineId, review]));
  const related = new Map<string, Set<string>>();
  const link = (left: string, right: string) => {
    for (const [from, to] of [[left, right], [right, left]]) {
      const set = related.get(from) ?? new Set<string>();
      set.add(to);
      related.set(from, set);
    }
  };

  for (const sale of input.sales) {
    const voided = sale.status === 'voided';
    if (!voided && !(sale.status === 'completed' && sale.inventory_processing_status === 'completed')) continue;
    const lines = input.items.filter((item) => item.sale_id === sale.id);
    const pieces = lines.reduce((sum, item) => sum + Number(item.quantity), 0);
    records.push({
      id: saleRecordId(sale.id),
      type: voided ? 'Voided Sale' : 'Completed Sale',
      reference: sale.transaction_reference,
      branchId: sale.branch_id,
      branch: input.branchName(sale.branch_id),
      item: lines.map((item) => `${item.product_name}${item.variant_label ? ` ${item.variant_label}` : ''} ×${Number(item.quantity)}`).join(', ') || '—',
      quantity: `${pieces} item${pieces === 1 ? '' : 's'}`,
      employee: sale.recorded_by_name ?? 'Employee unavailable',
      at: sale.created_at,
      details: [
        ['Status', voided ? 'Voided (kept in history, not counted)' : 'Completed'],
        ['Total', peso(sale.total_amount)],
        ['Payment', sale.payment_method],
        ...(sale.cash_received !== null && sale.cash_received !== undefined && sale.cash_received !== ''
          ? [['Cash received', peso(sale.cash_received)] as [string, string], ['Change', peso(sale.change_amount ?? 0)] as [string, string]]
          : []),
      ],
      related: [],
    });
  }

  for (const movement of input.movements) {
    const id = `movement:${movement.id}`;
    const type = movementType(movement);
    records.push({
      id,
      type,
      reference: movement.reference,
      branchId: movement.branch_id,
      branch: input.branchName(movement.branch_id),
      item: input.itemName(movement.branch_id, movement.ingredient_id),
      quantity: `${(movement.movement ?? 0) < 0 ? '−' : '+'}${q(movement.quantity, movement.unit)}`,
      employee: movement.actor_name ?? 'Employee unavailable',
      at: movement.transaction_date,
      details: [
        ['Reason', movement.reason || '—'],
        ...(movement.before_quantity !== undefined && movement.after_quantity !== undefined
          ? [['Balance', `${q(movement.before_quantity, movement.unit)} → ${q(movement.after_quantity, movement.unit)}`] as [string, string]]
          : []),
        ...(movement.notes ? [['Notes', movement.notes] as [string, string]] : []),
      ],
      related: [],
    });
    // c5, c7: the sale of a consumption or void reversal, the original of an entry reversal, the count of an adjustment.
    const saleId = /^sale:(.+)$/.exec(movement.notes.trim())?.[1] ?? saleIdByReference.get(/^void of sale\s+(.+)$/i.exec(movement.reason.trim())?.[1] ?? '');
    if (saleId) link(id, saleRecordId(saleId));
    const original = /^reversal of\s+(.+)$/i.exec(movement.reason.trim())?.[1];
    if (type === 'Entry Reversal' && original && movementIdByReference.has(original)) link(id, `movement:${movementIdByReference.get(original)}`);
    const lineId = /count line ([0-9a-f-]{36})/i.exec(movement.notes)?.[1];
    if (lineId) link(id, `count:${lineId}`);
  }

  for (const line of input.countLines) {
    const check = checkById.get(line.daily_stock_check_id);
    if (!check) continue;
    const id = `count:${line.id}`;
    records.push({
      id,
      type: 'Physical Inventory Count',
      reference: check.reference,
      branchId: check.branch_id,
      branch: input.branchName(check.branch_id),
      item: input.itemName(check.branch_id, line.ingredient_id),
      quantity: `${q(line.physical_quantity, line.unit)} counted (expected ${q(line.recorded_quantity, line.unit)})`,
      employee: check.submitted_by_name ?? 'Employee unavailable',
      at: check.created_at,
      details: [['Difference', `${line.difference > 0 ? '+' : line.difference < 0 ? '−' : ''}${q(line.difference, line.unit)}`], ['Remarks', check.remarks?.trim() || '—'], ['Count status', check.status]],
      related: [],
    });
    const review = reviewByLine.get(line.id);
    if (review) link(id, `discrepancy:${line.id}`);
  }

  for (const review of input.reviews) {
    const discrepancyId = `discrepancy:${review.countLineId}`;
    records.push({
      id: discrepancyId,
      type: 'Discrepancy',
      reference: review.reference,
      branchId: review.branchId,
      branch: review.branch,
      item: review.ingredient,
      quantity: `${review.difference > 0 ? '+' : review.difference < 0 ? '−' : ''}${q(review.difference, review.unit)}`,
      employee: review.staff,
      at: review.submittedAt,
      details: [
        ['Expected (saved)', q(review.expected, review.unit)],
        ['Actual', q(review.actual, review.unit)],
        ['Review status', review.status === 'Validated' ? 'Adjusted' : review.status],
        ['Remarks', review.remarks.trim() || '—'],
        ...(review.adjustment ? [['Adjustment', `${review.adjustment.movementReference} by ${review.adjustment.approvingOwner}`] as [string, string]] : []),
      ],
      related: [],
    });
    if (lineById.has(review.countLineId)) link(discrepancyId, `count:${review.countLineId}`);
    if (review.correctionStatus) {
      // c6: a count revision with original value, revised value, editor, date and time.
      const revisionId = `revision:${review.countLineId}`;
      records.push({
        id: revisionId,
        type: 'Count Revision',
        reference: review.reference,
        branchId: review.branchId,
        branch: review.branch,
        item: review.ingredient,
        quantity: `${q(review.actual, review.unit)} → ${q(review.correctedActual, review.unit)}`,
        employee: review.staff,
        at: review.submittedAt,
        details: [
          ['Original value', q(review.actual, review.unit)],
          ['Revised value', q(review.correctedActual, review.unit)],
          ['Editor', review.staff],
          ['Reason', review.correctionReason || '—'],
          ['Outcome', review.correctionStatus === 'pending' ? 'Pending owner decision'
            : `${review.correctionStatus === 'approved' ? 'Approved' : 'Rejected'} by ${review.decisionOwner ?? 'Owner'}${review.decisionAt ? ` · ${input.formatDateTime(review.decisionAt)}` : ''}`],
        ],
        related: [],
      });
      link(revisionId, discrepancyId);
      if (lineById.has(review.countLineId)) link(revisionId, `count:${review.countLineId}`);
    }
  }

  const known = new Set(records.map((record) => record.id));
  for (const record of records) record.related = [...(related.get(record.id) ?? [])].filter((id) => known.has(id));
  return records.sort((left, right) => right.at.localeCompare(left.at) || left.reference.localeCompare(right.reference));
}

/** OW-29 c1, c10: type, branch, date range and partial reference filters. */
export function filterAuditRecords(
  records: readonly AuditRecord[],
  input: { type: string; branchId: string | null; reference: string; range?: { start: Date; end: Date } | null },
): AuditRecord[] {
  const reference = input.reference.trim().toLowerCase();
  return records.filter((record) =>
    (input.type === 'All types' || record.type === input.type)
    && (!input.range || (Date.parse(record.at) >= input.range.start.getTime() && Date.parse(record.at) < input.range.end.getTime()))
    && (!input.branchId || record.branchId === input.branchId)
    && (!reference || record.reference.toLowerCase().includes(reference)));
}

export const AUDIT_HEADERS = ['Reference', 'Type', 'Branch', 'Item', 'Quantity', 'Employee', 'Date & Time'];

export function auditRow(record: AuditRecord, formatDateTime: (iso: string) => string): string[] {
  return [record.reference, record.type, record.branch, record.item, record.quantity, record.employee, formatDateTime(record.at)];
}
