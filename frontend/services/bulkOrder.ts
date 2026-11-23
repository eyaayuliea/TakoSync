// ST-02 c7 / BR-S6 (decided in #8): an order is a Bulk Order when its total
// product quantity reaches the owner-set threshold (default 5, OW-21 c10). It is a label
// only and never changes the price. Add-ons are extras on the order's items and
// are not counted.

export const BULK_ORDER_DEFAULT_THRESHOLD = 5;
export const BULK_ORDER_LABEL = 'Bulk Order';

let configuredThreshold = BULK_ORDER_DEFAULT_THRESHOLD;

/**
 * OW-21 c10: the owner-set threshold, loaded with the staff menu and the owner's
 * inventory. Every Bulk Order label (POS, receipt, reports) uses it.
 */
export function setBulkOrderThreshold(value: number | null | undefined): void {
  configuredThreshold = Number.isSafeInteger(value) && (value as number) >= 1 ? (value as number) : BULK_ORDER_DEFAULT_THRESHOLD;
}

export function bulkOrderThreshold(): number {
  return configuredThreshold;
}

export function isBulkOrder(totalQuantity: number, threshold: number = configuredThreshold): boolean {
  const limit = Number.isSafeInteger(threshold) && threshold >= 1 ? threshold : BULK_ORDER_DEFAULT_THRESHOLD;
  return Number.isFinite(totalQuantity) && totalQuantity >= limit;
}

/**
 * The Bulk Order flag of a recorded sale. The flag saved with the sale wins; until
 * the backend saves one (#32), it is derived from the sale's saved product lines.
 */
export function recordedSaleIsBulkOrder(
  savedFlag: boolean | null | undefined,
  productQuantities: readonly number[],
  threshold: number = configuredThreshold,
): boolean {
  if (typeof savedFlag === 'boolean') return savedFlag;
  return isBulkOrder(productQuantities.reduce((total, quantity) => total + Number(quantity), 0), threshold);
}
