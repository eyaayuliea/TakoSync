export type OwnerPortalBranch = {
  id: string;
  name: string;
};

export type OwnerPortalInventoryRow = {
  branch: string;
  branchId: string;
  status: string;
};

export type OwnerPortalSaleRow = {
  branch_id: string;
  total_amount: number | string;
};

export type OwnerPortalBranchSummary = {
  id: string;
  name: string;
  inventoryCount: number;
  normalCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  salesTotal: number;
};

export function filterOwnerPortalInventory<T extends OwnerPortalInventoryRow>(
  rows: T[],
  selectedBranch: string,
): T[] {
  return selectedBranch === 'All Branches'
    ? rows
    : rows.filter((row) => row.branch === selectedBranch);
}

export function summarizeOwnerPortalBranches(
  branches: OwnerPortalBranch[],
  rows: OwnerPortalInventoryRow[],
  sales: OwnerPortalSaleRow[],
): OwnerPortalBranchSummary[] {
  return branches.map((branch) => {
    const branchRows = rows.filter((row) => row.branchId === branch.id);
    const branchSales = sales.filter((sale) => sale.branch_id === branch.id);
    return {
      id: branch.id,
      name: branch.name,
      inventoryCount: branchRows.length,
      normalCount: branchRows.filter((row) => row.status === 'Normal').length,
      lowStockCount: branchRows.filter((row) => row.status === 'Low Stock').length,
      outOfStockCount: branchRows.filter((row) => row.status === 'Out of Stock').length,
      salesTotal: branchSales.reduce((total, sale) => total + Number(sale.total_amount), 0),
    };
  });
}
