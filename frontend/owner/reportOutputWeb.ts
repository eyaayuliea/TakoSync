// Browser side of report output (Owner Web Portal only).
import { renderReportHtml, reportFileName, type ReportDocument } from './reportDocument.ts';
import { buildReportPdf } from './reportPdf.ts';

/**
 * OW-05 c7 / OW-12 c6: open the print-friendly view of the report in a new tab,
 * which opens the print dialog. Returns false when the browser blocked the tab.
 */
export function openReportPrintView(doc: ReportDocument): boolean {
  if (typeof window === 'undefined') return false;
  const view = window.open('', '_blank');
  if (!view) return false;
  view.document.open();
  view.document.write(renderReportHtml(doc, { autoPrint: true }));
  view.document.close();
  return true;
}

/** OW-05 c8 / OW-12 c7: download the report as a PDF file. */
export function downloadReportPdf(doc: ReportDocument): void {
  if (typeof document === 'undefined') return;
  const bytes = buildReportPdf(doc);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = reportFileName(doc, 'pdf');
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
