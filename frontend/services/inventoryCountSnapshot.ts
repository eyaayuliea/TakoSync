export type BranchInventorySnapshotRow = {
  ingredient_id: string;
  quantity: number | string;
  minimum_stock: number | string;
  updated_at: string;
  inventory_revision: number | string;
};

export function indexBranchInventorySnapshot(rows: readonly BranchInventorySnapshotRow[]) {
  return new Map(rows.map((row) => [row.ingredient_id, row]));
}
