// Field-level validation shared by the Staff Waste, Stock-In and Stock-Out forms. Each failure
// says what is wrong (missing field, bad quantity, precision, more than is in stock, bad
// expiration date) instead of one generic "check the required fields" message.

export type InventoryFormIngredient = {
  name: string;
  quantity: number;
  unit: string;
  quantityPrecision: number;
  expirationTracking?: boolean;
};

/** @deprecated kept for existing callers; use InventoryFormIngredient. */
export type WasteFormIngredient = InventoryFormIngredient;

export type FieldValidation<Key extends string> = {
  errors: Partial<Record<Key, string>>;
  /** One sentence describing every cause, for the form-level message. */
  summary: string;
};

export function isValidWasteQuantityText(value: string, precision: number): boolean {
  const pattern = precision === 0
    ? /^\d+$/
    : new RegExp(`^(?:\\d+(?:\\.\\d{1,${precision}})?|\\.\\d{1,${precision}})$`);
  return pattern.test(value.trim()) && Number.isFinite(Number(value));
}

function formatAmount(value: number): string {
  return String(Number(value.toFixed(3)));
}

type QuantityProblem = { message: string; missing: boolean };

function quantityProblem(input: {
  ingredient: InventoryFormIngredient | null;
  quantityValue: string;
  checkAvailableStock: boolean;
  missingMessage: string;
}): QuantityProblem | null {
  const { ingredient } = input;
  const text = input.quantityValue.trim();
  const parsed = Number(input.quantityValue);
  if (!text) return { message: input.missingMessage, missing: true };
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { message: 'Quantity must be a number greater than 0.', missing: false };
  }
  if (ingredient && !isValidWasteQuantityText(input.quantityValue, ingredient.quantityPrecision)) {
    return {
      message: ingredient.quantityPrecision === 0
        ? `${ingredient.name} is counted in whole ${ingredient.unit}. Remove the decimals.`
        : `Use at most ${ingredient.quantityPrecision} decimal ${ingredient.quantityPrecision === 1 ? 'place' : 'places'} for ${ingredient.name}.`,
      missing: false,
    };
  }
  if (ingredient && input.checkAvailableStock && parsed > ingredient.quantity) {
    return {
      message: `Insufficient stock for ${ingredient.name}: required ${formatAmount(parsed)} ${ingredient.unit}, `
        + `available ${formatAmount(ingredient.quantity)} ${ingredient.unit}, `
        + `shortage ${formatAmount(parsed - ingredient.quantity)} ${ingredient.unit}`,
      missing: false,
    };
  }
  return null;
}

function summarize(
  missing: Array<{ key: string; label: string }>,
  otherMessages: string[],
): string {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Complete the required ${missing.length === 1 ? 'field' : 'fields'}: ${missing.map((entry) => entry.label).join(', ')}.`);
  }
  parts.push(...otherMessages);
  return parts.join(' ');
}

function isValidDate(value: Date | null | undefined): value is Date {
  return Boolean(value) && Number.isFinite((value as Date).getTime());
}

function dayStamp(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

// ---------------------------------------------------------------------------------------------
// Waste & Spillage
// ---------------------------------------------------------------------------------------------

export type WasteFieldKey = 'item' | 'quantity' | 'date' | 'reason';

export type WasteValidationInput = {
  ingredient: InventoryFormIngredient | null;
  quantityValue: string;
  date: Date | null;
  reason: string;
  allowedReasons: readonly string[];
  checkAvailableStock: boolean;
};

export type WasteValidationResult = FieldValidation<WasteFieldKey>;

export function validateWasteForm(input: WasteValidationInput): WasteValidationResult {
  const errors: WasteValidationResult['errors'] = {};
  const missing: Array<{ key: string; label: string }> = [];
  const others: string[] = [];

  if (!input.ingredient) {
    errors.item = 'Select the ingredient that was wasted.';
    missing.push({ key: 'item', label: 'Ingredient' });
  }
  const problem = quantityProblem({
    ingredient: input.ingredient,
    quantityValue: input.quantityValue,
    checkAvailableStock: input.checkAvailableStock,
    missingMessage: 'Enter the quantity wasted.',
  });
  if (problem) {
    errors.quantity = problem.message;
    if (problem.missing) missing.push({ key: 'quantity', label: 'Quantity wasted' });
    else others.push(problem.message);
  }
  if (!isValidDate(input.date)) {
    errors.date = 'Select the transaction date.';
    missing.push({ key: 'date', label: 'Transaction date' });
  }
  if (!input.allowedReasons.some((option) => option === input.reason)) {
    errors.reason = 'Select a reason.';
    missing.push({ key: 'reason', label: 'Reason' });
  }
  return { errors, summary: summarize(missing, others) };
}

// ---------------------------------------------------------------------------------------------
// Stock-In
// ---------------------------------------------------------------------------------------------

export type StockInFieldKey = 'ingredient' | 'quantity' | 'transactionDate' | 'expirationDate';

export type StockInValidationInput = {
  ingredient: InventoryFormIngredient | null;
  quantityValue: string;
  transactionDate: Date | null;
  expirationDate: Date | null;
};

export function validateStockInForm(input: StockInValidationInput): FieldValidation<StockInFieldKey> {
  const errors: FieldValidation<StockInFieldKey>['errors'] = {};
  const missing: Array<{ key: string; label: string }> = [];
  const others: string[] = [];
  const { ingredient } = input;

  if (!ingredient) {
    errors.ingredient = 'Select the ingredient being received.';
    missing.push({ key: 'ingredient', label: 'Ingredient' });
  }
  const problem = quantityProblem({
    ingredient,
    quantityValue: input.quantityValue,
    checkAvailableStock: false,
    missingMessage: 'Enter the quantity received.',
  });
  if (problem) {
    errors.quantity = problem.message;
    if (problem.missing) missing.push({ key: 'quantity', label: 'Quantity' });
    else others.push(problem.message);
  }
  if (!isValidDate(input.transactionDate)) {
    errors.transactionDate = 'Select the transaction date.';
    missing.push({ key: 'transactionDate', label: 'Transaction date' });
  }
  if (input.expirationDate && !isValidDate(input.expirationDate)) {
    errors.expirationDate = 'Enter a valid expiration date.';
    others.push(errors.expirationDate);
  } else if (ingredient?.expirationTracking && !input.expirationDate) {
    errors.expirationDate = `Select the expiration date. ${ingredient.name} is tracked for expiry.`;
    missing.push({ key: 'expirationDate', label: 'Expiration date' });
  } else if (
    isValidDate(input.transactionDate) &&
    isValidDate(input.expirationDate) &&
    dayStamp(input.expirationDate) < dayStamp(input.transactionDate)
  ) {
    errors.expirationDate = 'Expiration date cannot be earlier than the transaction date.';
    others.push(errors.expirationDate);
  }
  return { errors, summary: summarize(missing, others) };
}

// ---------------------------------------------------------------------------------------------
// Stock-Out (manual usage, or a cooking batch that only needs the date and reason)
// ---------------------------------------------------------------------------------------------

export type StockOutFieldKey = 'ingredient' | 'quantity' | 'transactionDate' | 'reason';

export type StockOutValidationInput = {
  ingredient: InventoryFormIngredient | null;
  quantityValue: string;
  transactionDate: Date | null;
  reason: string;
  /** False for cooking-batch usage, where the ingredients and quantities come from the recipe. */
  validateIngredientAndQuantity?: boolean;
};

export function validateStockOutForm(input: StockOutValidationInput): FieldValidation<StockOutFieldKey> {
  const errors: FieldValidation<StockOutFieldKey>['errors'] = {};
  const missing: Array<{ key: string; label: string }> = [];
  const others: string[] = [];
  const checkItem = input.validateIngredientAndQuantity !== false;

  if (checkItem) {
    if (!input.ingredient) {
      errors.ingredient = 'Select the ingredient that was used.';
      missing.push({ key: 'ingredient', label: 'Ingredient' });
    }
    const problem = quantityProblem({
      ingredient: input.ingredient,
      quantityValue: input.quantityValue,
      checkAvailableStock: true,
      missingMessage: 'Enter the quantity used.',
    });
    if (problem) {
      errors.quantity = problem.message;
      if (problem.missing) missing.push({ key: 'quantity', label: 'Quantity used' });
      else others.push(problem.message);
    }
  }
  if (!isValidDate(input.transactionDate)) {
    errors.transactionDate = 'Select the transaction date.';
    missing.push({ key: 'transactionDate', label: 'Transaction date' });
  }
  if (!input.reason.trim()) {
    errors.reason = 'Enter the reason for using this stock.';
    missing.push({ key: 'reason', label: 'Reason' });
  }
  return { errors, summary: summarize(missing, others) };
}
