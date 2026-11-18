import type { OwnerSale, OwnerSaleItem, OwnerSalesData } from '../services/takosync';

export type DailySalesForcedState = 'success' | 'empty' | 'loading' | 'error' | 'branch_variant' | null;

export const DAILY_SALES_SAMPLE_DATE = '2026-11-12';
export const WEEKLY_SALES_LABEL = '9–15 Nov 2026';

const sampleSales: OwnerSale[] = [
  {
    id: 'txn-1112-0047',
    transaction_reference: 'TXN-1112-0047',
    branch_id: 'branch-1',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 348,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T15:42:00+08:00',
  },
  {
    id: 'txn-1112-0046',
    transaction_reference: 'TXN-1112-0046',
    branch_id: 'branch-2',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 213,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T15:15:00+08:00',
  },
  {
    id: 'txn-1112-0045',
    transaction_reference: 'TXN-1112-0045',
    branch_id: 'branch-3',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 267,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T14:58:00+08:00',
  },
  {
    id: 'txn-1112-0044',
    transaction_reference: 'TXN-1112-0044',
    branch_id: 'branch-1',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 129,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T14:31:00+08:00',
  },
  {
    id: 'txn-1112-0043',
    transaction_reference: 'TXN-1112-0043',
    branch_id: 'branch-2',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 89,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T13:47:00+08:00',
  },
  {
    id: 'txn-1112-0047-b2',
    transaction_reference: 'TXN-1112-0047',
    branch_id: 'branch-2',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 320,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T15:42:00+08:00',
  },
  {
    id: 'txn-1112-0048-b1',
    transaction_reference: 'TXN-1112-0048',
    branch_id: 'branch-1',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 1368,
    payment_method: 'Cash',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T13:20:00+08:00',
  },
  {
    id: 'txn-1112-0048-b3',
    transaction_reference: 'TXN-1112-0048',
    branch_id: 'branch-3',
    staff_id: 'staff-ana',
    recorded_by_name: 'Ana Reyes',
    total_amount: 831,
    payment_method: 'QR',
    status: 'completed',
    inventory_processing_status: 'completed',
    created_at: '2026-11-12T13:20:00+08:00',
  },
];

const sampleItems: OwnerSaleItem[] = [
  { id: 'item-0047-8', sale_id: 'txn-1112-0047', product_id: 'takoyaki-8', product_name: 'Takoyaki (8 pcs)', quantity: 20, unit_price: 89, subtotal: 1780 },
  { id: 'item-0047-12', sale_id: 'txn-1112-0047', product_id: 'takoyaki-12', product_name: 'Takoyaki (12 pcs)', quantity: 15, unit_price: 129, subtotal: 1935 },
  { id: 'item-0047-tea', sale_id: 'txn-1112-0047', product_id: 'iced-tea', product_name: 'Iced Tea', quantity: 10, unit_price: 35, subtotal: 350 },
  { id: 'item-0047-16', sale_id: 'txn-1112-0047', product_id: 'takoyaki-16', product_name: 'Takoyaki (16 pcs)', quantity: 8, unit_price: 169, subtotal: 1352 },
  { id: 'item-0046-8', sale_id: 'txn-1112-0046', product_id: 'takoyaki-8', product_name: 'Takoyaki (8 pcs)', quantity: 2, unit_price: 89, subtotal: 178 },
  { id: 'item-0046-12', sale_id: 'txn-1112-0046', product_id: 'takoyaki-12', product_name: 'Takoyaki (12 pcs)', quantity: 8, unit_price: 129, subtotal: 1032 },
  { id: 'item-0046-tea', sale_id: 'txn-1112-0046', product_id: 'iced-tea', product_name: 'Iced Tea', quantity: 1, unit_price: 35, subtotal: 35 },
  { id: 'item-0046-16', sale_id: 'txn-1112-0046', product_id: 'takoyaki-16', product_name: 'Takoyaki (16 pcs)', quantity: 5, unit_price: 169, subtotal: 845 },
  { id: 'item-0045-8', sale_id: 'txn-1112-0045', product_id: 'takoyaki-8', product_name: 'Takoyaki (8 pcs)', quantity: 10, unit_price: 89, subtotal: 890 },
  { id: 'item-0045-12', sale_id: 'txn-1112-0045', product_id: 'takoyaki-12', product_name: 'Takoyaki (12 pcs)', quantity: 8, unit_price: 129, subtotal: 1032 },
  { id: 'item-0045-tea', sale_id: 'txn-1112-0045', product_id: 'iced-tea', product_name: 'Iced Tea', quantity: 6, unit_price: 35, subtotal: 210 },
  { id: 'item-0045-16', sale_id: 'txn-1112-0045', product_id: 'takoyaki-16', product_name: 'Takoyaki (16 pcs)', quantity: 5, unit_price: 169, subtotal: 845 },
];

const additionalWeeklySales: OwnerSale[] = [
  { id: 'txn-1110-0031', transaction_reference: 'TXN-1110-0031', branch_id: 'branch-1', recorded_by_name: 'Ana Reyes', total_amount: 3497, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-10T10:30:00+08:00' },
  { id: 'txn-1110-0032', transaction_reference: 'TXN-1110-0032', branch_id: 'branch-2', recorded_by_name: 'Ana Reyes', total_amount: 3521, payment_method: 'QR', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-10T13:10:00+08:00' },
  { id: 'txn-1111-0033', transaction_reference: 'TXN-1111-0033', branch_id: 'branch-3', recorded_by_name: 'Ana Reyes', total_amount: 3214, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-11T09:20:00+08:00' },
  { id: 'txn-1111-0034', transaction_reference: 'TXN-1111-0034', branch_id: 'branch-1', recorded_by_name: 'Ana Reyes', total_amount: 3678, payment_method: 'QR', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-11T16:05:00+08:00' },
  { id: 'txn-1109-0035', transaction_reference: 'TXN-1109-0035', branch_id: 'branch-2', recorded_by_name: 'Ana Reyes', total_amount: 2986, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-09T11:45:00+08:00' },
  { id: 'txn-1109-0036', transaction_reference: 'TXN-1109-0036', branch_id: 'branch-3', recorded_by_name: 'Ana Reyes', total_amount: 3407, payment_method: 'QR', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-09T18:15:00+08:00' },
  { id: 'txn-1109-0037', transaction_reference: 'TXN-1109-0037', branch_id: 'branch-1', recorded_by_name: 'Ana Reyes', total_amount: 3650, payment_method: 'Cash', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-09T19:30:00+08:00' },
  { id: 'txn-1113-0038', transaction_reference: 'TXN-1113-0038', branch_id: 'branch-2', recorded_by_name: 'Ana Reyes', total_amount: 4036, payment_method: 'QR', status: 'completed', inventory_processing_status: 'completed', created_at: '2026-11-13T12:20:00+08:00' },
];

export function getForcedDailySalesState(): DailySalesForcedState {
  const value = typeof process !== 'undefined'
    ? process.env.EXPO_PUBLIC_FORCE_DAILY_SALES_STATE
    : undefined;
  if (value === 'success' || value === 'empty' || value === 'loading' || value === 'error' || value === 'branch_variant') return value;
  return null;
}

export function getDailySalesSampleData(branchId: string | null = null): OwnerSalesData {
  const recognizedBranch = branchId === 'branch-1' || branchId === 'branch-2' || branchId === 'branch-3';
  const sales = branchId && recognizedBranch ? sampleSales.filter((sale) => sale.branch_id === branchId) : sampleSales;
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    sales,
    todaySales: sales,
    previousSales: [],
    items: sampleItems.filter((item) => saleIds.has(item.sale_id)),
  };
}

export function getWeeklySalesSampleData(branchId: string | null = null): OwnerSalesData {
  const weeklySales = [...additionalWeeklySales, ...sampleSales];
  const recognizedBranch = branchId === 'branch-1' || branchId === 'branch-2' || branchId === 'branch-3';
  const sales = branchId && recognizedBranch
    ? weeklySales.filter((sale) => sale.branch_id === branchId)
    : weeklySales;
  const saleIds = new Set(sales.map((sale) => sale.id));
  return {
    sales,
    todaySales: sales.filter((sale) => sale.created_at.startsWith('2026-11-12')),
    previousSales: [],
    items: sampleItems.filter((item) => saleIds.has(item.sale_id)),
  };
}

export function getMonthlySalesSampleData(branchId: string | null = null): OwnerSalesData {
  const monthlyAmounts = [
    3497, 3521, 3214, 3678, 2986, 3407, 3650, 4036,
    10243, 11243, 12000, 35828,
  ];
  const monthlySales: OwnerSale[] = monthlyAmounts.map((amount, index) => {
    const day = String(index + 2).padStart(2, '0');
    const branchIdForSale = `branch-${(index % 3) + 1}`;
    return {
      id: `txn-1111-${String(index + 1).padStart(4, '0')}`,
      transaction_reference: `TXN-11${day}-${String(index + 1).padStart(4, '0')}`,
      branch_id: branchIdForSale,
      recorded_by_name: 'Ana Reyes',
      total_amount: amount,
      payment_method: index % 2 === 0 ? 'Cash' : 'QR',
      status: 'completed',
      inventory_processing_status: 'completed',
      created_at: `2026-11-${day}T${String(8 + (index % 10)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00+08:00`,
    };
  });
  const sales = [...monthlySales, ...sampleSales];
  const recognizedBranch = branchId === 'branch-1' || branchId === 'branch-2' || branchId === 'branch-3';
  const filteredSales = branchId && recognizedBranch
    ? sales.filter((sale) => sale.branch_id === branchId)
    : sales;
  const saleIds = new Set(filteredSales.map((sale) => sale.id));
  return {
    sales: filteredSales,
    todaySales: filteredSales.filter((sale) => sale.created_at.startsWith('2026-11-12')),
    previousSales: [],
    items: sampleItems.filter((item) => saleIds.has(item.sale_id)),
  };
}

export function getBranchVariantSampleData(): OwnerSalesData {
  const sales: OwnerSale[] = [
    {
      id: 'branch-variant-b1',
      transaction_reference: 'TXN-1112-2104',
      branch_id: 'branch-1',
      recorded_by_name: 'Ana Reyes',
      total_amount: 2104,
      payment_method: 'Cash',
      status: 'completed',
      inventory_processing_status: 'completed',
      created_at: '2026-11-12T15:42:00+08:00',
    },
    {
      id: 'branch-variant-b2',
      transaction_reference: 'TXN-1112-1533',
      branch_id: 'branch-2',
      recorded_by_name: 'Ana Reyes',
      total_amount: 1533,
      payment_method: 'QR',
      status: 'completed',
      inventory_processing_status: 'completed',
      created_at: '2026-11-12T14:31:00+08:00',
    },
  ];
  return {
    sales,
    todaySales: sales,
    previousSales: [],
    items: [],
  };
}
