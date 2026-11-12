export type StaffDailySale = {
  id: string;
  branch_id: string;
  total_amount: number | string;
  payment_method: string;
  status: string;
  inventory_processing_status?: string | null;
};

export type StaffDailySaleItem = {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number | string;
  subtotal: number | string;
};

export type StaffDailySalesSummary = {
  transactionCount: number;
  totalSales: number;
  paymentMethods: Array<{
    paymentMethod: string;
    transactionCount: number;
    totalSales: number;
  }>;
  products: Array<{
    productId: string;
    productName: string;
    quantity: number;
    totalSales: number;
  }>;
};

export const STAFF_DAILY_SALES_LOAD_ERROR =
  'Unable to load data. Please check your internet connection and try again.';

export async function getStaffDailySalesLoadResult(
  load: () => Promise<StaffDailySalesSummary>,
): Promise<{ summary: StaffDailySalesSummary | null; error: string }> {
  try {
    return { summary: await load(), error: '' };
  } catch {
    return { summary: null, error: STAFF_DAILY_SALES_LOAD_ERROR };
  }
}

function localDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error('Choose a valid business date.');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isFutureBusinessDate(date: Date, latestAllowedDate: Date) {
  return localDateKey(date) > localDateKey(latestAllowedDate);
}

export function getManilaBusinessDayRange(date: Date) {
  const dateKey = localDateKey(date);
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return {
    businessDate: dateKey,
    start: `${dateKey}T00:00:00+08:00`,
    end: `${localDateKey(nextDate)}T00:00:00+08:00`,
  };
}

function finiteNumber(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildStaffDailySalesSummary(input: {
  branchId: string;
  sales: StaffDailySale[];
  saleItems: StaffDailySaleItem[];
  productNames: Array<{ id: string; product_name: string }>;
}): StaffDailySalesSummary {
  const recordedSales = new Map<string, StaffDailySale>();
  for (const sale of input.sales) {
    if (sale.branch_id === input.branchId && sale.status === 'completed') {
      recordedSales.set(sale.id, sale);
    }
  }

  const totalByPayment = new Map<string, { paymentMethod: string; transactionCount: number; totalSales: number }>();
  let totalSales = 0;
  for (const sale of recordedSales.values()) {
    const amount = finiteNumber(sale.total_amount);
    totalSales += amount;
    const label = sale.payment_method.trim() || 'Other';
    const key = label.toLocaleLowerCase();
    const payment = totalByPayment.get(key) ?? { paymentMethod: label, transactionCount: 0, totalSales: 0 };
    payment.transactionCount += 1;
    payment.totalSales += amount;
    totalByPayment.set(key, payment);
  }

  const namesById = new Map(input.productNames.map((product) => [product.id, product.product_name]));
  const productsById = new Map<string, { productId: string; productName: string; quantity: number; totalSales: number }>();
  const seenItems = new Set<string>();
  for (const item of input.saleItems) {
    if (!recordedSales.has(item.sale_id) || seenItems.has(item.id)) continue;
    seenItems.add(item.id);
    const product = productsById.get(item.product_id) ?? {
      productId: item.product_id,
      productName: namesById.get(item.product_id) ?? 'Product unavailable',
      quantity: 0,
      totalSales: 0,
    };
    product.quantity += finiteNumber(item.quantity);
    product.totalSales += finiteNumber(item.subtotal);
    productsById.set(item.product_id, product);
  }

  return {
    transactionCount: recordedSales.size,
    totalSales: roundCurrency(totalSales),
    paymentMethods: [...totalByPayment.values()]
      .map((payment) => ({ ...payment, totalSales: roundCurrency(payment.totalSales) }))
      .sort((left, right) => left.paymentMethod.localeCompare(right.paymentMethod)),
    products: [...productsById.values()]
      .map((product) => ({ ...product, totalSales: roundCurrency(product.totalSales) }))
      .sort((left, right) =>
        right.quantity - left.quantity ||
        right.totalSales - left.totalSales ||
        left.productName.localeCompare(right.productName),
      ),
  };
}
