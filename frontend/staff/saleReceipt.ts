import type { OwnerInventoryProcessingStatus, OwnerSaleStatus } from '../services/ownerSalesStatus';
import { BULK_ORDER_LABEL, recordedSaleIsBulkOrder } from '../services/bulkOrder.ts';

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
  isBulkOrder: boolean;
  /** ST-05 c9 / ST-07 c7: the owner approved a void for this sale. */
  isVoided: boolean;
  /** ST-05 c2: the employee who processed the sale, when known. */
  servedBy: string | null;
  /** ST-05 c5: cash payments only, when saved with the sale. */
  cashReceived: number | null;
  change: number | null;
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
  /** Saved Bulk Order flag, once the sales table has one (#32). */
  is_bulk_order?: boolean | null;
  cash_received?: number | string | null;
  change_amount?: number | string | null;
  served_by_name?: string | null;
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
  /** Used when the sale has no saved employee name (sales recorded before #37). */
  servedByName?: string | null;
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
    isBulkOrder: recordedSaleIsBulkOrder(sale.is_bulk_order, input.items.map((item) => Number(item.quantity))),
    isVoided: sale.status === 'voided',
    servedBy: sale.served_by_name?.trim() || input.servedByName?.trim() || null,
    cashReceived: sale.cash_received === null || sale.cash_received === undefined ? null : Number(sale.cash_received),
    change: sale.change_amount === null || sale.change_amount === undefined ? null : Number(sale.change_amount),
    lines,
  };
}

export const SALE_RECEIPT_VOID_LABEL = '*** VOID ***';

export function formatStaffSaleReceipt(receipt: StaffSaleReceipt): string {
  const lines = [
    ...(receipt.isVoided ? [SALE_RECEIPT_VOID_LABEL] : []),
    "Gelo's Takoyaki",
    receipt.branchName,
    `Reference: ${receipt.transactionReference}`,
    `Date: ${new Date(receipt.createdAt).toLocaleString('en-PH')}`,
    ...(receipt.servedBy ? [`Served by: ${receipt.servedBy}`] : []),
    `Payment: ${receipt.paymentMethod}`,
    ...(receipt.cashReceived !== null ? [`Cash received: ${receipt.cashReceived.toFixed(2)}`] : []),
    ...(receipt.change !== null ? [`Change: ${receipt.change.toFixed(2)}`] : []),
    ...(receipt.isBulkOrder ? [BULK_ORDER_LABEL] : []),
    '',
    ...receipt.lines.map((line) =>
      `${line.name}${line.variantLabel ? ` - ${line.variantLabel}` : ''} x${line.quantity} @ ${line.unitPrice.toFixed(2)} = ${line.subtotal.toFixed(2)}`,
    ),
    '',
    `Total: ${receipt.totalAmount.toFixed(2)}`,
    `Sale status: ${receipt.saleStatus}`,
    `Inventory processing: ${receipt.inventoryProcessingStatus}`,
    ...(receipt.isVoided ? ['', 'This sale was voided and is not counted in sales totals.'] : []),
  ];
  return lines.join('\n');
}

// ST-05 c7: the printed and downloaded receipt is rendered from the same saved
// values as the screen, so it matches the sale exactly.

export const SALE_RECEIPT_FOOTER = 'Sales acknowledgment only. This is not an official receipt.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function peso(value: number): string {
  return `&#8369;${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatReceiptDatePurchased(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A self-contained HTML receipt for printing or saving as PDF (58–80 mm paper friendly). */
export function formatStaffSaleReceiptHtml(receipt: StaffSaleReceipt): string {
  const rows = receipt.lines.map((line) => `
      <tr>
        <td class="item">${escapeHtml(line.name)}${line.variantLabel ? ` &middot; ${escapeHtml(line.variantLabel)}` : ''}
          <div class="meta">${line.quantity} &times; ${peso(line.unitPrice)}</div></td>
        <td class="amount">${peso(line.subtotal)}</td>
      </tr>`).join('');
  const detail = (label: string, value: string) =>
    `<tr><td>${escapeHtml(label)}</td><td class="amount">${value}</td></tr>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(receipt.transactionReference)}</title>
<style>
  @page { margin: 8mm; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #171724; margin: 0; }
  .receipt { max-width: 320px; margin: 0 auto; font-size: 12px; }
  h1 { font-size: 16px; text-align: center; margin: 0; }
  .center { text-align: center; }
  .muted { color: #555560; }
  .void { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 4px; color: #C92F3C;
    border: 3px solid #C92F3C; padding: 2px 0; margin: 8px 0; }
  .bulk { text-align: center; font-weight: 700; letter-spacing: 1px; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 3px 0; vertical-align: top; }
  .amount { text-align: right; white-space: nowrap; padding-left: 8px; }
  .meta { color: #555560; font-size: 11px; }
  .total td { border-top: 1px dashed #171724; font-weight: 700; font-size: 13px; padding-top: 6px; }
  .rule { border-top: 1px dashed #171724; margin: 8px 0; }
  .footer { text-align: center; font-size: 10px; color: #555560; margin-top: 10px; }
</style>
</head>
<body>
<div class="receipt">
  ${receipt.isVoided ? '<div class="void">VOID</div>' : ''}
  <h1>Gelo's Takoyaki</h1>
  <div class="center">${escapeHtml(receipt.branchName)}</div>
  <div class="rule"></div>
  <table>
    ${detail('Reference', escapeHtml(receipt.transactionReference))}
    ${detail('Date Purchased', escapeHtml(formatReceiptDatePurchased(receipt.createdAt)))}
    ${receipt.servedBy ? detail('Served by', escapeHtml(receipt.servedBy)) : ''}
  </table>
  ${receipt.isBulkOrder ? `<div class="bulk">${escapeHtml(BULK_ORDER_LABEL.toUpperCase())}</div>` : ''}
  <table>${rows}
    <tr class="total"><td>Total</td><td class="amount">${peso(receipt.totalAmount)}</td></tr>
  </table>
  <table>
    ${detail('Payment', escapeHtml(receipt.paymentMethod))}
    ${receipt.cashReceived !== null ? detail('Cash received', peso(receipt.cashReceived)) : ''}
    ${receipt.change !== null ? detail('Change', peso(receipt.change)) : ''}
  </table>
  ${receipt.isVoided ? '<div class="footer">This sale was voided and is not counted in sales totals.</div>' : ''}
  <div class="footer">${escapeHtml(SALE_RECEIPT_FOOTER)}</div>
</div>
</body>
</html>`;
}

/** A safe file name for the downloaded PDF. */
export function saleReceiptFileName(receipt: StaffSaleReceipt): string {
  return `${receipt.transactionReference.replace(/[^a-z0-9-]/gi, '-')}-receipt.pdf`;
}
