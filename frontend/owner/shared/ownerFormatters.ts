const manilaTimeZone = 'Asia/Manila';

function dateParts(value: string | Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-PH', { ...options, timeZone: manilaTimeZone }).formatToParts(new Date(value));
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? '';
}

export function formatDateTime(value: string | Date): string {
  const parts = dateParts(value, { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  return `${part(parts, 'day')} ${part(parts, 'month')} ${part(parts, 'year')} · ${part(parts, 'hour')}:${part(parts, 'minute')} ${part(parts, 'dayPeriod')}`;
}

export function formatDate(value: string | Date): string {
  const parts = dateParts(value, { day: '2-digit', month: 'short', year: 'numeric' });
  return `${part(parts, 'day')} ${part(parts, 'month')} ${part(parts, 'year')}`;
}

export function formatPeso(value: number): string {
  return `₱${new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value)}`;
}

function numberText(value: number): string {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Math.abs(value));
}

export function formatQuantity(value: number, unit: string, signed = false): string {
  const sign = value < 0 ? '−' : signed && value > 0 ? '+' : '';
  return `${sign}${numberText(value)} ${unit}`;
}

export function formatDifference(value: number, unit: string): string {
  return formatQuantity(value, unit, true);
}

export function formatReferenceId(prefix: string, dateToken: string, sequence: number): string {
  return `${prefix}-${dateToken}-${String(sequence).padStart(4, '0')}`;
}

export const formatTransactionId = (dateToken: string, sequence: number) => formatReferenceId('TXN', dateToken, sequence);
export const formatStockInId = (dateToken: string, sequence: number) => formatReferenceId('SI', dateToken, sequence);
export const formatPhysicalCountId = (dateToken: string, sequence: number) => formatReferenceId('PC', dateToken, sequence);
export const formatDiscrepancyId = (dateToken: string, sequence: number) => formatReferenceId('DISC', dateToken, sequence);
export const formatSalesConsumptionId = (dateToken: string, sequence: number) => formatReferenceId('SC', dateToken, sequence);
export const formatWasteSpillageId = (dateToken: string, sequence: number) => formatReferenceId('WS', dateToken, sequence);
export const formatEmployeeId = (sequence: number) => `EMP-${String(sequence).padStart(3, '0')}`;
export const formatOwnerId = (sequence: number) => `OWN-${String(sequence).padStart(3, '0')}`;

export type DifferenceTone = 'negative' | 'zero' | 'positive';
export type StockStatus = 'Normal' | 'Low Stock' | 'Out of Stock';
export type ExpiryStatus = 'Near Expiration' | 'Expired';

export function differenceTone(value: number): DifferenceTone {
  return value < 0 ? 'negative' : value > 0 ? 'positive' : 'zero';
}

export const ownerStatusColors = {
  difference: { negative: '#F52F2E', zero: '#589144', positive: '#FCA639' },
  stock: { Normal: '#589144', 'Low Stock': '#FDE672', 'Out of Stock': '#F52F2E' },
  expiry: { 'Near Expiration': '#FCA639', Expired: '#F52F2E' },
} as const;

export function stockStatusColor(status: StockStatus) {
  return ownerStatusColors.stock[status];
}

export function expiryStatusColor(status: ExpiryStatus) {
  return ownerStatusColors.expiry[status];
}
