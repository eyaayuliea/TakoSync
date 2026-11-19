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
    if (quantity <= 0) summary.outOfStock += 1;
    else if (minimumStock > 0 && quantity <= minimumStock) summary.lowStock += 1;
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
