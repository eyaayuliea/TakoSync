// Per-item expiry rules on the Owner Web Portal (Configuration → Expiration Alert
// settings). Each item has a shelf life and a near-expiration window:
//   * shelf life blank  = the item never expires and is not date-tracked;
//   * window blank      = the general alert period is used.

export type ExpiryRuleRow = {
  ingredientId: string;
  name: string;
  category: string;
  shelfLifeDays: number | null;
  nearExpirationDays: number | null;
};

export function expiryRuleRows(input: {
  ingredients: ReadonlyArray<{ id: string; name: string; category_id: string; shelf_life_days?: number | null; near_expiration_days?: number | null }>;
  categories: ReadonlyArray<{ id: string; name: string }>;
  query: string;
}): ExpiryRuleRow[] {
  const categoryName = new Map(input.categories.map((category) => [category.id, category.name]));
  const query = input.query.trim().toLowerCase();
  return input.ingredients
    .filter((item) => !query || item.name.toLowerCase().includes(query))
    .map((item) => ({
      ingredientId: item.id,
      name: item.name,
      category: categoryName.get(item.category_id) ?? '—',
      shelfLifeDays: item.shelf_life_days ?? null,
      nearExpirationDays: item.near_expiration_days ?? null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Shelf life: blank (never expires) or a whole number of days from 1 to 3650. */
export function parseShelfLifeDays(draft: string, itemName: string): { value: number | null } | { error: string } {
  const text = draft.trim();
  if (text === '') return { value: null };
  const value = Number(text);
  if (!/^\d+$/.test(text) || value < 1 || value > 3650) {
    return { error: `Enter the shelf life of ${itemName} as a whole number of days from 1 to 3650, or leave it blank if it never expires.` };
  }
  return { value };
}

/** Near-expiration window: blank (use the general period) or a whole number of days from 0 to 365. */
export function parseItemAlertDays(draft: string, itemName: string): { value: number | null } | { error: string } {
  const text = draft.trim();
  if (text === '') return { value: null };
  const value = Number(text);
  if (!/^\d+$/.test(text) || value > 365) {
    return { error: `Enter the alert window of ${itemName} as a whole number of days from 0 to 365, or leave it blank to use the general period.` };
  }
  return { value };
}

/** A window longer than the shelf life would flag the item the day it arrives. */
export function expiryRuleWarning(shelfLifeDays: number | null, nearExpirationDays: number | null): string | null {
  if (shelfLifeDays === null || nearExpirationDays === null) return null;
  return nearExpirationDays >= shelfLifeDays
    ? 'The alert window is as long as the shelf life, so new stock would show Near Expiration on arrival.'
    : null;
}

/** What the rule means, in words, for the row and for the confirmation message. */
export function expiryRuleSummary(row: Pick<ExpiryRuleRow, 'shelfLifeDays' | 'nearExpirationDays'>, generalDays: number): string {
  if (row.shelfLifeDays === null) return 'Never expires · not date-tracked';
  const window = row.nearExpirationDays ?? generalDays;
  const alert = window === 0 ? 'alert on the day it is due' : `alert ${window} ${window === 1 ? 'day' : 'days'} before`;
  return `Keeps ${row.shelfLifeDays} ${row.shelfLifeDays === 1 ? 'day' : 'days'} · ${alert}${row.nearExpirationDays === null ? ' (general period)' : ''}`;
}
