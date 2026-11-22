/**
 * Decision #11 / ST-02 c6: the POS blocks orders the branch stock cannot make.
 *
 * public.sale_stock_requirements(branch) returns, per product variant, the
 * ingredient quantity one unit consumes (the same rules the server uses when it
 * records a sale) and the branch stock. Products share ingredients such as the
 * prepared batter, so the whole order is checked, not each line alone. The server
 * re-checks when the sale is saved and refuses it with "Order changed".
 *
 * This module has no imports so it can be unit tested directly.
 */

export type StockRequirement = {
  variantId: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  perUnit: number;
};

export type SaleStockSnapshot = {
  requirements: StockRequirement[];
  stock: Record<string, number>;
};

export type StockShortage = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  required: number;
  available: number;
};

export type OrderLine = { productId: string; quantity: number };

const EPSILON = 1e-9;

export function parseSaleStockSnapshot(value: unknown): SaleStockSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { requirements?: unknown; stock?: unknown };
  if (!Array.isArray(body.requirements) || !body.stock || typeof body.stock !== 'object') return null;
  const requirements: StockRequirement[] = [];
  for (const row of body.requirements) {
    const r = row as Record<string, unknown>;
    const perUnit = Number(r.per_unit);
    if (typeof r.variant_id !== 'string' || typeof r.ingredient_id !== 'string' || !(perUnit > 0)) continue;
    requirements.push({
      variantId: r.variant_id,
      ingredientId: r.ingredient_id,
      ingredientName: typeof r.ingredient_name === 'string' ? r.ingredient_name : r.ingredient_id,
      unit: typeof r.unit === 'string' ? r.unit : '',
      perUnit,
    });
  }
  const stock: Record<string, number> = {};
  for (const [ingredientId, quantity] of Object.entries(body.stock as Record<string, unknown>)) {
    const amount = Number(quantity);
    if (Number.isFinite(amount)) stock[ingredientId] = amount;
  }
  return { requirements, stock };
}

/** The first ingredient the order needs more of than the branch has, or null. */
export function orderStockShortage(order: OrderLine[], snapshot: SaleStockSnapshot | null): StockShortage | null {
  if (!snapshot) return null;
  const needed = new Map<string, StockShortage>();
  for (const line of order) {
    if (!(line.quantity > 0)) continue;
    for (const req of snapshot.requirements) {
      if (req.variantId !== line.productId) continue;
      const entry = needed.get(req.ingredientId) ?? {
        ingredientId: req.ingredientId,
        ingredientName: req.ingredientName,
        unit: req.unit,
        required: 0,
        available: Math.max(0, snapshot.stock[req.ingredientId] ?? 0),
      };
      entry.required += req.perUnit * line.quantity;
      needed.set(req.ingredientId, entry);
    }
  }
  for (const entry of [...needed.values()].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
    if (entry.required > entry.available + EPSILON) return entry;
  }
  return null;
}

/** ST-02 c6: a product the stock cannot make even one of is Out of Stock. */
export function isVariantOutOfStock(variantId: string, snapshot: SaleStockSnapshot | null): boolean {
  return orderStockShortage([{ productId: variantId, quantity: 1 }], snapshot) !== null;
}

/** The order with `quantity` of `productId` (replacing its current line). */
export function withLineQuantity(order: OrderLine[], productId: string, quantity: number): OrderLine[] {
  const rest = order.filter((line) => line.productId !== productId);
  return quantity > 0 ? [...rest, { productId, quantity }] : rest;
}

function amount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function stockShortageMessage(productLabel: string, shortage: StockShortage): string {
  return `${productLabel}: not enough ${shortage.ingredientName} in stock `
    + `(needs ${amount(shortage.required)} ${shortage.unit}, ${amount(shortage.available)} ${shortage.unit} available).`;
}
