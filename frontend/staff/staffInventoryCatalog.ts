// Staff inventory is driven entirely by the database (ingredients, ingredient_categories,
// branch_inventory). This module only provides the display order of categories and a stable
// sort; it must never filter items or override database names, categories or units.

export const STAFF_INVENTORY_CATEGORY_ORDER = [
  'Seafood',
  'Dairy',
  'Meat',
  'Vegetables',
  'Condiments',
  'Dry Goods',
  'Supplies',
  'Prepared',
] as const;

function canonicalCategory(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (normalized === 'dairy' || normalized === 'dairy & eggs') return 'dairy';
  if (normalized === 'produce' || normalized === 'vegetables') return 'vegetables';
  if (normalized === 'prepared inventory' || normalized === 'prepared') return 'prepared';
  return normalized;
}

function categoryRank(category: string): number {
  const canonical = canonicalCategory(category);
  const index = STAFF_INVENTORY_CATEGORY_ORDER.findIndex((entry) => entry.toLowerCase() === canonical);
  return index >= 0 ? index : STAFF_INVENTORY_CATEGORY_ORDER.length;
}

export function staffInventorySort(
  left: { name: string; category?: string },
  right: { name: string; category?: string },
): number {
  const byCategory = categoryRank(left.category ?? '') - categoryRank(right.category ?? '');
  if (byCategory !== 0) return byCategory;
  return left.name.localeCompare(right.name);
}
