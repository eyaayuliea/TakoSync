// OW-28 Business and Inventory Configuration on the Owner Web Portal.

export type ConfigSectionKey = 'branches' | 'products' | 'ingredients' | 'units' | 'recipes' | 'batter' | 'thresholds' | 'expiration' | 'opening';

/** OW-28 c1: the configuration sections, in the order of the story. */
export const CONFIG_SECTIONS: ReadonlyArray<{ key: ConfigSectionKey; title: string; description: string }> = [
  { key: 'branches', title: 'Branch information', description: 'The three branches and their names.' },
  { key: 'products', title: 'Product information', description: 'Products, prices, add-ons and the Bulk Order threshold.' },
  { key: 'ingredients', title: 'Ingredient information', description: 'Ingredients, categories, units and purchase units.' },
  { key: 'units', title: 'Units of Measurement', description: 'Units, base units (g, ml, pcs) and conversion factors.' },
  { key: 'recipes', title: 'Recipes', description: 'Product and add-on recipes.' },
  { key: 'batter', title: 'Batter Batch settings', description: 'Raw ingredients per batch and yield per bottle.' },
  { key: 'thresholds', title: 'Stock Thresholds', description: 'Minimum stock level of each ingredient.' },
  { key: 'expiration', title: 'Expiration Alert settings', description: 'Days before expiration shown as Near Expiration.' },
  { key: 'opening', title: 'Opening Stock', description: 'Starting quantity of each item per branch, and the go-live lock.' },
];

/** OW-28 c3, c9: a branch name is required, short and unique. */
export function branchNameError(name: string, branchId: string, branches: ReadonlyArray<{ id: string; city: string }>): string | null {
  const value = name.trim();
  if (!value) return 'Enter the branch name.';
  if (value.length > 60) return 'The branch name can have at most 60 characters.';
  if (branches.some((branch) => branch.id !== branchId && branch.city.trim().toLowerCase() === value.toLowerCase())) {
    return `Another branch is already named “${value}”.`;
  }
  return null;
}

const BASE_BY_DIMENSION: Record<string, string> = { mass: 'g', volume: 'ml', count: 'pcs', package: 'pcs' };

/** OW-28 c4: the units under each base unit (g, ml, pcs) with their conversion factors. */
export function unitRows(
  units: ReadonlyArray<{ code: string; dimension: string }>,
  conversions: ReadonlyArray<{ from_unit: string; to_unit: string; factor: number }>,
): string[][] {
  return ['g', 'ml', 'pcs'].map((base) => {
    const members = units.filter((unit) => BASE_BY_DIMENSION[unit.dimension] === base).map((unit) => unit.code);
    const factors = conversions
      .filter((row) => members.includes(row.from_unit) && members.includes(row.to_unit) && row.factor >= 1)
      .map((row) => `1 ${row.from_unit} = ${Number(row.factor.toFixed(6))} ${row.to_unit}`);
    return [base, members.join(', ') || '—', factors.join('; ') || '—'];
  });
}

export type OpeningStockRow = {
  ingredientId: string;
  name: string;
  unit: string;
  current: number | null;
  entry: { quantity: number; previous: number; recordedAt: string } | null;
};

/** OW-28 c5, c6: each item of a branch with its current balance and its opening entry, if any. */
export function openingStockRows(input: {
  branchId: string;
  ingredients: ReadonlyArray<{ id: string; name: string; unit: string }>;
  inventory: ReadonlyArray<{ branch_id: string; ingredient_id: string; quantity: number }>;
  entries: ReadonlyArray<{ branch_id: string; ingredient_id: string; quantity: number; previous_quantity: number; recorded_at: string }>;
}): OpeningStockRow[] {
  return input.ingredients
    .filter((item) => input.inventory.some((row) => row.branch_id === input.branchId && row.ingredient_id === item.id))
    .map((item) => {
      const current = input.inventory.find((row) => row.branch_id === input.branchId && row.ingredient_id === item.id);
      const entry = input.entries.find((row) => row.branch_id === input.branchId && row.ingredient_id === item.id);
      return {
        ingredientId: item.id,
        name: item.name,
        unit: item.unit,
        current: current ? current.quantity : null,
        entry: entry ? { quantity: entry.quantity, previous: entry.previous_quantity, recordedAt: entry.recorded_at } : null,
      };
    });
}

/** OW-28 c9: an opening quantity is zero or greater with at most three decimals. */
export function parseOpeningQuantity(draft: string, itemName: string): { value: number } | { error: string } {
  const text = draft.trim();
  if (!text) return { error: `Enter the opening stock of ${itemName}.` };
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return { error: `The opening stock of ${itemName} must be zero or greater, with at most three decimals.` };
  return { value: Number(text) };
}
