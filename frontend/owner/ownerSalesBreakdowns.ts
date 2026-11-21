// OM-04 c4, OM-05 c4, OM-06 c4, OM-07 c2/c5, OM-08 c2/c3: breakdowns of the
// recorded (completed) sales the Sales screen already loads. Amounts are added
// in centavos so totals match the saved sales exactly (OM-04 c7).

import { manilaBusinessDate } from '../services/staffDailySession.ts';
import { addDaysToKey, weekKeyBounds } from './ownerSalesCalendar.ts';

type SaleLike = { branch_id: string; total_amount: number | string; created_at: string };

function cents(value: number | string): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function dayKeyOf(sale: SaleLike): string | null {
  const date = new Date(sale.created_at);
  return Number.isNaN(date.getTime()) ? null : manilaBusinessDate(date);
}

export type SalesBucket = { key: string; label: string; start: string; end: string; total: number; count: number };

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function shortDate(key: string): string {
  const date = new Date(`${key}T00:00:00Z`);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function fillBuckets(sales: readonly SaleLike[], buckets: Array<Omit<SalesBucket, 'total' | 'count'>>): SalesBucket[] {
  const totals = buckets.map(() => ({ cents: 0, count: 0 }));
  for (const sale of sales) {
    const day = dayKeyOf(sale);
    if (!day) continue;
    const index = buckets.findIndex((bucket) => day >= bucket.start && day <= bucket.end);
    if (index < 0) continue;
    totals[index].cents += cents(sale.total_amount);
    totals[index].count += 1;
  }
  return buckets.map((bucket, index) => ({ ...bucket, total: totals[index].cents / 100, count: totals[index].count }));
}

/** OM-05 c4: the sales of each day of a week (Monday to Sunday), up to today. */
export function salesPerDay(sales: readonly SaleLike[], weekStart: string, today: string): SalesBucket[] {
  const days: Array<Omit<SalesBucket, 'total' | 'count'>> = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const key = addDaysToKey(weekStart, offset);
    if (key > today) break;
    days.push({ key, label: dayLabel(key), start: key, end: key });
  }
  return fillBuckets(sales, days);
}

/**
 * OM-06 c4: the sales of each week of a month. Weeks run Monday to Sunday, as
 * on the Weekly tab, and are cut at the month's first and last day and today.
 */
export function salesPerWeek(sales: readonly SaleLike[], monthStart: string, monthEnd: string, today: string): SalesBucket[] {
  const lastDay = monthEnd < today ? monthEnd : today;
  const weeks: Array<Omit<SalesBucket, 'total' | 'count'>> = [];
  let cursor = monthStart;
  let number = 1;
  while (cursor <= lastDay) {
    const weekEnd = weekKeyBounds(cursor).end;
    const end = weekEnd < lastDay ? weekEnd : lastDay;
    weeks.push({
      key: cursor,
      label: `Week ${number} · ${cursor === end ? shortDate(cursor) : `${shortDate(cursor)}–${new Date(`${end}T00:00:00Z`).getUTCDate()}`}`,
      start: cursor,
      end,
    });
    cursor = addDaysToKey(end, 1);
    number += 1;
  }
  return fillBuckets(sales, weeks);
}

export type BranchSalesRow = { id: string; name: string; total: number; count: number };

/** OM-07 c2, c5: every branch with its transactions and total, including branches without sales. */
export function salesPerBranch(sales: readonly SaleLike[], branches: Array<{ id: string; name: string }>): BranchSalesRow[] {
  return branches.map((branch) => {
    let total = 0;
    let count = 0;
    for (const sale of sales) {
      if (sale.branch_id !== branch.id) continue;
      total += cents(sale.total_amount);
      count += 1;
    }
    return { id: branch.id, name: branch.name, total: total / 100, count };
  });
}

/** OM-04 c3 / c7: the total of the sales in centavo-exact pesos. */
export function totalOfSales(sales: readonly SaleLike[]): number {
  return sales.reduce((sum, sale) => sum + cents(sale.total_amount), 0) / 100;
}

export type ProductVariantSummary = {
  id: string;
  name: string;
  variantLabel: string | null;
  quantity: number;
  total: number;
};

/** OM-08 c2, c4: each product by flavor and portion, highest quantity first. */
export function summarizeProductVariants(
  items: ReadonlyArray<{ product_id: string; product_name: string; variant_label?: string | null; quantity: number | string; subtotal: number | string }>,
): ProductVariantSummary[] {
  const grouped = new Map<string, { id: string; name: string; variantLabel: string | null; quantity: number; cents: number }>();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const variantLabel = item.variant_label?.trim() || null;
    const id = `${item.product_id}:${variantLabel ?? ''}`;
    const existing = grouped.get(id) ?? { id, name: item.product_name, variantLabel, quantity: 0, cents: 0 };
    existing.quantity += quantity;
    existing.cents += cents(item.subtotal);
    grouped.set(id, existing);
  }
  return [...grouped.values()]
    .map(({ cents: amount, ...row }) => ({ ...row, total: amount / 100 }))
    .sort((left, right) => right.quantity - left.quantity || right.total - left.total || left.name.localeCompare(right.name));
}

export type AddonSummary = { id: string; name: string; quantity: number; total: number };

/** OM-08 c3: optional add-ons sold, highest quantity first. */
export function summarizeAddons(
  addons: ReadonlyArray<{ addon_id: string; addon_name: string; quantity: number | string; subtotal: number | string }>,
): AddonSummary[] {
  const grouped = new Map<string, { id: string; name: string; quantity: number; cents: number }>();
  for (const addon of addons) {
    const quantity = Number(addon.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const existing = grouped.get(addon.addon_id) ?? { id: addon.addon_id, name: addon.addon_name, quantity: 0, cents: 0 };
    existing.quantity += quantity;
    existing.cents += cents(addon.subtotal);
    grouped.set(addon.addon_id, existing);
  }
  return [...grouped.values()]
    .map(({ cents: amount, ...row }) => ({ ...row, total: amount / 100 }))
    .sort((left, right) => right.quantity - left.quantity || left.name.localeCompare(right.name));
}
