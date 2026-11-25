// "Deduction per order" and "Orders covered by stock", as on the team's inventory
// catalog sheet: how much of an item one standard order uses, and how many such
// orders the stock on hand still covers.
//
// The sheet assumes one order size; the menu sells several, so one size is the
// standard order here: 4 pieces (the team's choice, 2026-11-26). The amounts come
// from the same rules the server uses when it records a sale
// (public.sale_stock_requirements), so they follow the owner's recipes.
//
// This module has no imports so it can be unit tested directly.

export const STANDARD_ORDER_PIECES = 4;

export type OrderUsage = {
  /** What one standard order uses, in the item's unit. */
  perOrder: number;
  unit: string;
};

type Requirement = { variantId: string; ingredientId: string; unit: string; perUnit: number };

/**
 * Per ingredient, what one standard order uses. Products can differ (a combo also
 * uses cheese; the owner may set different amounts), so the largest amount among
 * the standard-size servings is used: "orders covered" is then never too high.
 * Items no order uses (flour, eggs: they go into the batter) are left out.
 */
export function orderUsageByIngredient(
  requirements: readonly Requirement[],
  pieceCountByVariant: ReadonlyMap<string, number>,
  standardPieces: number = STANDARD_ORDER_PIECES,
): Map<string, OrderUsage> {
  const usage = new Map<string, OrderUsage>();
  for (const requirement of requirements) {
    if (pieceCountByVariant.get(requirement.variantId) !== standardPieces) continue;
    if (!(requirement.perUnit > 0)) continue;
    const current = usage.get(requirement.ingredientId);
    if (!current || requirement.perUnit > current.perOrder) {
      usage.set(requirement.ingredientId, { perOrder: requirement.perUnit, unit: requirement.unit });
    }
  }
  return usage;
}

/** Whole standard orders the stock covers; null for an item no order uses or without a stock record. */
export function ordersCovered(stock: number | null | undefined, usage: OrderUsage | null | undefined): number | null {
  if (!usage || !(usage.perOrder > 0) || stock === null || stock === undefined) return null;
  if (!(stock > 0)) return 0;
  // A hair of tolerance so 6000 / 15 is 400, not 399, after decimal arithmetic.
  return Math.floor(stock / usage.perOrder + 1e-9);
}

function amount(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** "32 g" — the amount one standard order uses. */
export function orderUsageText(usage: OrderUsage): string {
  return `${amount(usage.perOrder)} ${usage.unit}`;
}

/** "250 orders", "1 order", "0 orders". */
export function ordersCoveredText(orders: number): string {
  return `${orders.toLocaleString('en-PH')} ${orders === 1 ? 'order' : 'orders'}`;
}

/** One line for an item card: "Per order: 32 g · covers 250 orders"; null when no order uses the item. */
export function orderUsageSummary(stock: number | null | undefined, usage: OrderUsage | null | undefined): string | null {
  const orders = ordersCovered(stock, usage);
  if (!usage || orders === null) return null;
  return `Per order: ${orderUsageText(usage)} · covers ${ordersCoveredText(orders)}`;
}

export const ORDER_USAGE_NOTE = `One order is counted as ${STANDARD_ORDER_PIECES} pieces.`;
