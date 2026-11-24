// Staff inventory is driven entirely by the database (ingredients, ingredient_categories,
// branch_inventory). This module only provides the display order of categories and a stable
// sort; it must never filter items or override database names, categories or units.

// The team's inventory catalog (2026-11-25) names the categories. Names used before the
// catalog are understood as the same category, so older data still sorts and filters.
export const STAFF_INVENTORY_CATEGORY_ORDER = [
  'Frozen seafood',
  'Chilled seafood',
  'Dried seafood',
  'Seafood',
  'Dairy & eggs',
  'Chilled meat',
  'Fresh produce',
  'Sauces & oils',
  'Dry goods',
  'Supplies',
  'Prepared batter',
] as const;

const EARLIER_NAMES: Record<string, string> = {
  dairy: 'Dairy & eggs',
  meat: 'Chilled meat',
  produce: 'Fresh produce',
  vegetables: 'Fresh produce',
  condiments: 'Sauces & oils',
  'prepared inventory': 'Prepared batter',
  prepared: 'Prepared batter',
};

/** The category name staff see: the catalog's name, also for data saved under an earlier name. */
export function staffInventoryCategoryName(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return 'Other';
  const known = STAFF_INVENTORY_CATEGORY_ORDER.find((entry) => entry.toLowerCase() === trimmed.toLowerCase());
  return known ?? EARLIER_NAMES[trimmed.toLowerCase()] ?? trimmed;
}

function categoryRank(category: string): number {
  const name = staffInventoryCategoryName(category);
  const index = STAFF_INVENTORY_CATEGORY_ORDER.findIndex((entry) => entry === name);
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

/**
 * The filter chips of the staff Inventory screen: "All", then the categories the
 * branch's items actually have, in catalog order. A category the owner adds later
 * appears by itself, after the catalog ones.
 */
export function staffInventoryCategoryFilters(items: ReadonlyArray<{ category?: string }>): string[] {
  const names = [...new Set(items.map((item) => staffInventoryCategoryName(item.category ?? '')))];
  return ['All', ...names.sort((left, right) => categoryRank(left) - categoryRank(right) || left.localeCompare(right))];
}
