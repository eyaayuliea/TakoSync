// OW-16 Sales Consumption Report and OW-17 Waste and Spillage Report on the
// Owner Web Portal.
import type { SalesConsumptionRecord } from './salesConsumptionRepository';

const quantityText = (quantity: number, unit: string) =>
  `${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(Math.abs(quantity))} ${unit}`;

type Total = { label: string; unit: string; quantity: number };

function addTotal(totals: Map<string, Total>, label: string, unit: string, quantity: number): void {
  const key = `${label}\u0000${unit}`;
  const total = totals.get(key) ?? { label, unit, quantity: 0 };
  total.quantity = Math.round((total.quantity + Math.abs(quantity)) * 1000) / 1000;
  totals.set(key, total);
}

const totalPairs = (totals: Map<string, Total>): Array<[string, string]> =>
  [...totals.values()]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((total) => [total.label, quantityText(total.quantity, total.unit)]);

export const SALES_CONSUMPTION_HEADERS = [
  'Ingredient', 'Quantity consumed', 'Branch', 'Date & time', 'Sale', 'Recorded by', 'Status',
];

/**
 * OW-16 c2–c7: each consumption row with its sale; consumption of a voided sale
 * is marked as reversed by its Void Reversal entry and left out of the totals.
 */
export function buildWebSalesConsumptionReport(
  records: SalesConsumptionRecord[],
  formatDateTime: (iso: string) => string,
): { rows: string[][]; totals: Array<[string, string]>; voidedCount: number } {
  const totals = new Map<string, Total>();
  let voidedCount = 0;
  const rows = records.map((record) => {
    if (record.saleVoided) voidedCount += 1;
    else addTotal(totals, record.ingredientName, record.unit, record.quantity);
    const status = record.saleVoided
      ? record.voidReversal
        ? `Sale voided · reversed by ${record.voidReversal.reference} (+${quantityText(record.voidReversal.quantity, record.voidReversal.unit)})`
        : 'Sale voided · reversal not found'
      : record.updateFailed ? 'Update failed · review' : 'Counted';
    return [
      record.ingredientName,
      quantityText(record.quantity, record.unit),
      record.branchName,
      formatDateTime(record.createdAt),
      record.saleReference,
      record.recordedBy,
      status,
    ];
  });
  return { rows, totals: totalPairs(totals), voidedCount };
}

export type LossMovement = {
  id: string;
  branch_id: string;
  ingredient_id: string;
  reference: string;
  type: string;
  reason: string;
  notes: string;
  quantity: number;
  unit: string;
  transaction_date: string;
  actor_name?: string | null;
};

export type LossCategory = 'Waste' | 'Spillage' | 'Spoilage' | 'Other';

/** OW-17 c2: Spoilage has its own movement type; the others are Waste entries named by their reason. */
export function lossCategory(movement: Pick<LossMovement, 'type' | 'reason'>): LossCategory {
  if (movement.type === 'spoilage') return 'Spoilage';
  const reason = movement.reason.trim();
  if (/^spillage/i.test(reason)) return 'Spillage';
  if (/^other/i.test(reason)) return 'Other';
  return 'Waste';
}

export const WASTE_SPILLAGE_HEADERS = [
  'Ingredient', 'Quantity lost', 'Category', 'Branch', 'Date & time', 'Remarks', 'Recorded by', 'Status',
];

/**
 * OW-17 c2–c6: waste and spoilage movements only (never Stock-In or Sales
 * Consumption), each with its category, remarks and recorder; reversed entries
 * are marked and left out of the totals per ingredient and per category.
 */
export function buildWebWasteReport(input: {
  movements: LossMovement[];
  reversedIds: ReadonlySet<string>;
  itemName: (movement: LossMovement) => string;
  branchName: (movement: LossMovement) => string;
  formatDateTime: (iso: string) => string;
}): { rows: string[][]; byIngredient: Array<[string, string]>; byCategory: Array<[string, string]> } {
  const byIngredient = new Map<string, Total>();
  const byCategory = new Map<string, Total>();
  const losses = input.movements
    .filter((movement) => movement.type === 'waste' || movement.type === 'spoilage')
    .sort((left, right) => right.transaction_date.localeCompare(left.transaction_date));
  const rows = losses.map((movement) => {
    const category = lossCategory(movement);
    const reversed = input.reversedIds.has(movement.id);
    const item = input.itemName(movement);
    if (!reversed) {
      addTotal(byIngredient, item, movement.unit, movement.quantity);
      addTotal(byCategory, category, movement.unit, movement.quantity);
    }
    return [
      item,
      quantityText(movement.quantity, movement.unit),
      category,
      input.branchName(movement),
      input.formatDateTime(movement.transaction_date),
      movement.notes.trim() || '—',
      movement.actor_name ?? 'Staff account',
      reversed ? 'Reversed' : 'Recorded',
    ];
  });
  return { rows, byIngredient: totalPairs(byIngredient), byCategory: totalPairs(byCategory) };
}
