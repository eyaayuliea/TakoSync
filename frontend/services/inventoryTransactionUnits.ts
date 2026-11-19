// Converts a staff-entered quantity into the unit stored in ingredients.unit, which the
// inventory RPCs require to match exactly. Only the prepared batter differs: it is shown in
// millilitres but stored in whole bottles (1 bottle = 680 ml).

export const PREPARED_BATTER_ID = 'prepared-batter';
export const BATTER_BOTTLE_ML = 680;

export function toStoredTransactionUnit(
  item: { id: string; unit: string },
  quantity: number,
): { unit: string; quantity: number } {
  if (item.id === PREPARED_BATTER_ID && item.unit === 'ml') {
    const bottles = quantity / BATTER_BOTTLE_ML;
    const whole = Math.round(bottles);
    if (whole < 1 || Math.abs(bottles - whole) > 1e-6) {
      throw new Error('Prepared batter is recorded in whole bottles (1 bottle = 680 ml). Enter a multiple of 680 ml.');
    }
    return { unit: 'bottle', quantity: whole };
  }
  return { unit: item.unit, quantity };
}

const DEFINITIVE_REJECTION_CODES = new Set(['22023', '22003', '22P02', '23502', '23503', '23505', '23514', '42501']);

/**
 * True when the server rejected the request in a way that guarantees nothing was saved
 * (the RPC is atomic and validates before writing), as opposed to a network failure or
 * timeout where the outcome is unknown and the request must stay retryable.
 */
export function isDefinitiveInventoryRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && DEFINITIVE_REJECTION_CODES.has(code);
}

/**
 * A saved (unresolved) request whose lines name an ingredient/unit that does not match the
 * database can never succeed, because the server requires an exact ingredient + unit match.
 */
export function pendingRequestIsProvablyInvalid(
  transactions: readonly { ingredientId: string; unit: string }[],
  catalog: ReadonlyMap<string, string>,
): boolean {
  return transactions.some((transaction) => catalog.get(transaction.ingredientId) !== transaction.unit);
}
