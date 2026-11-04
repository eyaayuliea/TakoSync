export type OwnerSaleStatus = 'pending' | 'completed' | 'cancelled';
export type OwnerInventoryProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export function shouldIncludeOwnerSaleInSummary(
  sale: { status?: string | null },
): boolean {
  return sale.status === 'completed';
}

export function isInventoryProcessingSuccessful(
  sale: { inventory_processing_status?: string | null },
): boolean {
  return sale.inventory_processing_status === 'completed';
}

export function findDuplicateSaleVariantIds(
  items: Array<{ variantId?: string | null }>,
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const variantId = item.variantId?.trim();
    if (!variantId) continue;
    if (seen.has(variantId)) {
      duplicates.add(variantId);
      continue;
    }
    seen.add(variantId);
  }
  return [...duplicates];
}

export function calculatePreparedBatterConsumption(
  applicablePieces: number,
  preparedQuantity: number,
  estimatedYieldPieces: number,
): number {
  if (!Number.isFinite(applicablePieces) || !Number.isFinite(preparedQuantity) || !Number.isFinite(estimatedYieldPieces)) {
    return 0;
  }
  if (applicablePieces <= 0 || preparedQuantity <= 0 || estimatedYieldPieces <= 0) {
    return 0;
  }
  return (preparedQuantity * applicablePieces) / estimatedYieldPieces;
}

export function getOwnerSaleInventoryStatusLabel(
  sale: {
    status?: string | null;
    inventory_processing_status?: string | null;
  },
): 'Completed' | 'Pending' | 'Processing' | 'Failed' {
  if (sale.status !== 'completed') return 'Failed';
  switch (sale.inventory_processing_status) {
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    case 'failed':
      return 'Failed';
    default:
      return 'Completed';
  }
}
