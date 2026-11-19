// Field-level validation for the Staff Waste & Spillage form. Each failure says what is wrong
// (missing field, bad quantity, precision, or more than is in stock) instead of one generic
// "check the required fields" message.

export type WasteFormIngredient = {
  name: string;
  quantity: number;
  unit: string;
  quantityPrecision: number;
};

export type WasteFieldKey = 'item' | 'quantity' | 'date' | 'reason';

export type WasteValidationInput = {
  ingredient: WasteFormIngredient | null;
  quantityValue: string;
  date: Date | null;
  reason: string;
  allowedReasons: readonly string[];
  checkAvailableStock: boolean;
};

export type WasteValidationResult = {
  errors: Partial<Record<WasteFieldKey, string>>;
  /** One sentence describing every cause, for the form-level message. */
  summary: string;
};

const FIELD_LABELS: Record<WasteFieldKey, string> = {
  item: 'Ingredient',
  quantity: 'Quantity wasted',
  date: 'Transaction date',
  reason: 'Reason',
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

export function validateWasteForm(input: WasteValidationInput): WasteValidationResult {
  const errors: WasteValidationResult['errors'] = {};
  const missing: WasteFieldKey[] = [];
  const { ingredient } = input;
  const quantityText = input.quantityValue.trim();
  const parsed = Number(input.quantityValue);

  if (!ingredient) {
    errors.item = 'Select the ingredient that was wasted.';
    missing.push('item');
  }

  if (!quantityText) {
    errors.quantity = 'Enter the quantity wasted.';
    missing.push('quantity');
  } else if (!Number.isFinite(parsed) || parsed <= 0) {
    errors.quantity = 'Quantity must be a number greater than 0.';
  } else if (ingredient && !isValidWasteQuantityText(input.quantityValue, ingredient.quantityPrecision)) {
    errors.quantity = ingredient.quantityPrecision === 0
      ? `${ingredient.name} is counted in whole ${ingredient.unit}. Remove the decimals.`
      : `Use at most ${ingredient.quantityPrecision} decimal ${ingredient.quantityPrecision === 1 ? 'place' : 'places'} for ${ingredient.name}.`;
  } else if (ingredient && input.checkAvailableStock && parsed > ingredient.quantity) {
    errors.quantity = ingredient.quantity > 0
      ? `Only ${formatAmount(ingredient.quantity)} ${ingredient.unit} of ${ingredient.name} in stock. Enter ${formatAmount(ingredient.quantity)} or less.`
      : `${ingredient.name} has no stock to waste.`;
  }

  if (!input.date || !Number.isFinite(input.date.getTime())) {
    errors.date = 'Select the transaction date.';
    missing.push('date');
  }
  if (!input.allowedReasons.some((option) => option === input.reason)) {
    errors.reason = 'Select a reason.';
    missing.push('reason');
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Complete the required ${missing.length === 1 ? 'field' : 'fields'}: ${missing.map((key) => FIELD_LABELS[key]).join(', ')}.`);
  }
  if (errors.quantity && !missing.includes('quantity')) parts.push(errors.quantity);
  return { errors, summary: parts.join(' ') };
}
