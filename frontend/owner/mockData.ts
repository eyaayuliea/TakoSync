export type OwnerBranchId = 'branch-1' | 'branch-2' | 'branch-3';
export type OwnerCategory = 'Seafood' | 'Dry Goods' | 'Dairy & eggs' | 'Condiments';
export type OwnerInventoryStatus = 'Low stock' | 'Near expiry' | 'In stock';

export type OwnerIngredient = {
  id: string;
  name: string;
  category: OwnerCategory;
  quantity: number;
  unit: string;
  minimumStock: number;
  receivedBatch: string;
  expirationDate: string | null;
  lastUpdated: string;
  emoji: string;
};

export type OwnerBranch = {
  id: OwnerBranchId;
  name: string;
  city: string;
  ingredients: OwnerIngredient[];
};

export type OwnerActivity = {
  id: string;
  kind: 'Stock-out / usage' | 'Waste recorded' | 'Stock-in receipt';
  ingredient: string;
  quantity: string;
  branchId: OwnerBranchId;
  time: string;
};

const updatedAt = '29 Oct 2026 · 10:30 AM';

export const ownerBranches: OwnerBranch[] = [
  {
    id: 'branch-1',
    name: 'Branch 1',
    city: 'Manila',
    ingredients: [
      { id: 'octopus', name: 'Octopus', category: 'Seafood', quantity: 3, unit: 'kg', minimumStock: 5, receivedBatch: 'OCT-2510', expirationDate: '2026-10-30', lastUpdated: updatedAt, emoji: '🐙' },
      { id: 'flour', name: 'Flour', category: 'Dry Goods', quantity: 12, unit: 'kg', minimumStock: 5, receivedBatch: 'FLR-2510', expirationDate: null, lastUpdated: updatedAt, emoji: '🌾' },
      { id: 'eggs', name: 'Eggs', category: 'Dairy & eggs', quantity: 48, unit: 'pcs', minimumStock: 24, receivedBatch: 'EGG-2510', expirationDate: '2026-11-02', lastUpdated: updatedAt, emoji: '🥚' },
      { id: 'sauces', name: 'Sauces', category: 'Condiments', quantity: 2, unit: 'L', minimumStock: 1, receivedBatch: 'SC-B1-2710', expirationDate: '2026-11-20', lastUpdated: updatedAt, emoji: '🧴' },
    ],
  },
  {
    id: 'branch-2',
    name: 'Branch 2',
    city: '',
    ingredients: [
      { id: 'octopus', name: 'Octopus', category: 'Seafood', quantity: 6, unit: 'kg', minimumStock: 5, receivedBatch: 'OCT-B2-2810', expirationDate: '2026-11-02', lastUpdated: updatedAt, emoji: '🐙' },
      { id: 'flour', name: 'Flour', category: 'Dry Goods', quantity: 4, unit: 'kg', minimumStock: 5, receivedBatch: 'FLR-B2-2710', expirationDate: null, lastUpdated: updatedAt, emoji: '🌾' },
      { id: 'eggs', name: 'Eggs', category: 'Dairy & eggs', quantity: 36, unit: 'pcs', minimumStock: 24, receivedBatch: 'EGG-B2-2810', expirationDate: '2026-11-04', lastUpdated: updatedAt, emoji: '🥚' },
      { id: 'sauces', name: 'Sauces', category: 'Condiments', quantity: 1.5, unit: 'L', minimumStock: 1, receivedBatch: 'SC-B2-2710', expirationDate: '2026-11-18', lastUpdated: updatedAt, emoji: '🧴' },
    ],
  },
  {
    id: 'branch-3',
    name: 'Branch 3',
    city: '',
    ingredients: [
      { id: 'octopus', name: 'Octopus', category: 'Seafood', quantity: 8, unit: 'kg', minimumStock: 5, receivedBatch: 'OCT-B3-2810', expirationDate: '2026-11-12', lastUpdated: updatedAt, emoji: '🐙' },
      { id: 'flour', name: 'Flour', category: 'Dry Goods', quantity: 15, unit: 'kg', minimumStock: 5, receivedBatch: 'FLR-B3-2710', expirationDate: null, lastUpdated: updatedAt, emoji: '🌾' },
      { id: 'eggs', name: 'Eggs', category: 'Dairy & eggs', quantity: 60, unit: 'pcs', minimumStock: 24, receivedBatch: 'EGG-B3-2810', expirationDate: '2026-11-15', lastUpdated: updatedAt, emoji: '🥚' },
      { id: 'sauces', name: 'Sauces', category: 'Condiments', quantity: 3, unit: 'L', minimumStock: 1, receivedBatch: 'SC-B3-2710', expirationDate: '2026-11-20', lastUpdated: updatedAt, emoji: '🧴' },
    ],
  },
];

export const ownerActivities: OwnerActivity[] = [
  { id: 'activity-1', kind: 'Stock-out / usage', ingredient: 'Octopus', quantity: '−0.5 kg', branchId: 'branch-1', time: '10:24 AM' },
  { id: 'activity-2', kind: 'Waste recorded', ingredient: 'Eggs', quantity: '−2 pcs', branchId: 'branch-2', time: '09:48 AM' },
  { id: 'activity-3', kind: 'Stock-in receipt', ingredient: 'Flour', quantity: '+5 kg', branchId: 'branch-3', time: '09:15 AM' },
];

export const ownerCategories: Array<'All' | OwnerCategory> = [
  'All',
  'Seafood',
  'Dry Goods',
  'Dairy & eggs',
  'Condiments',
];

export function branchLabel(branch: OwnerBranch): string {
  return branch.city ? `${branch.city} · ${branch.name}` : branch.name;
}

export function getIngredientStatus(ingredient: OwnerIngredient): OwnerInventoryStatus {
  if (ingredient.quantity <= ingredient.minimumStock) return 'Low stock';
  if (isNearExpiry(ingredient)) return 'Near expiry';
  return 'In stock';
}

export function isNearExpiry(ingredient: OwnerIngredient): boolean {
  if (!ingredient.expirationDate) return false;
  const expiresAt = new Date(`${ingredient.expirationDate}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiresAt - today.getTime() <= 7 * 86_400_000;
}

export function formatOwnerDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
