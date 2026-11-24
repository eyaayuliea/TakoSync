// OW-23 Prepared Batter and OW-24 Stock Threshold settings on the Owner Web Portal.

export const BOTTLES_PER_BATCH = 5;
export const YIELD_PER_BOTTLE_RANGE = { min: 20, max: 25 } as const;
export const YIELD_PER_BOTTLE_MESSAGE = 'The yield per bottle must be a whole number from 20 to 25 pieces.';

/** OW-23 c3: the pieces one bottle yields (estimated yield ÷ bottles per batch). */
export function yieldPerBottle(recipe: { estimated_yield_pieces: number; prepared_quantity: number } | null | undefined): number {
  if (!recipe || !(recipe.prepared_quantity > 0)) return 25;
  return Math.round((recipe.estimated_yield_pieces / recipe.prepared_quantity) * 100) / 100;
}

/** OW-23 c3, c4: a whole number of pieces from 20 to 25, or the message. */
export function parseYieldPerBottle(draft: string): { value: number } | { error: string } {
  const text = draft.trim();
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < YIELD_PER_BOTTLE_RANGE.min || value > YIELD_PER_BOTTLE_RANGE.max) {
    return { error: YIELD_PER_BOTTLE_MESSAGE };
  }
  return { value };
}

/** OW-24 c3: the expiration alert period is a whole number of days greater than zero. */
export function parseAlertDays(draft: string): { value: number } | { error: string } {
  const text = draft.trim();
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < 1 || value > 365) {
    return { error: 'The expiration alert period must be a whole number of days greater than zero (up to 365).' };
  }
  return { value };
}

/** OW-24 c3: a minimum stock level is zero or greater (up to 3 decimals). */
export function parseMinimumStock(draft: string, itemName: string): { value: number } | { error: string } {
  const text = draft.trim();
  const value = Number(text);
  if (!text || !/^\d+(\.\d{1,3})?$/.test(text) || !Number.isFinite(value) || value < 0) {
    return { error: `The minimum stock level for ${itemName} must be zero or greater.` };
  }
  return { value };
}

export type ThresholdRow = { ingredientId: string; name: string; category: string; unit: string; minimum: number | null; varies: boolean };

/**
 * OW-24 c1, c4: one row per ingredient with the minimum stock level used for all
 * three branches. When the branches still differ, the row says so and shows the
 * highest value; saving sets the same level for every branch.
 */
export function thresholdRows(input: {
  ingredients: ReadonlyArray<{ id: string; name: string; unit: string; category_id: string }>;
  categories: ReadonlyArray<{ id: string; name: string }>;
  inventory: ReadonlyArray<{ ingredient_id: string; minimum_stock: number }>;
  query: string;
  categoryId: string | null;
}): ThresholdRow[] {
  const categoryName = new Map(input.categories.map((category) => [category.id, category.name]));
  const query = input.query.trim().toLowerCase();
  return input.ingredients
    .filter((item) => !input.categoryId || item.category_id === input.categoryId)
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .map((item) => {
      const values = [...new Set(input.inventory.filter((row) => row.ingredient_id === item.id).map((row) => Number(row.minimum_stock)))];
      return {
        ingredientId: item.id,
        name: item.name,
        category: categoryName.get(item.category_id) ?? '—',
        unit: item.unit,
        minimum: values.length ? Math.max(...values) : null,
        varies: values.length > 1,
      };
    });
}
