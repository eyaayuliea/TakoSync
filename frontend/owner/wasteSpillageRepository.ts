import { getDailySalesSampleData } from './dailySalesRepository.ts';
import { OWNER_INVENTORY_INGREDIENTS, OWNER_INVENTORY_RECORDS } from './ownerInventoryMock.ts';
import type { InventoryIngredient } from './ownerInventoryMock.ts';

export const WasteSpillageCategory = {
  Spoilage: 'spoilage',
  Spillage: 'spillage',
  Waste: 'waste',
  Other: 'other',
} as const;

export type WasteSpillageCategory = typeof WasteSpillageCategory[keyof typeof WasteSpillageCategory];

export const WASTE_SPILLAGE_CATEGORY_LABELS: Record<WasteSpillageCategory, string> = {
  [WasteSpillageCategory.Spoilage]: 'Spoilage',
  [WasteSpillageCategory.Spillage]: 'Spillage',
  [WasteSpillageCategory.Waste]: 'Waste',
  [WasteSpillageCategory.Other]: 'Other',
};

export type WasteSpillageRecord = {
  id: string;
  recordReference: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: InventoryIngredient['unit'];
  category: WasteSpillageCategory;
  branchId: string;
  branchName: string;
  createdAt: string;
  remarks: string;
  recordedBy: string;
};

export type WasteSpillageForcedState = 'success' | 'empty' | 'loading' | 'error' | 'load_more' | null;

const recordSpecs = [
  {
    id: 'WS-1112-0008',
    ingredientId: 'eggs',
    quantity: 6,
    category: WasteSpillageCategory.Spoilage,
    branchId: 'branch-3',
    createdAt: '2026-11-12T10:15:00+08:00',
    remarks: 'Spoiled; stored too long.',
  },
  {
    id: 'WS-1112-0007',
    ingredientId: 'sauce',
    quantity: 0.5,
    category: WasteSpillageCategory.Spillage,
    branchId: 'branch-1',
    createdAt: '2026-11-12T09:05:00+08:00',
    remarks: '',
  },
  {
    id: 'WS-1111-0006',
    ingredientId: 'mayonnaise',
    quantity: 0.4,
    category: WasteSpillageCategory.Waste,
    branchId: 'branch-2',
    createdAt: '2026-11-11T20:20:00+08:00',
    remarks: '',
  },
  {
    id: 'WS-1111-0005',
    ingredientId: 'bonito',
    quantity: 0.2,
    category: WasteSpillageCategory.Other,
    branchId: 'branch-1',
    createdAt: '2026-11-11T18:00:00+08:00',
    remarks: '',
  },
] as const;

export function getForcedWasteSpillageState(): WasteSpillageForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_WASTE_SPILLAGE_STATE
    : undefined;
  if (value === 'success' || value === 'empty' || value === 'loading' || value === 'error' || value === 'load_more') {
    return value;
  }
  return null;
}

function getRecordedBy() {
  const employee = getDailySalesSampleData().sales.find((sale) => sale.staff_id === 'staff-ana');
  if (!employee?.recorded_by_name) {
    throw new Error('The shared mock employee account for waste records is unavailable.');
  }
  return employee.recorded_by_name;
}

export function getWasteSpillageMockList(): WasteSpillageRecord[] {
  const recordedBy = getRecordedBy();
  return recordSpecs.map((spec) => {
    const ingredient = OWNER_INVENTORY_INGREDIENTS.find((item) => item.id === spec.ingredientId);
    const inventoryRecord = OWNER_INVENTORY_RECORDS.find(
      (item) => item.ingredientId === spec.ingredientId && item.branchId === spec.branchId,
    );
    if (!ingredient || !inventoryRecord) {
      throw new Error(`Shared inventory data is incomplete for waste record ${spec.id}.`);
    }

    return {
      ...spec,
      recordReference: spec.id,
      ingredientName: ingredient.displayName,
      unit: ingredient.unit,
      branchName: `Branch ${spec.branchId.slice('branch-'.length)}`,
      recordedBy,
    };
  }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getWasteSpillageById(id: string): WasteSpillageRecord | null {
  return getWasteSpillageMockList().find((record) => record.id === id) ?? null;
}

export function formatWasteSpillageDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(part('day'))} ${months[Number(part('month')) - 1]} ${part('year')} · ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

export function formatWasteSpillageQuantity(record: Pick<WasteSpillageRecord, 'quantity' | 'unit'>): string {
  return `${record.quantity} ${record.unit}`;
}
