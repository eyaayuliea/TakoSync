// ST-05 c7: print the receipt or download it as a PDF. Both are rendered from
// formatStaffSaleReceiptHtml, the same saved values the screen shows.

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { formatStaffSaleReceiptHtml, saleReceiptFileName, type StaffSaleReceipt } from './saleReceipt';
import { buildSaleReceiptPdf } from './receiptPdf';

/**
 * On web, expo-print prints the whole app page, so the receipt is printed from
 * a hidden frame instead. The browser's print dialog also offers Save as PDF.
 */
function printHtmlOnWeb(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Printing is unavailable in this browser.'));
      return;
    }
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.style.right = '0';
    frame.style.bottom = '0';
    document.body.appendChild(frame);
    const cleanUp = () => window.setTimeout(() => frame.remove(), 1000);
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Unable to print this receipt.'));
      } finally {
        cleanUp();
      }
    };
    frame.srcdoc = html;
  });
}

export async function printSaleReceipt(receipt: StaffSaleReceipt): Promise<void> {
  const html = formatStaffSaleReceiptHtml(receipt);
  if (Platform.OS === 'web') {
    await printHtmlOnWeb(html);
    return;
  }
  await Print.printAsync({ html });
}

/** On web, the PDF file is built in the browser and saved through a download link. */
function downloadPdfOnWeb(receipt: StaffSaleReceipt): void {
  if (typeof document === 'undefined') throw new Error('Downloads are unavailable in this browser.');
  const bytes = buildSaleReceiptPdf(receipt);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = saleReceiptFileName(receipt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Creates the PDF. On web the file is downloaded; on a phone the share sheet
 * opens so staff can save or send it.
 */
export async function downloadSaleReceiptPdf(receipt: StaffSaleReceipt): Promise<'shared' | 'downloaded'> {
  if (Platform.OS === 'web') {
    downloadPdfOnWeb(receipt);
    return 'downloaded';
  }
  const html = formatStaffSaleReceiptHtml(receipt);
  const { uri } = await Print.printToFileAsync({ html });
  let shareUri = uri;
  const directory = FileSystem.cacheDirectory;
  if (directory) {
    // Give the file the receipt's name instead of a random one.
    shareUri = `${directory}${saleReceiptFileName(receipt)}`;
    await FileSystem.deleteAsync(shareUri, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: shareUri });
  }
  if (!await Sharing.isAvailableAsync()) {
    throw new Error(`The PDF was created but this device cannot open the share sheet. File: ${shareUri}`);
  }
  await Sharing.shareAsync(shareUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Save or share the receipt',
    UTI: 'com.adobe.pdf',
  });
  return 'shared';
}
