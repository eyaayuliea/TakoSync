export type OwnerPortalSaleRow = {
  id: string;
  branch_id: string;
  total_amount: number | string;
  status?: string | null;
  inventory_processing_status?: string | null;
};

export type OwnerPortalSaleItemRow = {
  sale_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  subtotal: number;
};

export type OwnerPortalBranchRow = {
  id: string;
  name: string;
};

export type OwnerPortalBranchSalesSummary = {
  id: string;
  name: string;
  salesCount: number;
  totalSales: number;
};

export type OwnerPortalProductSalesSummary = {
  id: string;
  name: string;
  quantity: number;
  totalSales: number;
};

export type OwnerPortalInventoryReportMovement = {
  branch_id: string;
  type: string;
  transaction_date: string;
};

export type OwnerPortalMovementReport =
  | 'Stock-in report'
  | 'Sales consumption report'
  | 'Waste and spillage report';

export type OwnerPortalCountReportRow = {
  reference: string;
  branch: string;
  ingredient: string;
  expected: string;
  physical: string;
  difference: string;
  status: string;
  inventoryRevision: string;
  submittedBy: string;
  timestamp: string;
  revisionHistory: string;
};

const movementTypesByReport: Record<OwnerPortalMovementReport, readonly string[]> = {
  'Stock-in report': ['stock_in'],
  'Sales consumption report': ['sales_consumption'],
  'Waste and spillage report': ['waste', 'spoilage'],
};

export function buildOwnerPortalCountReportRows(input: {
  checks: readonly {
    id: string;
    reference: string;
    branch_id: string;
    created_at: string;
    status: string;
    submitted_by_name: string;
  }[];
  lines: readonly {
    id: string;
    daily_stock_check_id: string;
    ingredient_id: string;
    recorded_quantity: number | string;
    physical_quantity: number | string;
    difference: number | string;
    unit: string;
    inventory_revision: number | null;
  }[];
  correctionHistory?: readonly {
    countLineId: string;
    status: string;
    correctedActual: number;
    unit: string;
    correctionReason: string;
    decisionReason: string | null;
    validationReason: string | null;
  }[];
  branchId: string | null;
  start: Date;
  end: Date;
  branchNames: ReadonlyMap<string, string>;
  itemNames: ReadonlyMap<string, string>;
}): OwnerPortalCountReportRow[] {
  if (
    !Number.isFinite(input.start.getTime()) ||
    !Number.isFinite(input.end.getTime()) ||
    input.start >= input.end
  ) {
    throw new Error('Choose a valid physical count reporting date range.');
  }

  const checksById = new Map(input.checks
    .filter((check) => {
      const time = new Date(check.created_at).getTime();
      return (!input.branchId || check.branch_id === input.branchId)
        && Number.isFinite(time)
        && time >= input.start.getTime()
        && time < input.end.getTime();
    })
    .map((check) => [check.id, check]));

  return input.lines.flatMap((line) => {
    const check = checksById.get(line.daily_stock_check_id);
    if (!check) return [];
    const history = input.correctionHistory?.filter((record) => record.countLineId === line.id)
      .map((record) => [
        `${record.status}: ${record.correctedActual} ${record.unit}`,
        record.correctionReason,
        record.decisionReason,
        record.validationReason,
      ].filter(Boolean).join(' · '));
    const revision = line.inventory_revision;

    return [{
      reference: check.reference,
      branch: input.branchNames.get(check.branch_id) ?? check.branch_id,
      ingredient: input.itemNames.get(`${check.branch_id}:${line.ingredient_id}`) ?? line.ingredient_id,
      expected: `${line.recorded_quantity} ${line.unit}`,
      physical: `${line.physical_quantity} ${line.unit}`,
      difference: `${line.difference} ${line.unit}`,
      status: check.status,
      inventoryRevision: revision == null ? '—' : String(revision),
      submittedBy: check.submitted_by_name,
      timestamp: check.created_at,
      revisionHistory: `Inventory revision ${revision == null ? 'unavailable' : revision}; ${
        input.correctionHistory === undefined
          ? 'Correction revision history unavailable'
          : history?.join('; ') || 'No correction revision recorded'
      }`,
    }];
  }).sort((left, right) =>
    new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
  );
}

export function filterOwnerPortalConfirmedSales<T extends {
  branch_id: string;
  total_amount: number | string;
  status?: string | null;
  inventory_processing_status?: string | null;
}>(sales: readonly T[]): T[] {
  return sales.filter((sale) =>
    sale.status === 'completed' && sale.inventory_processing_status === 'completed',
  );
}

export function filterOwnerPortalReportMovements<T extends OwnerPortalInventoryReportMovement>(
  movements: readonly T[],
  report: OwnerPortalMovementReport,
  input: { branchId: string | null; start: Date; end: Date },
): T[] {
  if (
    !Number.isFinite(input.start.getTime()) ||
    !Number.isFinite(input.end.getTime()) ||
    input.start >= input.end
  ) {
    throw new Error('Choose a valid inventory reporting date range.');
  }

  const allowedTypes = new Set(movementTypesByReport[report]);
  return movements.filter((movement) => {
    const time = new Date(movement.transaction_date).getTime();
    return allowedTypes.has(movement.type)
      && (!input.branchId || movement.branch_id === input.branchId)
      && Number.isFinite(time)
      && time >= input.start.getTime()
      && time < input.end.getTime();
  });
}

export function totalOwnerPortalSales(sales: readonly OwnerPortalSaleRow[]): number {
  return sales.reduce((total, sale) => total + Number(sale.total_amount), 0);
}

export function summarizeOwnerPortalSalesByBranch(
  sales: readonly OwnerPortalSaleRow[],
  branches: readonly OwnerPortalBranchRow[],
): OwnerPortalBranchSalesSummary[] {
  return branches.map((branch) => {
    const branchSales = sales.filter((sale) => sale.branch_id === branch.id);
    return {
      id: branch.id,
      name: branch.name,
      salesCount: branchSales.length,
      totalSales: totalOwnerPortalSales(branchSales),
    };
  });
}

export function summarizeOwnerPortalSalesByProduct(
  sales: readonly OwnerPortalSaleRow[],
  items: readonly OwnerPortalSaleItemRow[],
): OwnerPortalProductSalesSummary[] {
  const saleIds = new Set(sales.map((sale) => sale.id));
  const products = new Map<string, OwnerPortalProductSalesSummary>();

  for (const item of items) {
    if (!saleIds.has(item.sale_id)) continue;
    const product = products.get(item.product_id) ?? {
      id: item.product_id,
      name: item.product_name || 'Product unavailable',
      quantity: 0,
      totalSales: 0,
    };
    product.quantity += Number(item.quantity);
    product.totalSales += Number(item.subtotal);
    products.set(item.product_id, product);
  }

  return [...products.values()].sort((left, right) =>
    right.totalSales - left.totalSales || left.name.localeCompare(right.name),
  );
}
