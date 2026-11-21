import { classifyStockLevel } from '../services/inventoryStatusRules.ts';
export type DashboardSale = {
  branch_id: string;
  total_amount: number | string;
  status: string;
};

export type DashboardBranch = {
  id: string;
  name: string;
};

export type DashboardBranchMetric = DashboardBranch & {
  total: number;
  transactions: number;
};

export type DashboardInventoryRecord = {
  quantity: number | string | null;
  minimum_stock: number | string;
};

export function summarizeOwnerInventoryStatus(records: DashboardInventoryRecord[]) {
  return records.reduce((summary, record) => {
    if (record.quantity === null) return summary;
    const quantity = Number(record.quantity);
    const minimumStock = Number(record.minimum_stock);
    if (!Number.isFinite(quantity) || !Number.isFinite(minimumStock)) return summary;
    const level = classifyStockLevel(quantity, minimumStock);
    if (level === 'Out of Stock') summary.outOfStock += 1;
    else if (level === 'Low Stock') summary.lowStock += 1;
    else summary.normal += 1;
    return summary;
  }, { normal: 0, lowStock: 0, outOfStock: 0 });
}

export function summarizeOwnerDashboardSales(
  sales: DashboardSale[],
  branches: DashboardBranch[],
  branchId: string | null = null,
) {
  const confirmedSales = sales.filter((sale) => {
    const amount = Number(sale.total_amount);
    return sale.status === 'completed'
      && Number.isFinite(amount)
      && amount >= 0
      && (!branchId || sale.branch_id === branchId);
  });

  const branchMetrics: DashboardBranchMetric[] = branches
    .filter((branch) => !branchId || branch.id === branchId)
    .map((branch) => {
      const branchSales = confirmedSales.filter((sale) => sale.branch_id === branch.id);
      return {
        ...branch,
        total: branchSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
        transactions: branchSales.length,
      };
    });

  return {
    total: confirmedSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0),
    transactions: confirmedSales.length,
    branchMetrics,
  };
}

/** OM-02 c4: the Normal / Low Stock / Out of Stock counts of each branch. */
export function summarizeOwnerInventoryStatusByBranch(
  records: Array<DashboardInventoryRecord & { branch_id: string }>,
  branches: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string; normal: number; lowStock: number; outOfStock: number }> {
  return branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    ...summarizeOwnerInventoryStatus(records.filter((record) => record.branch_id === branch.id)),
  }));
}
