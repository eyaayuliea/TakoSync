// ST-01 criterion 9: an unconfirmed order is never recorded as a sale when the
// session ends, but it is kept on this device so the same staff member can resume
// it after logging in again. It is stored per staff account and branch.

import type { MenuCartLine } from './menuPreviewData';

export type DraftOrder = {
  cart: MenuCartLine[];
  addonIds: string[];
  transactionReference: string | null;
  savedAt: string;
};

export type DraftOrderStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function draftOrderStorageKey(staffId: string, branchId: string): string {
  return `takosync.staffDraftOrder.v1:${staffId}:${branchId}`;
}

export function isEmptyDraftOrder(order: Pick<DraftOrder, 'cart' | 'addonIds'>): boolean {
  return order.cart.length === 0 && order.addonIds.length === 0;
}

/** Reads a saved draft; anything unreadable or malformed is treated as no draft. */
export function parseDraftOrder(serialized: string | null): DraftOrder | null {
  if (!serialized) return null;
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const draft = value as Partial<DraftOrder>;
  const cartValid = Array.isArray(draft.cart) && draft.cart.every((line) => line
    && typeof line.productId === 'string'
    && Number.isSafeInteger(line.quantity)
    && line.quantity > 0);
  const addonsValid = Array.isArray(draft.addonIds) && draft.addonIds.every((id) => typeof id === 'string');
  const referenceValid = draft.transactionReference === null || typeof draft.transactionReference === 'string';
  if (!cartValid || !addonsValid || !referenceValid || typeof draft.savedAt !== 'string') return null;
  const order: DraftOrder = {
    cart: draft.cart!.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    addonIds: [...new Set(draft.addonIds!)],
    transactionReference: draft.transactionReference ?? null,
    savedAt: draft.savedAt,
  };
  return isEmptyDraftOrder(order) ? null : order;
}

export async function loadDraftOrder(storage: DraftOrderStorage, key: string): Promise<DraftOrder | null> {
  return parseDraftOrder(await storage.getItem(key));
}

/** Saves a non-empty draft, or removes the saved draft once the order is empty. */
export async function saveDraftOrder(
  storage: DraftOrderStorage,
  key: string,
  order: Omit<DraftOrder, 'savedAt'>,
  now: Date = new Date(),
): Promise<void> {
  if (isEmptyDraftOrder(order)) {
    await storage.removeItem(key);
    return;
  }
  await storage.setItem(key, JSON.stringify({ ...order, savedAt: now.toISOString() }));
}
