// OW-14 Total Ingredient Inventory Report: one snapshot of the branch inventory
// shown as three views (Detailed, Summary, Information). The views are built
// from the same rows, so they always agree (c8) and switching views never
// reloads or changes the figures (c9).
import type { ReportSection } from './reportDocument';

export const TOTAL_INVENTORY_VIEWS = ['Detailed', 'Summary', 'Information'] as const;
export type TotalInventoryView = (typeof TOTAL_INVENTORY_VIEWS)[number];

export type TotalInventoryRow = {
  name: string;
  category: string;
  branch: string;
  qty: number | null;
  unit: string;
  status: string;
  expiry: string;
  batches: string;
  minimumStock?: number | null;
  stockLevel?: 'Normal' | 'Low Stock' | 'Out of Stock' | 'Not tracked';
};

const number = (value: number) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 }).format(value);
const levelOf = (row: TotalInventoryRow) => row.stockLevel ?? 'Not tracked';
const LEVELS = ['Normal', 'Low Stock', 'Out of Stock', 'Not tracked'] as const;

export function buildTotalInventoryViews(
  rows: TotalInventoryRow[],
  context: { branch: string; asOf: string },
): Record<TotalInventoryView, ReportSection[]> {
  const sorted = [...rows].sort((left, right) =>
    left.category.localeCompare(right.category) || left.name.localeCompare(right.name) || left.branch.localeCompare(right.branch));
  const allBranches = new Set(rows.map((row) => row.branch)).size > 1;

  // c2, c3: every ingredient with quantity, unit, category, minimum stock, status, and lots.
  const detailed: ReportSection[] = sorted.length
    ? [{
      table: {
        headers: ['Ingredient', 'Category', ...(allBranches ? ['Branch'] : []), 'Quantity', 'Minimum stock', 'Stock status', 'Expiration · lots'],
        rows: sorted.map((row) => {
          const expiryNote = row.status === 'Near Expiration' || row.status === 'Expired' ? ` · ${row.status}` : '';
          return [
            row.name,
            row.category,
            ...(allBranches ? [row.branch] : []),
            row.qty === null ? '—' : `${number(row.qty)} ${row.unit}`,
            row.minimumStock === null || row.minimumStock === undefined ? '—' : `${number(row.minimumStock)} ${row.unit}`,
            `${levelOf(row)}${expiryNote}`,
            row.batches === 'No active batches' ? '—' : row.batches.split('; ').join('\n'),
          ];
        }),
      },
    }]
    : [{ notes: ['No ingredients are set up for the selected branch.'] }];

  // c4, c5: totals per category and overall counts by stock status.
  const counts = new Map<string, number>(LEVELS.map((level) => [level, 0]));
  const categories = new Map<string, { items: number; quantities: Map<string, number>; levels: Map<string, number> }>();
  for (const row of sorted) {
    counts.set(levelOf(row), (counts.get(levelOf(row)) ?? 0) + 1);
    const category = categories.get(row.category) ?? { items: 0, quantities: new Map(), levels: new Map() };
    category.items += 1;
    if (row.qty !== null) category.quantities.set(row.unit, Math.round(((category.quantities.get(row.unit) ?? 0) + row.qty) * 1000) / 1000);
    category.levels.set(levelOf(row), (category.levels.get(levelOf(row)) ?? 0) + 1);
    categories.set(row.category, category);
  }
  const overall: Array<[string, string]> = [
    ['Items', String(sorted.length)],
    ['Normal', String(counts.get('Normal'))],
    ['Low Stock', String(counts.get('Low Stock'))],
    ['Out of Stock', String(counts.get('Out of Stock'))],
    ...((counts.get('Not tracked') ?? 0) > 0 ? [['Not tracked', String(counts.get('Not tracked'))] as [string, string]] : []),
  ];
  const summary: ReportSection[] = [
    { heading: 'Overall stock status', summary: overall },
    {
      heading: 'Totals per category',
      table: {
        headers: ['Category', 'Items', 'Total quantity', 'Normal', 'Low Stock', 'Out of Stock'],
        rows: [...categories.entries()].map(([name, category]) => [
          name,
          String(category.items),
          [...category.quantities.entries()].map(([unit, value]) => `${number(value)} ${unit}`).join('\n') || '—',
          String(category.levels.get('Normal') ?? 0),
          String(category.levels.get('Low Stock') ?? 0),
          String(category.levels.get('Out of Stock') ?? 0),
        ]),
      },
    },
  ];

  // c6, c7: what the report is, for which branch, as of when, and how it is computed.
  const information: ReportSection[] = [{
    summary: [['Branch', context.branch], ['Figures as of', context.asOf], ['Items', String(sorted.length)]],
    compact: true,
    notes: [
      'The Total Ingredient Inventory Report lists every ingredient and supply of the selected branch with its expected quantity, minimum stock level and stock status, and totals them per category. Retired (inactive) ingredients are not included.',
      'The expected quantity of each item is the sum of its ledger movements: Stock-In adds stock; Sales Consumption, Waste, Spillage and Spoilage remove it; Void Reversal, Entry Reversal and Authorized Adjustment entries correct it. A prepared batter batch moves its raw ingredients into prepared batter.',
      'Stock status: Out of Stock at zero or below; Low Stock at or below the minimum stock level (or the reorder point when it is higher); otherwise Normal. Near Expiration and Expired are noted beside the stock status.',
      'The Detailed and Summary views are built from this same snapshot, so their counts always agree.',
    ],
  }];

  return { Detailed: detailed, Summary: summary, Information: information };
}
