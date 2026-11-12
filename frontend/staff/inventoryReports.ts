import type { InventoryItem } from '../services/takosync';

export type InventoryReportItem = Pick<
  InventoryItem,
  'id' | 'name' | 'category' | 'quantity' | 'unit' | 'minimumStock'
>;

export type InventoryStockStatus = 'Normal' | 'Low Stock' | 'Out of Stock';

export type InventoryCategorySummary = {
  category: string;
  ingredientCount: number;
  ingredients: InventoryReportItem[];
  totalsByUnit: Array<{ unit: string; quantity: number }>;
};

export type InventoryAdjustmentAudit = {
  reference: string;
  actorId: string;
  createdAt: string;
  beforeQuantity: number;
  afterQuantity: number;
};

export type InventoryCountRecord = {
  id: string;
  checkId: string;
  reference: string;
  ingredientId: string;
  ingredientName: string;
  expectedQuantity: number;
  originalActualQuantity: number;
  actualQuantity: number;
  revisedActualQuantity: number | null;
  difference: number;
  unit: string;
  quantityPrecision: number;
  branchName: string;
  submittedAt: string;
  submittedBy: string;
  remarks: string;
  countStatus: 'Submitted' | 'Validated';
  result: 'Matches' | 'Lower than expected' | 'Higher than expected';
  inventoryRevision: number | null;
  correctionRequests: Array<{
    requestId: string;
    correctedActualQuantity: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    decisionReason: string | null;
    decidedAt: string | null;
  }>;
  validation: {
    correctedActualQuantity: number;
    outcome: 'adjusted' | 'no_change';
    reason: string;
    validatedAt: string;
  } | null;
  adjustment: InventoryAdjustmentAudit | null;
};

export type InventoryReportData = {
  branchName: string;
  generatedAt: string;
  ingredients: InventoryReportItem[];
  categories: InventoryCategorySummary[];
  discrepancies: InventoryCountRecord[];
  physicalCounts: InventoryCountRecord[];
};

export type InventoryReportCheck = {
  id: string;
  reference: string;
  branch_id: string;
  submitted_by: string;
  remarks: string;
  status: string;
  created_at: string;
};

export type InventoryReportCountLine = {
  id: string;
  daily_stock_check_id: string;
  ingredient_id: string;
  recorded_quantity: number | string;
  physical_quantity: number | string;
  difference: number | string;
  unit: string;
  inventory_revision: number | null;
};

export type InventoryReportMovement = {
  id: string;
  branch_id: string;
  actor_id: string;
  type: string;
  reference: string;
  movement: number | string;
  before_quantity: number | string;
  after_quantity: number | string;
  notes: string;
  created_at: string;
};

export type InventoryReportCorrectionRequest = {
  id: string;
  daily_stock_count_line_id: string;
  corrected_actual_quantity: number | string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decision_reason: string | null;
  decided_at: string | null;
};

export type InventoryReportValidation = {
  daily_stock_count_line_id: string;
  corrected_actual_quantity: number | string;
  outcome: 'adjusted' | 'no_change';
  reason: string;
  validated_at: string;
};

function asNumber(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inventoryStockStatus(quantity: number, minimumStock: number): InventoryStockStatus {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity <= minimumStock) return 'Low Stock';
  return 'Normal';
}

export function buildInventoryCategories(items: InventoryReportItem[]): InventoryCategorySummary[] {
  const grouped = new Map<string, InventoryReportItem[]>();
  for (const item of items) {
    const category = item.category.trim() || 'Uncategorized';
    grouped.set(category, [...(grouped.get(category) ?? []), item]);
  }
  return [...grouped.entries()]
    .map(([category, ingredients]) => {
      ingredients.sort((left, right) => left.name.localeCompare(right.name));
      const quantities = new Map<string, number>();
      for (const ingredient of ingredients) {
        quantities.set(ingredient.unit, (quantities.get(ingredient.unit) ?? 0) + ingredient.quantity);
      }
      return {
        category,
        ingredientCount: ingredients.length,
        ingredients,
        totalsByUnit: [...quantities.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([unit, quantity]) => ({ unit, quantity })),
      };
    })
    .sort((left, right) => left.category.localeCompare(right.category));
}

export function buildInventoryCountReports(input: {
  branchId: string;
  branchName: string;
  checks: InventoryReportCheck[];
  lines: InventoryReportCountLine[];
  itemNames: Array<{ id: string; name: string; quantityPrecision?: number }>;
  movements: InventoryReportMovement[];
  correctionRequests?: InventoryReportCorrectionRequest[];
  validations?: InventoryReportValidation[];
}): { discrepancies: InventoryCountRecord[]; physicalCounts: InventoryCountRecord[] } {
  const checksById = new Map(
    input.checks
      .filter((check) =>
        check.branch_id === input.branchId &&
        (check.status === 'submitted' || check.status === 'pending_owner_review'),
      )
      .map((check) => [check.id, check]),
  );
  const namesById = new Map(input.itemNames.map((item) => [item.id, item.name]));
  const precisionById = new Map(input.itemNames.map((item) => [item.id, item.quantityPrecision ?? 3]));
  const linesByCheck = new Map<string, InventoryReportCountLine[]>();
  for (const line of input.lines) {
    const grouped = linesByCheck.get(line.daily_stock_check_id) ?? [];
    grouped.push(line);
    linesByCheck.set(line.daily_stock_check_id, grouped);
  }
  const adjustmentsByCountLine = new Map<string, InventoryReportMovement>();
  for (const movement of input.movements) {
    if (movement.branch_id !== input.branchId || movement.type !== 'adjustment') continue;
    const match = movement.notes.match(/^(?:Authorized|Validated) physical count line (.+)$/i);
    if (match) adjustmentsByCountLine.set(match[1], movement);
  }
  const correctionsByLine = new Map<string, InventoryReportCorrectionRequest[]>();
  for (const request of input.correctionRequests ?? []) {
    correctionsByLine.set(request.daily_stock_count_line_id, [
      ...(correctionsByLine.get(request.daily_stock_count_line_id) ?? []),
      request,
    ]);
  }
  const validationsByLine = new Map((input.validations ?? []).map((validation) => [
    validation.daily_stock_count_line_id,
    validation,
  ]));

  const counts = input.lines.flatMap((line): InventoryCountRecord[] => {
    const check = checksById.get(line.daily_stock_check_id);
    if (!check) return [];
    const expectedQuantity = asNumber(line.recorded_quantity);
    const originalActualQuantity = asNumber(line.physical_quantity);
    const movement = adjustmentsByCountLine.get(line.id);
    const validation = validationsByLine.get(line.id);
    const difference = Number((originalActualQuantity - expectedQuantity).toFixed(3));
    const adjustment = movement ? {
      reference: movement.reference,
      actorId: movement.actor_id,
      createdAt: movement.created_at,
      beforeQuantity: asNumber(movement.before_quantity),
      afterQuantity: asNumber(movement.after_quantity),
    } : null;
    const checkDiscrepancies = (linesByCheck.get(check.id) ?? []).filter((candidate) =>
      candidate.daily_stock_check_id === check.id && asNumber(candidate.difference) !== 0,
    );
    const checkValidated = checkDiscrepancies.length > 0 &&
      checkDiscrepancies.every((candidate) =>
        validationsByLine.has(candidate.id) || adjustmentsByCountLine.has(candidate.id),
      );
    return [{
      id: line.id,
      checkId: check.id,
      reference: check.reference,
      ingredientId: line.ingredient_id,
      ingredientName: namesById.get(line.ingredient_id) ?? line.ingredient_id,
      expectedQuantity,
      originalActualQuantity,
      actualQuantity: originalActualQuantity,
      revisedActualQuantity: validation
        ? asNumber(validation.corrected_actual_quantity)
        : movement ? asNumber(movement.after_quantity) : null,
      difference,
      unit: line.unit,
      quantityPrecision: precisionById.get(line.ingredient_id) ?? 3,
      branchName: input.branchName,
      submittedAt: check.created_at,
      submittedBy: check.submitted_by,
      remarks: check.remarks,
      countStatus: checkValidated ? 'Validated' : 'Submitted',
      result: difference === 0
        ? 'Matches'
        : difference < 0
          ? 'Lower than expected'
          : 'Higher than expected',
      inventoryRevision: line.inventory_revision,
      correctionRequests: (correctionsByLine.get(line.id) ?? []).map((request) => ({
        requestId: request.id,
        correctedActualQuantity: asNumber(request.corrected_actual_quantity),
        reason: request.reason,
        status: request.status,
        decisionReason: request.decision_reason,
        decidedAt: request.decided_at,
      })),
      validation: validation ? {
        correctedActualQuantity: asNumber(validation.corrected_actual_quantity),
        outcome: validation.outcome,
        reason: validation.reason,
        validatedAt: validation.validated_at,
      } : null,
      adjustment,
    }];
  });
  counts.sort((left, right) =>
    new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime() ||
    left.ingredientName.localeCompare(right.ingredientName),
  );
  return {
    discrepancies: counts.filter((count) => count.originalActualQuantity !== count.expectedQuantity),
    physicalCounts: counts,
  };
}

export function buildInventoryReportData(input: {
  branchId: string;
  branchName: string;
  generatedAt: string;
  ingredients: InventoryReportItem[];
  checks: InventoryReportCheck[];
  lines: InventoryReportCountLine[];
  itemNames: Array<{ id: string; name: string; quantityPrecision?: number }>;
  movements: InventoryReportMovement[];
  correctionRequests?: InventoryReportCorrectionRequest[];
  validations?: InventoryReportValidation[];
}): InventoryReportData {
  const ingredients = [...input.ingredients].sort((left, right) => left.name.localeCompare(right.name));
  const counts = buildInventoryCountReports(input);
  return {
    branchName: input.branchName,
    generatedAt: input.generatedAt,
    ingredients,
    categories: buildInventoryCategories(ingredients),
    ...counts,
  };
}

export async function runInventoryReportLoad(
  load: () => Promise<InventoryReportData>,
): Promise<{ data: InventoryReportData | null; error: string }> {
  try {
    return { data: await load(), error: '' };
  } catch {
    return {
      data: null,
      error: 'Unable to load data. Please check your internet connection and try again.',
    };
  }
}

export async function runDiscrepancySubmissionOnce<T>(
  lock: { current: boolean },
  submit: () => Promise<T>,
): Promise<T | null> {
  if (lock.current) return null;
  lock.current = true;
  try {
    return await submit();
  } finally {
    lock.current = false;
  }
}
