import type { OwnerSalesConsumptionBundle } from '../services/takosync.ts';

export const pageSize = 20;

// Kept so a design preview can still force the loading / empty / error screens. Real data is
// always read from the database; the old 'success' and 'load_more' mock states were removed.
export type SalesConsumptionForcedState = 'success' | 'empty' | 'loading' | 'error' | 'load_more' | null;

export type SalesConsumptionRecord = {
  /** inventory_movements.id */
  id: string;
  /** inventory_movements.reference */
  recordReference: string;
  ingredientName: string;
  /** Always positive; the record is shown as a deduction. */
  quantity: number;
  unit: string;
  /** sales.id, resolvable in Sales Transaction Records. */
  saleId: string;
  saleReference: string;
  branchId: string;
  branchName: string;
  createdAt: string;
  recordedBy: string;
  /** The linked sale's inventory processing is flagged as failed, so this deduction needs review. */
  updateFailed: boolean;
};

export type SalesConsumptionPage = {
  records: SalesConsumptionRecord[];
  hasMore: boolean;
};

export function getForcedSalesConsumptionState(): SalesConsumptionForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_SALES_CONSUMPTION_STATE
    : undefined;
  if (value === 'empty' || value === 'loading' || value === 'error') return value;
  return null;
}

function branchLabel(city: string, code: string): string {
  const number = Number(code.replace(/\D/g, '')) || code;
  return `${city ? `${city} · ` : ''}Branch ${number}`;
}

export function buildSalesConsumptionRecords(bundle: OwnerSalesConsumptionBundle): SalesConsumptionRecord[] {
  const ingredients = new Map(bundle.ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const branches = new Map(bundle.branches.map((branch) => [branch.id, branchLabel(branch.city, branch.code)]));
  const profiles = new Map(bundle.profiles.map((profile) => [profile.id, profile.full_name?.trim() || '']));
  const sales = new Map(bundle.sales.map((sale) => [sale.id, sale]));

  return bundle.movements.flatMap((movement) => {
    // Sales-consumption rows always carry a sale; skip anything malformed rather than invent a link.
    if (!movement.sale_id) return [];
    const sale = sales.get(movement.sale_id);
    return [{
      id: movement.id,
      recordReference: movement.reference,
      ingredientName: ingredients.get(movement.ingredient_id) ?? 'Ingredient unavailable',
      quantity: Math.abs(Number(movement.quantity)),
      unit: movement.unit,
      saleId: movement.sale_id,
      saleReference: sale?.transaction_reference ?? 'Sale unavailable',
      branchId: movement.branch_id,
      branchName: branches.get(movement.branch_id) ?? 'Branch unavailable',
      createdAt: movement.transaction_date || movement.created_at,
      recordedBy: profiles.get(movement.actor_id) || 'Employee account',
      updateFailed: sale?.inventory_processing_status === 'failed',
    }];
  });
}

/** Whole numbers stay whole; otherwise up to three decimals, never a trailing zero run (bottles keep two). */
export function formatConsumptionQuantity(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 1000) / 1000;
  if (unit.toLowerCase().startsWith('bottle')) {
    const text = String(rounded);
    const decimals = text.includes('.') ? text.split('.')[1].length : 0;
    return decimals >= 2 ? text : rounded.toFixed(2);
  }
  return String(rounded);
}

export async function loadSalesConsumptionPage(offset = 0): Promise<SalesConsumptionPage> {
  const { loadOwnerSalesConsumptionBundle } = await import('../services/takosync.ts');
  const bundle = await loadOwnerSalesConsumptionBundle({ offset, limit: pageSize });
  return { records: buildSalesConsumptionRecords(bundle), hasMore: bundle.hasMore };
}

/** Returns null only when the query succeeded and no visible record has this id. */
export async function loadSalesConsumptionById(id: string): Promise<SalesConsumptionRecord | null> {
  const { loadOwnerSalesConsumptionBundle } = await import('../services/takosync.ts');
  const bundle = await loadOwnerSalesConsumptionBundle({ recordId: id, limit: 1 });
  return buildSalesConsumptionRecords(bundle)[0] ?? null;
}
