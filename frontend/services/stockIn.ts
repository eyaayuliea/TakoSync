/**
 * ST-09 Stock-In as a header with lines (Requirements Engineering v6 ST-09).
 *
 * The header has an optional supplier or reference, the date purchased and the
 * date received. Each line has an ingredient, the quantity received, the unit
 * (the item's base unit, or its purchase unit: one package) and the expiration
 * date. The server (record_stock_in) validates again, converts the purchase
 * unit, and saves everything in one transaction; these helpers validate before
 * the round trip and build the request.
 *
 * This module has no imports so it can be unit tested directly.
 */

export type StockInIngredient = {
  id: string;
  name: string;
  category: string;
  unit: string;
  expirationTracking: boolean;
  packageQuantity: number | null;
  packageUnit: string | null;
  packageLabel: string | null;
};

export type StockInUnit = 'base' | 'pack';

export type StockInLineDraft = {
  key: string;
  ingredientId: string;
  quantity: string;
  unit: StockInUnit;
  /** YYYY-MM-DD, or '' when not entered. */
  expirationDate: string;
};

export type StockInHeaderDraft = {
  supplierReference: string;
  /** YYYY-MM-DD */
  datePurchased: string;
  /** YYYY-MM-DD */
  dateReceived: string;
};

export const STOCK_IN_SUPPLIER_MAX_LENGTH = 200;
export const STOCK_IN_MAX_LINES = 50;

function conversionFactor(from: string, to: string): number | null {
  const a = from.trim().toLowerCase();
  const b = to.trim().toLowerCase();
  if (a === b) return 1;
  if (a === 'ml' && b === 'l') return 0.001;
  if (a === 'l' && b === 'ml') return 1000;
  if (a === 'g' && b === 'kg') return 0.001;
  if (a === 'kg' && b === 'g') return 1000;
  return null;
}

function trimNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * ST-09 c4: the item's purchase unit, when the owner set a package size that
 * converts to the base unit (for example one 360 ml bottle of a sauce kept in L).
 */
export function purchaseUnitOf(ingredient: StockInIngredient | null | undefined): {
  label: string;
  basePerPack: number;
} | null {
  if (!ingredient || !ingredient.packageUnit || !(Number(ingredient.packageQuantity) > 0)) return null;
  const factor = conversionFactor(ingredient.packageUnit, ingredient.unit);
  if (factor === null) return null;
  const basePerPack = Math.round(Number(ingredient.packageQuantity) * factor * 1000) / 1000;
  if (!(basePerPack > 0)) return null;
  return { label: `Pack (${trimNumber(Number(ingredient.packageQuantity))} ${ingredient.packageUnit})`, basePerPack };
}

/** The quantity in the item's base unit, or null when the entry is not valid yet. */
export function stockInBaseQuantity(line: StockInLineDraft, ingredient: StockInIngredient | null | undefined): number | null {
  if (!ingredient) return null;
  const text = line.quantity.trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (line.unit === 'base') return Math.round(quantity * 1000) / 1000;
  const pack = purchaseUnitOf(ingredient);
  return pack ? Math.round(quantity * pack.basePerPack * 1000) / 1000 : null;
}

export type StockInLineErrors = { ingredient?: string; quantity?: string; unit?: string; expirationDate?: string };
export type StockInValidation = {
  valid: boolean;
  header: { supplierReference?: string; datePurchased?: string; dateReceived?: string };
  lines: StockInLineErrors[];
  /** One sentence for the banner at the top of the form. */
  summary: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ST-09 c2–c3: every rule the server also enforces, with specific messages. */
export function validateStockIn(
  header: StockInHeaderDraft,
  lines: StockInLineDraft[],
  ingredients: StockInIngredient[],
  today: string,
): StockInValidation {
  const byId = new Map(ingredients.map((item) => [item.id, item]));
  const headerErrors: StockInValidation['header'] = {};
  if (header.supplierReference.trim().length > STOCK_IN_SUPPLIER_MAX_LENGTH) {
    headerErrors.supplierReference = `The supplier or reference must be ${STOCK_IN_SUPPLIER_MAX_LENGTH} characters or fewer.`;
  }
  if (!ISO_DATE.test(header.dateReceived)) headerErrors.dateReceived = 'Select the date received.';
  else if (header.dateReceived > today) headerErrors.dateReceived = 'The date received cannot be in the future.';
  if (!ISO_DATE.test(header.datePurchased)) headerErrors.datePurchased = 'Select the date purchased.';
  else if (ISO_DATE.test(header.dateReceived) && header.datePurchased > header.dateReceived) {
    headerErrors.datePurchased = 'The date purchased cannot be later than the date received.';
  }

  const seen = new Set<string>();
  const lineErrors = lines.map((line): StockInLineErrors => {
    const errors: StockInLineErrors = {};
    const ingredient = byId.get(line.ingredientId);
    if (!ingredient) {
      errors.ingredient = 'Select the ingredient being received.';
    } else if (seen.has(ingredient.id)) {
      errors.ingredient = `${ingredient.name} is listed more than once. Combine it into one line.`;
    } else {
      seen.add(ingredient.id);
    }
    if (!line.quantity.trim()) errors.quantity = 'Enter the quantity received.';
    else if (ingredient && line.unit === 'pack' && !purchaseUnitOf(ingredient)) {
      errors.unit = `${ingredient.name} has no purchase-unit conversion. Enter the quantity in ${ingredient.unit}.`;
    } else if (stockInBaseQuantity(line, ingredient ?? { ...EMPTY_INGREDIENT }) === null) {
      errors.quantity = 'Quantity must be a number greater than 0.';
    }
    if (line.expirationDate && !ISO_DATE.test(line.expirationDate)) {
      errors.expirationDate = 'Enter a valid expiration date.';
    } else if (ingredient?.expirationTracking && !line.expirationDate) {
      errors.expirationDate = `Select the expiration date. ${ingredient.name} is tracked for expiry.`;
    } else if (line.expirationDate && ISO_DATE.test(header.dateReceived) && line.expirationDate < header.dateReceived) {
      errors.expirationDate = 'Expiration date cannot be earlier than the date received.';
    }
    return errors;
  });

  const problems = [
    ...Object.values(headerErrors),
    ...(lines.length === 0 ? ['Add at least one item to the Stock-In.'] : []),
    ...lineErrors.flatMap((errors, index) => Object.values(errors).map((message) => `Item ${index + 1}: ${message}`)),
  ];
  return {
    valid: problems.length === 0,
    header: headerErrors,
    lines: lineErrors,
    summary: problems.length === 0 ? '' : problems.length === 1 ? problems[0] : `Fix ${problems.length} problems before saving. ${problems[0]}`,
  };
}

const EMPTY_INGREDIENT: StockInIngredient = {
  id: '', name: '', category: '', unit: '', expirationTracking: false, packageQuantity: null, packageUnit: null, packageLabel: null,
};

/** The arguments of record_stock_in for a validated form. */
export function buildStockInRequest(header: StockInHeaderDraft, lines: StockInLineDraft[]): {
  header: { supplier_reference: string | null; date_purchased: string; date_received: string };
  lines: Array<{ ingredient_id: string; quantity: number; unit: StockInUnit; expiration_date: string | null }>;
} {
  return {
    header: {
      supplier_reference: header.supplierReference.trim() || null,
      date_purchased: header.datePurchased,
      date_received: header.dateReceived,
    },
    lines: lines.map((line) => ({
      ingredient_id: line.ingredientId,
      quantity: Number(line.quantity.trim().replace(/,/g, '')),
      unit: line.unit,
      expiration_date: line.expirationDate || null,
    })),
  };
}

export type StockInReceiptLine = {
  lineIndex: number;
  ingredientId: string;
  ingredientName: string;
  enteredQuantity: number;
  enteredUnit: string;
  baseQuantity: number;
  baseUnit: string;
  expirationDate: string | null;
  movementReference: string;
  beforeQuantity: number;
  afterQuantity: number;
};

export type StockInReceipt = {
  id: string;
  reference: string;
  branchId: string;
  supplierReference: string | null;
  datePurchased: string;
  dateReceived: string;
  recordedAt: string;
  lines: StockInReceiptLine[];
};

/** Reads the jsonb record_stock_in returns; null when it is not a saved receipt. */
export function parseStockInReceipt(value: unknown): StockInReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { receipt?: Record<string, unknown>; lines?: unknown };
  const receipt = body.receipt;
  if (!receipt || typeof receipt.id !== 'string' || typeof receipt.reference !== 'string' || !Array.isArray(body.lines)) return null;
  return {
    id: receipt.id,
    reference: receipt.reference,
    branchId: String(receipt.branch_id ?? ''),
    supplierReference: typeof receipt.supplier_reference === 'string' ? receipt.supplier_reference : null,
    datePurchased: String(receipt.date_purchased ?? ''),
    dateReceived: String(receipt.date_received ?? ''),
    recordedAt: String(receipt.recorded_at ?? ''),
    lines: (body.lines as Array<Record<string, unknown>>).map((line) => ({
      lineIndex: Number(line.line_index),
      ingredientId: String(line.ingredient_id ?? ''),
      ingredientName: String(line.ingredient_name ?? ''),
      enteredQuantity: Number(line.entered_quantity),
      enteredUnit: String(line.entered_unit ?? ''),
      baseQuantity: Number(line.base_quantity),
      baseUnit: String(line.base_unit ?? ''),
      expirationDate: typeof line.expiration_date === 'string' ? line.expiration_date : null,
      movementReference: String(line.movement_reference ?? ''),
      beforeQuantity: Number(line.before_quantity),
      afterQuantity: Number(line.after_quantity),
    })),
  };
}

/** "3 pack = 1.08 L" for a converted line, or "5 kg" for a base-unit line. */
export function stockInLineQuantityLabel(line: Pick<StockInReceiptLine, 'enteredQuantity' | 'enteredUnit' | 'baseQuantity' | 'baseUnit'>): string {
  const base = `${trimNumber(line.baseQuantity)} ${line.baseUnit}`;
  return line.enteredUnit === line.baseUnit ? base : `${trimNumber(line.enteredQuantity)} ${line.enteredUnit} = ${base}`;
}

/** Turns a server or network error into the message staff see. */
export function stockInErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? '';
  // 22023 and 42501 are raised on purpose with a message written for staff.
  if ((error?.code === '22023' || error?.code === '42501') && message) return message;
  if (/fetch|network|timeout/i.test(message)) return 'No connection. Check the internet connection and try again. Nothing was saved twice.';
  if (isMissingStockInSupport(error)) return 'The new Stock-In form is not available yet. Ask the owner to update the system.';
  return 'Unable to save the Stock-In. Please try again.';
}

export function isMissingStockInSupport(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883'
    || /record_stock_in/.test(error.message ?? '') && /does not exist|could not find|schema cache/i.test(error.message ?? '');
}
