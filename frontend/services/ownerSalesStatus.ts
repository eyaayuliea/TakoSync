export type OwnerSaleStatus = 'pending' | 'completed' | 'cancelled';
export type OwnerInventoryProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export function shouldIncludeOwnerSaleInSummary(
  sale: { status?: string | null },
): boolean {
  return sale.status === 'completed';
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
