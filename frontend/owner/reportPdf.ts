// OW-05 c8 / OW-12 c7: "Export PDF" downloads the previewed report as a PDF file
// that opens in common readers. A small PDF 1.4 writer with the standard
// Helvetica fonts (no embedding, WinAnsi encoding), A4 landscape, wrapped table
// cells, the table header repeated on every page, and "Page n of N".
import { reportMetaLines, formatReportDateTime, type ReportDocument, type ReportTable } from './reportDocument.ts';

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 36;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = MARGIN + 18; // room for the footer
const CELL_PADDING = 4;

// Helvetica advance widths (1/1000 em) for ASCII 32–126, from the standard AFM.
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Characters outside ASCII that WinAnsiEncoding has, with their Helvetica widths.
const WIN_ANSI: Record<string, [number, number]> = {
  '€': [0x80, 556], '…': [0x85, 1000], '‘': [0x91, 222], '’': [0x92, 222], '“': [0x93, 333],
  '”': [0x94, 333], '•': [0x95, 350], '–': [0x96, 556], '—': [0x97, 1000], '·': [0xb7, 278],
  '×': [0xd7, 584], '°': [0xb0, 400],
};

/** Text the standard fonts can show: ₱ becomes "PHP ", arrows become "->". */
export function pdfSafeText(value: string): string {
  return value
    .replace(/₱\s?/g, 'PHP ')
    .replace(/→/g, '->')
    .replace(/[   ]/g, ' ');
}

function byteOf(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return code;
  if (WIN_ANSI[char]) return WIN_ANSI[char][0];
  if (code >= 0xa0 && code <= 0xff) return code; // Latin-1 letters such as ñ
  return 63; // "?"
}

function charWidth(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 32 && code <= 126) return ASCII_WIDTHS[code - 32];
  if (WIN_ANSI[char]) return WIN_ANSI[char][1];
  return 556;
}

export function textWidth(text: string, size: number, bold = false): number {
  let units = 0;
  for (const char of text) units += charWidth(char);
  // Helvetica-Bold is up to ~7% wider; overestimating keeps wrapped text inside its cell.
  return (units * size * (bold ? 1.07 : 1)) / 1000;
}

/** Wrap text to a width: explicit line breaks first, then words, then long words by character. */
export function wrapText(text: string, width: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of pdfSafeText(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      let piece = '';
      for (const char of word) {
        if (piece && textWidth(piece + char, size, bold) > width) {
          lines.push(piece);
          piece = '';
        }
        piece += char;
      }
      line = piece;
    }
    lines.push(line);
  }
  return lines;
}

function pdfString(text: string): string {
  let out = '(';
  for (const char of pdfSafeText(text)) {
    const byte = byteOf(char);
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${char}`;
    else if (byte > 126) out += `\\${byte.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(byte);
  }
  return `${out})`;
}

const n = (value: number) => (Math.round(value * 100) / 100).toString();

type Color = [number, number, number];
const INK: Color = [0.063, 0.063, 0.153];
const MUTED: Color = [0.42, 0.42, 0.48];
const PINK: Color = [0.91, 0.2, 0.43];
const RULE: Color = [0.87, 0.87, 0.9];
const HEAD_FILL: Color = [0.953, 0.953, 0.961];

class PdfLayout {
  pages: string[][] = [];
  y = 0;
  private readonly doc: ReportDocument;
  constructor(doc: ReportDocument) {
    this.doc = doc;
    this.newPage(true);
  }

  private get ops(): string[] {
    return this.pages[this.pages.length - 1];
  }

  newPage(first = false): void {
    this.pages.push([]);
    this.y = PAGE_HEIGHT - MARGIN;
    if (!first) {
      this.text(`${this.doc.title} (continued)`, MARGIN, this.y - 9, 9, true, MUTED);
      this.y -= 22;
    }
  }

  ensure(height: number): boolean {
    if (this.y - height >= BOTTOM) return false;
    this.newPage();
    return true;
  }

  text(value: string, x: number, baseline: number, size: number, bold = false, color: Color = INK): void {
    this.ops.push(`${color.map(n).join(' ')} rg BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${n(x)} ${n(baseline)} Td ${pdfString(value)} Tj ET`);
  }

  rect(x: number, top: number, width: number, height: number, color: Color): void {
    this.ops.push(`${color.map(n).join(' ')} rg ${n(x)} ${n(top - height)} ${n(width)} ${n(height)} re f`);
  }

  rule(top: number, color: Color = RULE): void {
    this.ops.push(`${color.map(n).join(' ')} RG 0.6 w ${n(MARGIN)} ${n(top)} m ${n(MARGIN + CONTENT_WIDTH)} ${n(top)} l S`);
  }

  /** Label/value pairs laid out left to right, wrapping onto new rows. */
  pairs(items: Array<[string, string]>, valueSize: number, valueBold: boolean, compact = false): void {
    let x = MARGIN;
    // Compact pairs (e.g. per-ingredient totals) show the label as a bold name, like the preview.
    const labelSize = compact ? 9 : 6.5;
    const rowHeight = labelSize + 1 + valueSize + 8;
    this.ensure(rowHeight);
    for (const [rawLabel, value] of items) {
      const label = compact ? rawLabel : rawLabel.toUpperCase();
      const safeValue = pdfSafeText(value).replace(/\n/g, ' · ');
      const width = Math.max(textWidth(label, labelSize, true), textWidth(safeValue, valueSize, valueBold)) + 26;
      if (x > MARGIN && x + width > MARGIN + CONTENT_WIDTH) {
        x = MARGIN;
        this.y -= rowHeight;
        this.ensure(rowHeight);
      }
      this.text(label, x, this.y - labelSize + 0.5, labelSize, true, compact ? INK : MUTED);
      this.text(safeValue, x, this.y - labelSize - 2 - valueSize, valueSize, valueBold);
      x += width;
    }
    this.y -= rowHeight;
  }

  paragraph(value: string, size = 9): void {
    for (const line of wrapText(value, CONTENT_WIDTH, size)) {
      this.ensure(size + 4);
      this.text(line, MARGIN, this.y - size, size, false, MUTED);
      this.y -= size + 4;
    }
  }

  table(table: ReportTable): void {
    const columns = table.headers.length;
    const natural = table.headers.map((header, index) => {
      let widest = textWidth(header.toUpperCase(), 6.5, true);
      for (const row of table.rows) {
        for (const line of pdfSafeText(row[index] ?? '').split('\n')) widest = Math.max(widest, textWidth(line, 7.5, index === 0));
      }
      // +1 pt so text measured exactly to the width does not wrap on rounding.
      return Math.min(Math.max(widest + CELL_PADDING * 2 + 1, 46), 230);
    });
    const total = natural.reduce((sum, width) => sum + width, 0);
    const widths = natural.map((width) => (width * CONTENT_WIDTH) / total);
    const headerLines = table.headers.map((header, index) => wrapText(header.toUpperCase(), widths[index] - CELL_PADDING * 2, 6.5, true));
    const headerHeight = Math.max(...headerLines.map((lines) => lines.length)) * 8 + 8;

    const drawHeader = () => {
      this.rect(MARGIN, this.y, CONTENT_WIDTH, headerHeight, HEAD_FILL);
      let x = MARGIN;
      headerLines.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => this.text(line, x + CELL_PADDING, this.y - 10 - lineIndex * 8, 6.5, true, MUTED));
        x += widths[index];
      });
      this.y -= headerHeight;
      this.rule(this.y);
    };

    this.ensure(headerHeight + 20);
    drawHeader();
    for (const row of table.rows) {
      const cells = Array.from({ length: columns }, (_, index) => wrapText(row[index] ?? '', widths[index] - CELL_PADDING * 2, 7.5, index === 0));
      const rowHeight = Math.max(...cells.map((lines) => lines.length)) * 9.5 + 8;
      if (this.ensure(rowHeight)) drawHeader();
      let x = MARGIN;
      cells.forEach((lines, index) => {
        lines.forEach((line, lineIndex) => this.text(line, x + CELL_PADDING, this.y - 11 - lineIndex * 9.5, 7.5, index === 0));
        x += widths[index];
      });
      this.y -= rowHeight;
      this.rule(this.y);
    }
  }

  build(): void {
    const doc = this.doc;
    this.text("TAKOSYNC · GELO'S TAKOYAKI", MARGIN, this.y - 7, 7, true, PINK);
    this.y -= 12;
    for (const line of wrapText(doc.title, CONTENT_WIDTH, 16, true)) {
      this.text(line, MARGIN, this.y - 16, 16, true);
      this.y -= 20;
    }
    this.y -= 4;
    this.pairs(reportMetaLines(doc), 9, false);
    this.rule(this.y + 2);
    this.y -= 10;
    for (const section of doc.sections) {
      if (section.heading) {
        this.ensure(26);
        this.text(section.heading, MARGIN, this.y - 11, 11, true);
        this.y -= 18;
      }
      if (section.summary?.length) this.pairs(section.summary, section.compact ? 9 : 12, !section.compact, section.compact);
      for (const note of section.notes ?? []) this.paragraph(note);
      if (section.table) this.table(section.table);
      this.y -= 12;
    }
  }
}

/** The PDF file for a generated report, as bytes. */
export function buildReportPdf(doc: ReportDocument): Uint8Array {
  const layout = new PdfLayout(doc);
  layout.build();
  const pageCount = layout.pages.length;
  const footer = `${doc.title} · Generated ${formatReportDateTime(doc.generatedAt)}`;
  layout.pages.forEach((ops, index) => {
    ops.push(`${MUTED.map(n).join(' ')} rg BT /F1 7 Tf ${n(MARGIN)} 20 Td ${pdfString(footer)} Tj ET`);
    const label = `Page ${index + 1} of ${pageCount}`;
    ops.push(`BT /F1 7 Tf ${n(PAGE_WIDTH - MARGIN - textWidth(label, 7))} 20 Td ${pdfString(label)} Tj ET`);
  });

  // Objects: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then page + content pairs.
  const objects: string[] = [];
  const pageIds = layout.pages.map((_, index) => 6 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objects[5] = `<< /Title ${pdfString(doc.title)} /Creator (TakoSync Owner Web Portal) /Producer (TakoSync) >>`;
  layout.pages.forEach((ops, index) => {
    const pageId = pageIds[index];
    const content = ops.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  // Every character written is one byte (non-ASCII text is octal-escaped), so
  // string offsets are byte offsets.
  let file = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = file.length;
    file += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = file.length;
  file += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) file += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  file += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(file.length);
  for (let index = 0; index < file.length; index += 1) bytes[index] = file.charCodeAt(index) & 0xff;
  return bytes;
}
