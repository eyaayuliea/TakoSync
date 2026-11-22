// OW-05 / OW-12: one description of a generated report, used for the on-screen
// preview header, the print-friendly view (Print) and the PDF file (Export PDF),
// so all three show the same report.

export type ReportTable = { headers: string[]; rows: string[][] };

export type ReportSection = {
  heading?: string;
  /** Headline figures, e.g. ["Voided sales", "1"]. */
  summary?: Array<[string, string]>;
  /** Plain lines of text, e.g. an empty-state message. */
  notes?: string[];
  table?: ReportTable;
  /** Show the summary as small label/value pairs (e.g. per-ingredient totals). */
  compact?: boolean;
};

export type ReportDocument = {
  title: string;
  /** "This Month · 1 Nov 2026 – 30 Nov 2026" */
  period: string;
  branch: string;
  generatedAt: Date;
  /** OW-12 c4: when the figures were read; omitted when it equals generatedAt. */
  figuresAsOf?: Date | null;
  sections: ReportSection[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function manilaParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "23 Nov 2026" in Manila time. */
export function formatReportDate(date: Date): string {
  const part = manilaParts(date);
  return `${Number(part.day)} ${MONTHS[Number(part.month) - 1]} ${part.year}`;
}

/** "23 Nov 2026, 4:14 PM" in Manila time. */
export function formatReportDateTime(date: Date): string {
  const part = manilaParts(date);
  return `${formatReportDate(date)}, ${Number(part.hour)}:${part.minute} ${part.dayPeriod}`;
}

/**
 * The inclusive dates of a [start, end) reporting range, e.g.
 * "This Month · 1 Nov 2026 – 30 Nov 2026"; one day shows a single date.
 */
export function formatReportPeriod(label: string, range: { start: Date; end: Date }): string {
  const first = formatReportDate(range.start);
  const last = formatReportDate(new Date(range.end.getTime() - 1));
  const dates = first === last ? first : `${first} – ${last}`;
  return label === 'Custom' ? dates : `${label} · ${dates}`;
}

/** "void-report-2026-11-23.pdf" */
export function reportFileName(doc: Pick<ReportDocument, 'title' | 'generatedAt'>, extension: string): string {
  const part = manilaParts(doc.generatedAt);
  const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `${slug}-${part.year}-${part.month}-${part.day}.${extension}`;
}

/** The header lines shown above every copy of the report. */
export function reportMetaLines(doc: ReportDocument): Array<[string, string]> {
  return [
    ['Reporting period', doc.period],
    ['Branch', doc.branch],
    ['Generated', formatReportDateTime(doc.generatedAt)],
    ...(doc.figuresAsOf ? [['Figures as of', formatReportDateTime(doc.figuresAsOf)] as [string, string]] : []),
  ];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const cell = (value: string) => escapeHtml(value).replace(/\n/g, '<br>');

/**
 * OW-05 c7 / OW-12 c6: a print-friendly page with only the report — no portal
 * navigation or setup controls. It opens the print dialog when it loads.
 */
export function renderReportHtml(doc: ReportDocument, options: { autoPrint?: boolean } = {}): string {
  const meta = reportMetaLines(doc)
    .map(([label, value]) => `<div><span>${escapeHtml(label)}</span>${escapeHtml(value)}</div>`)
    .join('');
  const sections = doc.sections.map((section) => {
    const heading = section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '';
    const summary = section.summary?.length
      ? `<div class="summary${section.compact ? ' compact' : ''}">${section.summary.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${cell(value)}</strong></div>`).join('')}</div>`
      : '';
    const notes = (section.notes ?? []).map((note) => `<p class="note">${cell(note)}</p>`).join('');
    const table = section.table
      ? `<table><thead><tr>${section.table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${
        section.table.rows.map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join('')}</tr>`).join('')
      }</tbody></table>`
      : '';
    return `<section>${heading}${summary}${notes}${table}</section>`;
  }).join('');
  const title = escapeHtml(doc.title);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #101027; margin: 24px; font-size: 11px; }
  .toolbar { display: flex; gap: 8px; margin-bottom: 18px; }
  .toolbar button { font: inherit; font-weight: 700; padding: 8px 14px; border-radius: 6px; border: 1px solid #E8336D; background: #fff; color: #E8336D; cursor: pointer; }
  .toolbar button.primary { background: #E8336D; color: #fff; }
  .brand { color: #E8336D; font-size: 9px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font-size: 20px; margin: 4px 0 10px; }
  .meta { display: flex; flex-wrap: wrap; gap: 4px 24px; padding-bottom: 12px; border-bottom: 1px solid #E3E3E8; }
  .meta span, .summary span { display: block; color: #6D6D7A; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
  section { margin-top: 16px; }
  h2 { font-size: 13px; margin: 0 0 8px; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-bottom: 10px; }
  .summary strong { font-size: 14px; }
  .summary.compact span { color: #101027; font-size: 11px; text-transform: none; letter-spacing: 0; }
  .summary.compact strong { font-size: 11px; font-weight: 400; }
  .note { color: #525260; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; background: #F3F3F5; color: #555560; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; padding: 6px; border-bottom: 1px solid #D9D9DF; }
  td { padding: 6px; border-bottom: 1px solid #ECECF0; vertical-align: top; }
  td:first-child { font-weight: 700; }
  tr { page-break-inside: avoid; }
  @media print { .toolbar { display: none; } body { margin: 0; } }
</style></head>
<body>
<div class="toolbar"><button class="primary" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
<div class="brand">TakoSync · Gelo's Takoyaki</div>
<h1>${title}</h1>
<div class="meta">${meta}</div>
${sections}
${options.autoPrint ? '<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 150); });</script>' : ''}
</body></html>`;
}
