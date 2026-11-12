import type { OwnerInventoryProcessingStatus, OwnerSaleStatus } from '../services/ownerSalesStatus';

export type SaleReceiptLine = {
  id: string;
  name: string;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  kind: 'product' | 'addon';
};

export type StaffSaleReceipt = {
  id: string;
  transactionReference: string;
  branchId: string;
  branchName: string;
  createdAt: string;
  paymentMethod: string;
  totalAmount: number;
  saleStatus: OwnerSaleStatus;
  inventoryProcessingStatus: OwnerInventoryProcessingStatus;
  lines: SaleReceiptLine[];
};

type ReceiptSaleRow = {
  id: string;
  transaction_reference: string;
  branch_id: string;
  total_amount: number;
  payment_method: string;
  status: OwnerSaleStatus;
  inventory_processing_status: OwnerInventoryProcessingStatus;
  created_at: string;
};

type ReceiptItemRow = {
  id: string;
  product_id: string;
  product_variant_id: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

type ReceiptAddonRow = {
  id: string;
  addon_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export function buildStaffSaleReceipt(input: {
  sale: ReceiptSaleRow;
  branchId: string;
  branchName: string;
  items: ReceiptItemRow[];
  addons: ReceiptAddonRow[];
  products: Array<{ id: string; product_name: string }>;
  variants: Array<{ id: string; size_label: string }>;
  addonNames: Array<{ id: string; addon_name: string }>;
}): StaffSaleReceipt {
  const { sale } = input;
  if (sale.branch_id !== input.branchId) {
    throw new Error('This sale is not available for your assigned branch.');
  }
  if (sale.status === 'cancelled') {
    throw new Error('A cancelled sale does not have a completed receipt.');
  }

  const productsById = new Map(input.products.map((product) => [product.id, product.product_name]));
  const variantsById = new Map(input.variants.map((variant) => [variant.id, variant.size_label]));
  const addonsById = new Map(input.addonNames.map((addon) => [addon.id, addon.addon_name]));
  const lines: SaleReceiptLine[] = [
    ...input.items.map((item) => {
      const name = productsById.get(item.product_id);
      if (!name) throw new Error('A recorded product name is no longer available for this receipt.');
      return {
        id: item.id,
        name,
        variantLabel: item.product_variant_id ? variantsById.get(item.product_variant_id) ?? null : null,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        subtotal: Number(item.subtotal),
        kind: 'product' as const,
      };
    }),
    ...input.addons.map((addon) => {
      const name = addonsById.get(addon.addon_id);
      if (!name) throw new Error('A recorded add-on name is no longer available for this receipt.');
      return {
        id: addon.id,
        name,
        variantLabel: null,
        quantity: Number(addon.quantity),
        unitPrice: Number(addon.unit_price),
        subtotal: Number(addon.subtotal),
        kind: 'addon' as const,
      };
    }),
  ];

  return {
    id: sale.id,
    transactionReference: sale.transaction_reference,
    branchId: sale.branch_id,
    branchName: input.branchName,
    createdAt: sale.created_at,
    paymentMethod: sale.payment_method,
    totalAmount: Number(sale.total_amount),
    saleStatus: sale.status,
    inventoryProcessingStatus: sale.inventory_processing_status,
    lines,
  };
}

export function formatStaffSaleReceipt(receipt: StaffSaleReceipt): string {
  const lines = [
    "Gelo's Takoyaki",
    receipt.branchName,
    `Reference: ${receipt.transactionReference}`,
    `Date: ${new Date(receipt.createdAt).toLocaleString('en-PH')}`,
    `Payment: ${receipt.paymentMethod}`,
    '',
    ...receipt.lines.map((line) =>
      `${line.name}${line.variantLabel ? ` - ${line.variantLabel}` : ''} x${line.quantity} @ ${line.unitPrice.toFixed(2)} = ${line.subtotal.toFixed(2)}`,
    ),
    '',
    `Total: ${receipt.totalAmount.toFixed(2)}`,
    `Sale status: ${receipt.saleStatus}`,
    `Inventory processing: ${receipt.inventoryProcessingStatus}`,
  ];
  return lines.join('\n');
}
