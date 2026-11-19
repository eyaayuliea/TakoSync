export type StaffInventoryCatalogItem = {
  id: string;
  name: string;
  category: 'Seafood' | 'Dairy' | 'Meat' | 'Vegetables' | 'Condiments' | 'Dry Goods' | 'Supplies' | 'Prepared';
  unit: 'g' | 'kg' | 'ml' | 'L' | 'pcs' | 'bottle' | 'pack' | 'tsp' | 'tbsp';
};

export const STAFF_INVENTORY_CATALOG: readonly StaffInventoryCatalogItem[] = [
  { id: 'octopus', name: 'Octopus', category: 'Seafood', unit: 'g' },
  { id: 'cheese', name: 'Cheese', category: 'Dairy', unit: 'g' },
  { id: 'crab-sticks', name: 'Crab sticks', category: 'Seafood', unit: 'g' },
  { id: 'bacon-bits', name: 'Bacon', category: 'Meat', unit: 'g' },
  { id: 'prepared-batter', name: 'Takoyaki batter', category: 'Prepared', unit: 'bottle' },
  { id: 'cabbage', name: 'Cabbage (chopped)', category: 'Vegetables', unit: 'g' },
  { id: 'takoyaki-sauce', name: 'Takoyaki sauce', category: 'Condiments', unit: 'ml' },
  { id: 'japanese-mayonnaise', name: 'Japanese mayonnaise', category: 'Condiments', unit: 'ml' },
  { id: 'bonito-flakes', name: 'Bonito flakes', category: 'Dry Goods', unit: 'g' },
  { id: 'packaging', name: 'Packaging', category: 'Supplies', unit: 'pcs' },
  { id: 'flour', name: 'All-purpose flour', category: 'Dry Goods', unit: 'kg' },
  { id: 'dashi', name: 'Dashi powder', category: 'Dry Goods', unit: 'g' },
  { id: 'eggs', name: 'Eggs', category: 'Dairy', unit: 'pcs' },
  { id: 'salt', name: 'Salt', category: 'Dry Goods', unit: 'g' },
  { id: 'soy-sauce', name: 'Soy sauce', category: 'Condiments', unit: 'ml' },
  { id: 'baking-powder', name: 'Baking powder', category: 'Dry Goods', unit: 'g' },
] as const;

const catalogById = new Map(STAFF_INVENTORY_CATALOG.map((item) => [item.id, item]));

const approvedIdAliases: Record<string, string> = {
  octobits: 'octopus',
  'cheese-cubes': 'cheese',
  'crab-sticks': 'crab-sticks',
  'bacon-bits': 'bacon-bits',
  bacon: 'bacon-bits',
  'prepared-batter': 'prepared-batter',
  cabbage: 'cabbage',
  sauces: 'takoyaki-sauce',
  'japanese-mayonnaise': 'japanese-mayonnaise',
  'bonito-flakes': 'bonito-flakes',
  packaging: 'packaging',
};

export function getApprovedStaffInventoryItem(
  id: string,
  name: string,
  category: string,
): StaffInventoryCatalogItem | null {
  const aliasedId = approvedIdAliases[id] ?? id;
  const byId = catalogById.get(aliasedId);
  if (byId) return byId;

  const normalizedName = name.trim().toLowerCase();
  const normalizedCategory = category.trim().toLowerCase();
  return STAFF_INVENTORY_CATALOG.find((item) =>
    item.name.toLowerCase() === normalizedName &&
    (
      normalizedCategory === '' ||
      item.category.toLowerCase() === normalizedCategory ||
      (normalizedCategory === 'dairy & eggs' && item.category === 'Dairy') ||
      (normalizedCategory === 'produce' && item.category === 'Vegetables') ||
      (normalizedCategory === 'prepared inventory' && item.category === 'Prepared')
    ),
  ) ?? null;
}

export function approvedStaffInventorySort(left: { id: string; name: string }, right: { id: string; name: string }) {
  const leftIndex = STAFF_INVENTORY_CATALOG.findIndex((item) =>
    item.id === (approvedIdAliases[left.id] ?? left.id) || item.name === left.name,
  );
  const rightIndex = STAFF_INVENTORY_CATALOG.findIndex((item) =>
    item.id === (approvedIdAliases[right.id] ?? right.id) || item.name === right.name,
  );
  if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
  if (leftIndex >= 0) return -1;
  if (rightIndex >= 0) return 1;
  return left.name.localeCompare(right.name);
}
