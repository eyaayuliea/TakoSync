import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import { buildSaleReceiptPdf, formatReceiptPeso, RECEIPT_PDF_WIDTH } from './receiptPdf.ts';
import { REPORT_PDF_FONTS } from '../owner/reportPdfFonts.ts';

const receipt = (overrides = {}) => ({
  id: 'sale-1',
  transactionReference: 'SALE-20261123-ABC123',
  branchId: 'branch-1',
  branchName: 'Manila · Branch 1',
  createdAt: '2026-11-23T08:45:00.000Z',
  paymentMethod: 'Cash',
  totalAmount: 1253,
  saleStatus: 'Completed',
  inventoryProcessingStatus: 'Completed',
  isBulkOrder: false,
  isVoided: false,
  servedBy: 'Local Test',
  cashReceived: 1500,
  change: 247,
  lines: [
    { id: 'i1', name: 'Octobits Takoyaki', variantLabel: '8 PCS', quantity: 12, unitPrice: 99, subtotal: 1188, kind: 'product' },
    { id: 'a1', name: 'Takoyaki sauce', variantLabel: null, quantity: 1, unitPrice: 15, subtotal: 15, kind: 'addon' },
    { id: 'a2', name: 'Extra bonito flakes on the whole tray please', variantLabel: null, quantity: 2, unitPrice: 25, subtotal: 50, kind: 'addon' },
  ],
  ...overrides,
});

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');
const glyphToText = (font) => new Map(Object.entries(font.cmap).map(([code, glyph]) => [glyph, String.fromCodePoint(Number(code))]));
const decoders = { F1: glyphToText(REPORT_PDF_FONTS.regular), F2: glyphToText(REPORT_PDF_FONTS.bold) };
const shownText = (pdf) => [...pdf.matchAll(/\/(F[12]) [\d.]+ Tf [\d.-]+ [\d.-]+ Td <([0-9A-F]+)> Tj/g)]
  .map(([, font, hex]) => (hex.match(/.{4}/g) ?? []).map((glyph) => decoders[font].get(parseInt(glyph, 16)) ?? '�').join(''));

test('ST-05 c7: the receipt PDF is a one-page 80 mm PDF file', () => {
  const pdf = latin1(buildSaleReceiptPdf(receipt()));
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /%%EOF\n$/);
  assert.match(pdf, /\/Type \/Pages \/Count 1 /);
  assert.match(pdf, new RegExp(`/MediaBox \\[0 0 ${RECEIPT_PDF_WIDTH} \\d+\\]`));
  // The embedded font file is a valid deflate stream.
  const fontStream = pdf.match(/\/Filter \/FlateDecode >>\nstream\n([\s\S]*?)\nendstream/);
  assert.ok(fontStream);
  assert.ok(inflateSync(Buffer.from(fontStream[1], 'latin1')).length > 1000);
});

test('ST-05 c7: the PDF shows the saved sale exactly, with ₱ amounts', () => {
  const lines = shownText(latin1(buildSaleReceiptPdf(receipt())));
  for (const expected of [
    "Gelo's Takoyaki", 'Manila · Branch 1', 'SALE-20261123-ABC123', 'Served by', 'Local Test',
    'Octobits Takoyaki · 8 PCS', '12 × ₱99.00', '₱1,188.00', 'Takoyaki sauce', '₱15.00',
    'Total', '₱1,253.00', 'Cash', 'Cash received', '₱1,500.00', 'Change', '₱247.00',
  ]) assert.ok(lines.includes(expected), `missing "${expected}" in ${JSON.stringify(lines)}`);
  assert.ok(lines.includes('Nov 23, 2026, 4:45 PM') || lines.some((line) => /Nov 23, 2026/.test(line)));
  assert.ok(!lines.includes('VOID'));
  assert.ok(!lines.some((line) => /BULK ORDER/.test(line)));
  // A long add-on name wraps instead of running under its amount.
  assert.ok(lines.some((line) => line.startsWith('Extra bonito')) && !lines.includes('Extra bonito flakes on the whole tray please'));
});

test('ST-05 c4 / c9: Bulk Order and VOID are printed; a non-cash sale has no change', () => {
  const lines = shownText(latin1(buildSaleReceiptPdf(receipt({
    isBulkOrder: true, isVoided: true, paymentMethod: 'QR', cashReceived: null, change: null,
  }))));
  assert.ok(lines.includes('VOID'));
  assert.ok(lines.some((line) => /^BULK ORDER/.test(line)));
  assert.ok(lines.includes('QR'));
  assert.ok(!lines.includes('Change'));
  assert.ok(lines.some((line) => /voided and is not counted/.test(line)));
});

test('the page grows with the number of items', () => {
  const height = (r) => Number(latin1(buildSaleReceiptPdf(r)).match(/\/MediaBox \[0 0 \d+ (\d+)\]/)[1]);
  const one = receipt({ lines: receipt().lines.slice(0, 1) });
  assert.ok(height(receipt()) > height(one));
});

test('formatReceiptPeso uses the peso sign and two decimals', () => {
  assert.equal(formatReceiptPeso(1234.5), '₱1,234.50');
  assert.equal(formatReceiptPeso(0), '₱0.00');
});
