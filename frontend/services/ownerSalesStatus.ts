export type OwnerSaleStatus = 'pending' | 'completed' | 'cancelled';
export type OwnerInventoryProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export function normalizeSalePayload(input: {
  branchId: string;
  paymentMethod: string;
  totalAmount: number;
  items: Array<{ variantId: string; quantity: number; unitPrice: number }>;
  addons: Array<{ addonId: string; unitPrice: number; quantity?: number }>;
}) {
  return {
    branchId: input.branchId,
    paymentMethod: input.paymentMethod.trim().toLowerCase(),
    totalAmount: Number(input.totalAmount.toFixed(2)),
    items: [...input.items]
      .map((item) => ({ variantId: item.variantId, quantity: item.quantity, unitPrice: Number(item.unitPrice.toFixed(2)) }))
      .sort((left, right) => left.variantId.localeCompare(right.variantId)),
    addons: [...input.addons]
      .map((addon) => ({ addonId: addon.addonId, quantity: addon.quantity ?? 1, unitPrice: Number(addon.unitPrice.toFixed(2)) }))
      .sort((left, right) => left.addonId.localeCompare(right.addonId)),
  };
}

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

export function getStaffSaleFeedback(
  transactionReference: string,
  inventoryProcessingStatus?: string | null,
): string {
  if (inventoryProcessingStatus === 'failed') {
    return `Sale ${transactionReference} was recorded but inventory processing failed.`;
  }
  if (inventoryProcessingStatus === 'pending' || inventoryProcessingStatus === 'processing' || !inventoryProcessingStatus) {
    return `Sale ${transactionReference} was recorded and is being processed.`;
  }
  return `Sale ${transactionReference} was recorded successfully.`;
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
