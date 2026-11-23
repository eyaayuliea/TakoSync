import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatReportPeriod,
  renderReportHtml,
  reportFileName,
  reportMetaLines,
} from './reportDocument.ts';
import { buildReportPdf, pdfSafeText, wrapText } from './reportPdf.ts';
import { REPORT_PDF_FONTS } from './reportPdfFonts.ts';

const generatedAt = new Date('2026-11-23T08:14:00Z'); // 4:14 PM in Manila
const doc = (rows = 2) => ({
  title: 'Void Report',
  period: formatReportPeriod('This Month', { start: new Date('2026-10-31T16:00:00Z'), end: new Date('2026-11-30T16:00:00Z') }),
  branch: 'All Branches',
  generatedAt,
  sections: [{
    summary: [['Voided sales', String(rows)], ['Total amount voided', '₱49.00']],
    table: {
      headers: ['Reference', 'Branch', 'Reason', 'Voided by · date & time'],
      rows: Array.from({ length: rows }, (_, index) => [
        `SALE-${index}`, 'Manila · Branch 1', 'Customer (cancelled) before cooking — “no stock” \\ ok', 'Local Test Staff\n23 Nov 2026, 1:26 AM',
      ]),
    },
  }],
});
const latin1 = (bytes) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

test('report period, header lines and file name read in Manila time', () => {
  assert.equal(doc().period, 'This Month · 1 Nov 2026 – 30 Nov 2026');
  assert.equal(formatReportPeriod('Today', { start: new Date('2026-11-22T16:00:00Z'), end: new Date('2026-11-23T16:00:00Z') }), 'Today · 23 Nov 2026');
  assert.equal(formatReportPeriod('Custom', { start: new Date('2025-12-31T16:00:00Z'), end: new Date('2026-01-31T16:00:00Z') }), '1 Jan 2026 – 31 Jan 2026');
  assert.deepEqual(reportMetaLines(doc()), [
    ['Reporting period', 'This Month · 1 Nov 2026 – 30 Nov 2026'],
    ['Branch', 'All Branches'],
    ['Generated', '23 Nov 2026, 4:14 PM'],
  ]);
  assert.deepEqual(reportMetaLines({ ...doc(), figuresAsOf: generatedAt }).at(-1), ['Figures as of', '23 Nov 2026, 4:14 PM']);
  assert.equal(reportFileName(doc(), 'pdf'), 'void-report-2026-11-23.pdf');
});

test('OW-05 c7: the print view has only the report, escaped, and prints on load', () => {
  const html = renderReportHtml(doc(), { autoPrint: true });
  assert.match(html, /<h1>Void Report<\/h1>/);
  assert.match(html, /This Month · 1 Nov 2026 – 30 Nov 2026/);
  assert.match(html, /<th>Voided by · date &amp; time<\/th>/);
  assert.match(html, /Local Test Staff<br>23 Nov 2026/);
  assert.match(html, /size: A4 landscape/);
  assert.match(html, /window\.print\(\)/);
  assert.doesNotMatch(renderReportHtml(doc()), /addEventListener\("load"/);
  assert.doesNotMatch(renderReportHtml({ ...doc(), title: '<script>x</script>' }), /<script>x/);
});

// The text a PDF reader shows: decode each Tj hex string with the font's glyph map.
const glyphToText = (font) => new Map(Object.entries(font.cmap).map(([code, glyph]) => [glyph, String.fromCodePoint(Number(code))]));
const decoders = { F1: glyphToText(REPORT_PDF_FONTS.regular), F2: glyphToText(REPORT_PDF_FONTS.bold) };
const shownText = (file) => [...file.matchAll(/\/(F1|F2) [\d.]+ Tf [\d.\- ]+ Td <([0-9A-F]*)> Tj/g)]
  .map(([, font, hex]) => (hex.match(/.{4}/g) ?? []).map((glyph) => decoders[font].get(parseInt(glyph, 16)) ?? '�').join(''));

test('characters the embedded fonts lack are replaced, and cells wrap', () => {
  assert.equal(pdfSafeText('₱49.00 · 2 → 3'), '₱49.00 · 2 -> 3');
  const lines = wrapText('Customer cancelled before cooking\nsecond line', 60, 7.5);
  assert.ok(lines.length >= 3);
  assert.equal(lines.at(-1), 'second line');
  assert.ok(wrapText('SALE-1795368410604-WCAAN5', 40, 7.5).length > 1);
});

test('the embedded fonts cover ₱, the minus sign, dashes, quotes and Filipino names', () => {
  for (const font of [REPORT_PDF_FONTS.regular, REPORT_PDF_FONTS.bold]) {
    for (const char of '₱−–—“”·×ñÑ€') assert.ok(font.cmap[String(char.codePointAt(0))] > 0, `${font.name} ${char}`);
    assert.equal(font.widths.length > 300, true);
  }
});

test('OW-05 c8: Export PDF builds a well-formed PDF with a valid cross-reference table', () => {
  const file = latin1(buildReportPdf(doc()));
  assert.ok(file.startsWith('%PDF-1.4\n'));
  assert.ok(file.trimEnd().endsWith('%%EOF'));
  const startxref = Number(file.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.ok(file.slice(startxref).startsWith('xref\n'));
  const [, count] = file.slice(startxref).match(/^xref\n0 (\d+)\n/);
  const entries = file.slice(startxref).split('\n').slice(3, 3 + Number(count) - 1);
  entries.forEach((entry, index) => {
    const offset = Number(entry.slice(0, 10));
    assert.ok(file.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1} offset`);
  });
  for (const match of file.matchAll(/<< \/Length (\d+)(?: \/Length1 \d+ \/Filter \/FlateDecode)? >>\nstream\n/g)) {
    const start = match.index + match[0].length;
    assert.equal(file.slice(start + Number(match[1]), start + Number(match[1]) + 10), '\nendstream');
  }
  assert.match(file, /\/Count 1 /);
  // Two embedded TrueType fonts with ToUnicode maps; no standard Helvetica.
  assert.equal((file.match(/\/Subtype \/CIDFontType2/g) ?? []).length, 2);
  assert.equal((file.match(/\/FontFile2 /g) ?? []).length, 2);
  assert.equal((file.match(/\/ToUnicode /g) ?? []).length, 2);
  assert.doesNotMatch(file, /\/Helvetica/);
  const text = shownText(file);
  assert.ok(text.includes('Void Report'));
  assert.ok(text.includes('₱49.00'), 'the peso sign prints');
  assert.ok(text.some((line) => line.includes('Customer (cancelled) before cooking — “no stock”')));
  assert.ok(text.includes('Page 1 of 1'));
  assert.ok(!text.some((line) => line.includes('�')));
});

test('OW-05 c8: long reports continue on more pages with the table header repeated', () => {
  const file = latin1(buildReportPdf(doc(120)));
  const pages = Number(file.match(/\/Count (\d+) /)[1]);
  assert.ok(pages >= 3, `pages: ${pages}`);
  const text = shownText(file);
  assert.equal(text.filter((line) => line === 'REFERENCE').length, pages);
  assert.ok(text.includes(`Page ${pages} of ${pages}`));
  assert.ok(text.includes('Void Report (continued)'));
});
