export type OwnerSaleStatus = 'pending' | 'completed' | 'cancelled';
export type OwnerInventoryProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export function normalizeSalePayload(input: {
  branchId: string;
  paymentMethod: string;
  totalAmount: number;
  items?: Array<{ variantId?: string | null; quantity?: number; unitPrice?: number }>;
  addons?: Array<{ addonId?: string | null; unitPrice?: number; quantity?: number }>;
}) {
  const items = Array.isArray(input.items) ? input.items : [];
  const addons = Array.isArray(input.addons) ? input.addons : [];
  const normalizeId = (value: string | null | undefined): string => (typeof value === 'string' ? value.trim() : '');
  const normalizeAmount = (value: number | undefined, fallback = 0): number => {
    const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Number(safeValue.toFixed(2));
  };

  return {
    branchId: typeof input.branchId === 'string' ? input.branchId.trim() : '',
    paymentMethod: typeof input.paymentMethod === 'string' ? input.paymentMethod.trim().toLowerCase() : '',
    totalAmount: normalizeAmount(input.totalAmount),
    items: items
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return {
          variantId: normalizeId(item.variantId),
          quantity: Number.isFinite(item.quantity) ? item.quantity : 0,
          unitPrice: normalizeAmount(item.unitPrice),
        };
      })
      .filter((item): item is { variantId: string; quantity: number; unitPrice: number } => item !== null && item.variantId.length > 0)
      .sort((left, right) => left.variantId.localeCompare(right.variantId)),
    addons: addons
      .map((addon) => {
        if (!addon || typeof addon !== 'object') return null;
        return {
          addonId: normalizeId(addon.addonId),
          quantity: Number.isFinite(addon.quantity) ? addon.quantity : 1,
          unitPrice: normalizeAmount(addon.unitPrice),
        };
      })
      .filter((addon): addon is { addonId: string; quantity: number; unitPrice: number } => addon !== null && addon.addonId.length > 0)
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
    return `Sale ${transactionReference} was recorded, but inventory processing failed. Retry inventory processing.`;
  }
  if (inventoryProcessingStatus === 'pending' || !inventoryProcessingStatus) {
    return `Sale ${transactionReference} was recorded; inventory processing is pending.`;
  }
  if (inventoryProcessingStatus === 'processing') {
    return `Sale ${transactionReference} was recorded; inventory processing is in progress.`;
  }
  return `Sale ${transactionReference} was recorded successfully.`;
}

export function shouldOfferInventoryRetry(inventoryProcessingStatus?: string | null): boolean {
  return inventoryProcessingStatus !== 'completed';
}

export type StaffSaleRecord = {
  id: string;
  transaction_reference: string;
  branch_id: string;
  total_amount: number;
  payment_method: string;
  status: OwnerSaleStatus;
  inventory_processing_status: OwnerInventoryProcessingStatus;
  inventory_processing_error: string | null;
  created_at: string;
};

export type UnresolvedSale = StaffSaleRecord;

export function filterUnresolvedSales(
  sales: UnresolvedSale[],
  branchId: string,
): UnresolvedSale[] {
  return sales.filter((sale) =>
    sale.branch_id === branchId &&
    sale.status !== 'cancelled' &&
    shouldOfferInventoryRetry(sale.inventory_processing_status),
  );
}

export function filterStaffSaleHistory(
  sales: StaffSaleRecord[],
  branchId: string,
): StaffSaleRecord[] {
  return sales.filter((sale) => sale.branch_id === branchId && sale.status !== 'cancelled');
}

export async function runInventoryRetryOnce<T>(
  saleId: string,
  activeRetries: Set<string>,
  retry: () => Promise<T>,
): Promise<T | null> {
  if (activeRetries.has(saleId)) return null;
  activeRetries.add(saleId);
  try {
    return await retry();
  } finally {
    activeRetries.delete(saleId);
  }
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
  if (sale.status === 'pending') return 'Pending';
  if (sale.status === 'completed') {
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
  return 'Failed';
}
