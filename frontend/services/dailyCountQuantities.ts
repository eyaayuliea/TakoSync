// Quantity rules for the Staff physical inventory (daily stock) check.
//
// The database stores prepared batter in bottles (1 bottle = 680 ml) with whole-unit
// precision, and `submit_daily_stock_check` / `save_daily_stock_check_draft` compare the
// submitted recorded quantity with `branch_inventory.quantity` in that stored unit. The
// Staff inventory view displays batter in millilitres, so the count must be converted
// back to the stored unit before it is entered, compared, drafted or submitted.

export const PREPARED_BATTER_INGREDIENT_ID = 'prepared-batter';
export const BATTER_BOTTLE_VOLUME_ML = 680;
const STORED_BATTER_QUANTITY_DIGITS = 3;

export type DailyCountSourceItem = {
  id: string;
  unit: string;
  quantity: number;
  quantityPrecision?: number | null;
};

export type DailyCountBasis = {
  unit: string;
  recordedQuantity: number;
  /** Allowed decimal places for the physical quantity (0 = whole numbers). */
  precision: number;
};

export function batterBottlesToMl(bottles: number): number {
  return bottles * BATTER_BOTTLE_VOLUME_ML;
}

export function batterMlToBottles(milliliters: number): number {
  return Number((milliliters / BATTER_BOTTLE_VOLUME_ML).toFixed(STORED_BATTER_QUANTITY_DIGITS));
}

function fallbackPrecision(unit: string): number {
  return unit === 'pcs' || unit === 'bottle' ? 0 : 2;
}

export function normalizeDailyPrecision(unit: string, precision?: number | null): number {
  return typeof precision === 'number' && Number.isInteger(precision)
    ? Math.max(0, Math.min(3, precision))
    : fallbackPrecision(unit);
}

/**
 * Builds the unit/recorded quantity used by the physical count for one inventory item.
 * Batter is shown in millilitres elsewhere but is counted in whole bottles, the unit the
 * database stores and validates.
 */
export function getDailyCountBasis(item: DailyCountSourceItem): DailyCountBasis {
  if (item.id === PREPARED_BATTER_INGREDIENT_ID && item.unit === 'ml') {
    return { unit: 'bottle', recordedQuantity: batterMlToBottles(item.quantity), precision: 0 };
  }
  return {
    unit: item.unit,
    recordedQuantity: item.quantity,
    precision: normalizeDailyPrecision(item.unit, item.quantityPrecision),
  };
}

export function isValidDailyQuantity(value: string, unit: string, precision?: number | null): boolean {
  const places = normalizeDailyPrecision(unit, precision);
  const pattern = places === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`);
  if (!pattern.test(value.trim())) return false;
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0;
}

export function roundDailyQuantity(quantity: number, unit: string, precision?: number | null): number {
  const factor = 10 ** normalizeDailyPrecision(unit, precision);
  return Math.round(quantity * factor) / factor;
}

export function dailyQuantityErrorText(value: string, unit: string, precision?: number | null): string {
  const places = normalizeDailyPrecision(unit, precision);
  if (value.trim() === '') return 'Enter a quantity.';
  if (value.includes('-')) return 'Quantity cannot be negative.';
  if (places === 0) return unit === 'bottle' ? 'Enter a whole number of bottles.' : 'Enter a whole number.';
  return `Enter a valid quantity (up to ${places} ${places === 1 ? 'decimal' : 'decimals'}).`;
}
