// A product recipe line is used either once for each serving sold (sauce,
// packaging, a pick) or for every piece in the size sold (octopus per ball).
// The database column is recipes.consumption_basis (migration 202611260001).
//
// This module has no imports so it can be unit tested directly.

export type RecipeBasis = 'per_order' | 'per_piece';

export const RECIPE_BASIS_OPTIONS: ReadonlyArray<{ value: RecipeBasis; label: string }> = [
  { value: 'per_order', label: 'Per order' },
  { value: 'per_piece', label: 'Per piece' },
];

/** The stored value, or per order for anything else (a database from before the column existed). */
export function recipeBasisOf(value: unknown): RecipeBasis {
  return value === 'per_piece' ? 'per_piece' : 'per_order';
}

/** "per piece" / "per order", to follow a quantity: "8 g per piece". */
export function recipeBasisLabel(basis: RecipeBasis): string {
  return basis === 'per_piece' ? 'per piece' : 'per order';
}

export function recipeBasisFromLabel(label: string): RecipeBasis {
  return RECIPE_BASIS_OPTIONS.find((option) => option.label === label)?.value ?? 'per_order';
}

/** What one serving of a size uses: per-piece amounts times its pieces, per-order amounts once. */
export function recipeAmountPerServing(quantityRequired: number, basis: RecipeBasis, pieceCount: number): number {
  return basis === 'per_piece' ? quantityRequired * pieceCount : quantityRequired;
}
