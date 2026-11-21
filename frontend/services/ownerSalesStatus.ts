export type OwnerSaleStatus = 'pending' | 'completed' | 'cancelled' | 'voided';
export type OwnerInventoryProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export class SalePayloadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SalePayloadValidationError';
  }
}

export class SaleSubmissionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleSubmissionRejectedError';
  }
}

export function isRetryableSaleSubmissionError(error: unknown): boolean {
  return !(error instanceof SalePayloadValidationError || error instanceof SaleSubmissionRejectedError);
}

export function validateSaleSubmission(input: {
  transactionReference?: string | null;
  branchId?: string | null;
  paymentMethod?: string | null;
  totalAmount?: number;
  items?: Array<{ variantId?: string | null; quantity?: number; unitPrice?: number }>;
  addons?: Array<{ addonId?: string | null; quantity?: number; unitPrice?: number }>;
}): void {
  if (!input.transactionReference?.trim()) {
    throw new SalePayloadValidationError('A transaction reference is required before confirming the sale.');
  }
  if (!input.branchId?.trim()) {
    throw new SalePayloadValidationError('An assigned branch is required before confirming the sale.');
  }
  const paymentMethod = input.paymentMethod?.trim().toLowerCase();
  if (paymentMethod !== 'cash' && paymentMethod !== 'qr') {
    throw new SalePayloadValidationError('Select Cash or QR before confirming the sale.');
  }
  if (!Number.isFinite(input.totalAmount) || (input.totalAmount ?? 0) <= 0) {
    throw new SalePayloadValidationError('The sale total must be greater than zero.');
  }

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    throw new SalePayloadValidationError('Please add at least one item to the order.');
  }
  for (const item of items) {
    if (typeof item?.variantId !== 'string' || !item.variantId.trim()) {
      throw new SalePayloadValidationError('Each sale item must identify a product variant.');
    }
    if (!Number.isInteger(item.quantity) || (item.quantity ?? 0) <= 0) {
      throw new SalePayloadValidationError('Each sale item must have a positive whole-number quantity.');
    }
    if (!Number.isFinite(item.unitPrice) || (item.unitPrice ?? 0) < 0) {
      throw new SalePayloadValidationError('Each sale item must have a valid price.');
    }
  }

  if (findDuplicateSaleVariantIds(items).length > 0) {
    throw new SalePayloadValidationError('Each product variant may only appear once in a sale.');
  }

  const seenAddonIds = new Set<string>();
  for (const addon of Array.isArray(input.addons) ? input.addons : []) {
    if (typeof addon?.addonId !== 'string' || !addon.addonId.trim()) {
      throw new SalePayloadValidationError('Each add-on must identify an add-on record.');
    }
    const addonId = addon.addonId.trim();
    if (seenAddonIds.has(addonId)) {
      throw new SalePayloadValidationError('Each add-on may only appear once in a sale.');
    }
    seenAddonIds.add(addonId);
    const quantity = addon.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new SalePayloadValidationError('Each add-on must have a positive whole-number quantity.');
    }
    if (!Number.isFinite(addon.unitPrice) || (addon.unitPrice ?? 0) < 0) {
      throw new SalePayloadValidationError('Each add-on must have a valid price.');
    }
  }
}

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

export type OwnerSalesInventoryFilter = 'all' | 'confirmed' | 'needs_processing';

export function filterOwnerSalesByInventoryState<T extends {
  status?: string | null;
  inventory_processing_status?: string | null;
}>(sales: T[], filter: OwnerSalesInventoryFilter): T[] {
  const recorded = sales.filter((sale) => sale.status === 'completed');
  if (filter === 'all') return recorded;
  if (filter === 'confirmed') return recorded.filter((sale) => isInventoryProcessingSuccessful(sale));
  return recorded.filter((sale) => !isInventoryProcessingSuccessful(sale));
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
    sale.status !== 'voided' &&
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
    const variantId = typeof item?.variantId === 'string' ? item.variantId.trim() : '';
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
