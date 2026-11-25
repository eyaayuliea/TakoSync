// ST-05 c7: the receipt as a PDF file (80 mm roll width, one page as long as
// the receipt). It is drawn from the same saved values as the screen and the
// printed HTML receipt, with the embedded fonts the reports use, so ₱ prints.
import { formatPeso } from '../services/money.ts';
import { BULK_ORDER_LABEL } from '../services/bulkOrder.ts';
import { assemblePdf, pdfGlyphs, textWidth, wrapText } from '../owner/reportPdf.ts';
import { formatReceiptDatePurchased, SALE_RECEIPT_FOOTER, type StaffSaleReceipt } from './saleReceipt.ts';

export const RECEIPT_PDF_WIDTH = 227; // 80 mm
const MARGIN = 14;
const WIDTH = RECEIPT_PDF_WIDTH - MARGIN * 2;

type Color = [number, number, number];
const INK: Color = [0.09, 0.09, 0.141];
const MUTED: Color = [0.333, 0.333, 0.376];
const RED: Color = [0.788, 0.184, 0.235];

const n = (value: number) => (Math.round(value * 100) / 100).toString();
const rgb = (color: Color) => color.map(n).join(' ');

export const formatReceiptPeso = formatPeso;

/** Draw operations measured from the top of the page, placed once the height is known. */
type Op = (height: number) => string;

class ReceiptLayout {
  ops: Op[] = [];
  y = MARGIN; // distance from the top

  text(value: string, x: number, size: number, bold = false, color: Color = INK) {
    const top = this.y;
    this.ops.push((height) =>
      `${rgb(color)} rg BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(x)} ${n(height - top - size)} Td ${pdfGlyphs(value, bold)} Tj ET`);
  }

  centered(value: string, size: number, bold = false, color: Color = INK) {
    for (const line of wrapText(value, WIDTH, size, bold)) {
      this.text(line, MARGIN + (WIDTH - textWidth(line, size, bold)) / 2, size, bold, color);
      this.y += size + 3;
    }
  }

  /** A label on the left and a value on the right; a long value wraps under it. */
  row(label: string, value: string, size = 8.5, bold = false, color: Color = INK) {
    const valueWidth = textWidth(value, size, bold);
    const labelWidth = textWidth(label, size, bold);
    this.text(label, MARGIN, size, bold, color);
    if (labelWidth + 8 + valueWidth <= WIDTH) {
      this.text(value, MARGIN + WIDTH - valueWidth, size, bold, color);
      this.y += size + 4;
      return;
    }
    this.y += size + 3;
    for (const line of wrapText(value, WIDTH, size, bold)) {
      this.text(line, MARGIN + WIDTH - textWidth(line, size, bold), size, bold, color);
      this.y += size + 3;
    }
    this.y += 1;
  }

  rule() {
    const top = this.y + 3;
    this.ops.push((height) =>
      `${rgb(INK)} RG 0.6 w [2 2] 0 d ${n(MARGIN)} ${n(height - top)} m ${n(MARGIN + WIDTH)} ${n(height - top)} l S [] 0 d`);
    this.y += 9;
  }

  voidStamp() {
    const size = 18;
    const top = this.y;
    const boxHeight = size + 8;
    this.ops.push((height) =>
      `${rgb(RED)} RG 2 w ${n(MARGIN)} ${n(height - top - boxHeight)} ${n(WIDTH)} ${n(boxHeight)} re S`);
    this.y += 4;
    this.text('VOID', MARGIN + (WIDTH - textWidth('VOID', size, true)) / 2, size, true, RED);
    this.y = top + boxHeight + 8;
  }
}

/** The receipt PDF, as bytes. */
export function buildSaleReceiptPdf(receipt: StaffSaleReceipt): Uint8Array {
  const layout = new ReceiptLayout();
  if (receipt.isVoided) layout.voidStamp();
  layout.centered("Gelo's Takoyaki", 13, true);
  layout.centered(receipt.branchName, 9);
  layout.rule();
  layout.row('Reference', receipt.transactionReference);
  layout.row('Date Purchased', formatReceiptDatePurchased(receipt.createdAt));
  if (receipt.servedBy) layout.row('Served by', receipt.servedBy);
  if (receipt.isBulkOrder) {
    layout.y += 2;
    layout.centered(BULK_ORDER_LABEL.toUpperCase(), 9, true);
  }
  layout.rule();
  for (const line of receipt.lines) {
    const amount = formatReceiptPeso(line.subtotal);
    const amountWidth = textWidth(amount, 8.5);
    const name = `${line.name}${line.variantLabel ? ` · ${line.variantLabel}` : ''}`;
    const nameLines = wrapText(name, WIDTH - amountWidth - 8, 8.5);
    layout.text(amount, MARGIN + WIDTH - amountWidth, 8.5);
    for (const nameLine of nameLines) {
      layout.text(nameLine, MARGIN, 8.5);
      layout.y += 11.5;
    }
    layout.text(`${line.quantity} × ${formatReceiptPeso(line.unitPrice)}`, MARGIN, 7.5, false, MUTED);
    layout.y += 12;
  }
  layout.rule();
  layout.row('Total', formatReceiptPeso(receipt.totalAmount), 10, true);
  layout.y += 4;
  layout.row('Payment', receipt.paymentMethod);
  if (receipt.cashReceived !== null) layout.row('Cash received', formatReceiptPeso(receipt.cashReceived));
  if (receipt.change !== null) layout.row('Change', formatReceiptPeso(receipt.change));
  layout.y += 6;
  if (receipt.isVoided) layout.centered('This sale was voided and is not counted in sales totals.', 7.5, false, MUTED);
  layout.centered(SALE_RECEIPT_FOOTER, 7.5, false, MUTED);

  const height = Math.ceil(layout.y + MARGIN);
  return assemblePdf({
    title: `Receipt ${receipt.transactionReference}`,
    creator: 'TakoSync Staff POS',
    width: RECEIPT_PDF_WIDTH,
    height,
    pages: [layout.ops.map((op) => op(height)).join('\n')],
  });
}
