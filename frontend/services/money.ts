// One way to write a price, everywhere: the peso sign, thousands separators and
// always two decimals (₱45.00, ₱1,234.50). Written without Intl so the app, the
// web portal, the receipts and the tests all print exactly the same text.

/** The amount with thousands separators and two decimals, without the peso sign: 1,234.50 */
export function formatAmount(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = `${whole}.${String(cents % 100).padStart(2, '0')}`;
  return amount < 0 && cents > 0 ? `-${text}` : text;
}

/** A price as it is shown to staff, owners and customers: ₱45.00 */
export function formatPeso(value: number): string {
  const text = formatAmount(value);
  return text.startsWith('-') ? `-₱${text.slice(1)}` : `₱${text}`;
}
