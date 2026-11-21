// ST-12 c2, c6: blind physical count. While counting, staff see only the item
// and their own count; the expected quantity and the comparison are revealed
// after the count is submitted.

export type CountComparison = {
  kind: 'match' | 'lower' | 'higher';
  difference: number;
};

/** Compares an actual count with the expected quantity frozen at submission. */
export function compareCount(expected: number, actual: number): CountComparison {
  // Counts have at most three decimals; compare in thousandths to avoid float noise.
  const difference = Math.round((actual - expected) * 1000) / 1000;
  if (difference === 0) return { kind: 'match', difference: 0 };
  return { kind: difference < 0 ? 'lower' : 'higher', difference };
}

/** "Matches", "Lower by 2 kg", or "Higher by 0.5 kg". */
export function countComparisonLabel(
  comparison: CountComparison,
  formatQuantity: (quantity: number) => string,
): string {
  if (comparison.kind === 'match') return 'Matches';
  const amount = formatQuantity(Math.abs(comparison.difference));
  return comparison.kind === 'lower' ? `Lower by ${amount}` : `Higher by ${amount}`;
}

/** How many items have a count entered. */
export function blindCountProgress(lines: Array<{ physicalQuantity: string }>): { counted: number; total: number } {
  return {
    counted: lines.filter((line) => line.physicalQuantity.trim() !== '').length,
    total: lines.length,
  };
}
