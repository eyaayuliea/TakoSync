/**
 * Single source of truth for inventory status rules (Staff Mobile + Owner Mobile).
 *
 * Approved rules (owner message pt29u, Final Mobile Completion and Verification):
 *   - Out of Stock     : available quantity is exactly 0.
 *   - Low Stock        : available quantity is > 0 and <= the owner-defined minimum stock.
 *   - Near Expiration  : the batch expires today or within the next NEAR_EXPIRATION_DEFAULT_DAYS
 *                        (3) calendar days. The window is the owner's "expiration alert period"
 *                        (ST-10 criterion 4, OM-10 criterion 5); 3 days is its default.
 *   - Expired          : the expiration date is at least 1 calendar day in the past.
 *                        A batch that expires today is therefore NOT expired.
 *
 * No other threshold exists. Dates are compared as Asia/Manila calendar days.
 * This module has no imports so it can be unit tested directly.
 */

export const NEAR_EXPIRATION_DEFAULT_DAYS = 3;

export type StockLevel = 'Out of Stock' | 'Low Stock' | 'In Stock';
export type ExpirationLevel = 'Expired' | 'Near Expiration';
export type InventoryStatusLabel = 'Out of Stock' | 'Low Stock' | ExpirationLevel | 'Normal';

const MS_PER_DAY = 86_400_000;

export function classifyStockLevel(quantity: number, minimumStock: number): StockLevel {
  if (quantity <= 0) return 'Out of Stock';
  return quantity <= minimumStock ? 'Low Stock' : 'In Stock';
}

/** Calendar days from today until the expiration date: 0 = today, -1 = yesterday, 3 = in 3 days. */
export function calendarDaysUntil(expirationDate: string, today: string): number {
  const expiration = Date.parse(`${expirationDate.slice(0, 10)}T00:00:00.000Z`);
  const reference = Date.parse(`${today.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(expiration) || !Number.isFinite(reference)) {
    throw new RangeError('Expiration dates must use a valid YYYY-MM-DD date.');
  }
  return Math.round((expiration - reference) / MS_PER_DAY);
}

/** Asia/Manila calendar date (YYYY-MM-DD) for an instant. */
export function manilaCalendarDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function classifyExpirationLevel(
  daysUntilExpiration: number,
  nearExpirationDays: number = NEAR_EXPIRATION_DEFAULT_DAYS,
): ExpirationLevel | null {
  if (daysUntilExpiration < 0) return 'Expired';
  return daysUntilExpiration <= nearExpirationDays ? 'Near Expiration' : null;
}

/** Use the owner's configured period when it is a valid whole number of days, otherwise the default. */
export function resolveNearExpirationDays(configured: number | null | undefined): number {
  return typeof configured === 'number' && Number.isInteger(configured) && configured >= 0
    ? configured
    : NEAR_EXPIRATION_DEFAULT_DAYS;
}

/**
 * Item-level status. Out of Stock wins because an item with nothing available has no batch
 * left to expire; then Expired, Near Expiration, Low Stock, Normal.
 */
export function classifyInventoryStatus(input: {
  quantity: number;
  minimumStock: number;
  expirationDate?: string | null;
  today?: string;
  nearExpirationDays?: number;
}): InventoryStatusLabel {
  const stock = classifyStockLevel(input.quantity, input.minimumStock);
  if (stock === 'Out of Stock') return stock;
  if (input.expirationDate) {
    const days = calendarDaysUntil(input.expirationDate, input.today ?? manilaCalendarDate());
    const expiration = classifyExpirationLevel(days, input.nearExpirationDays);
    if (expiration) return expiration;
  }
  return stock === 'Low Stock' ? 'Low Stock' : 'Normal';
}
