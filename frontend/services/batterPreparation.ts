export const PREPARED_BATTER_BATCH_BOTTLES = 5;

export type PreparedBatterBatch = {
  batch_reference: string;
  bottle_count: number;
  prepared_quantity: number;
  prepared_unit: string;
};

export function validatePreparedBatterBatch(value: unknown): PreparedBatterBatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The batter preparation service returned no batch result.');
  }

  const batch = value as Record<string, unknown>;
  const bottleCount = Number(batch.bottle_count);
  const preparedQuantity = Number(batch.prepared_quantity);
  if (typeof batch.batch_reference !== 'string'
    || bottleCount !== PREPARED_BATTER_BATCH_BOTTLES
    || preparedQuantity !== PREPARED_BATTER_BATCH_BOTTLES
    || batch.prepared_unit !== 'bottle') {
    throw new Error('The batter preparation service did not confirm a five-bottle batch.');
  }

  return {
    batch_reference: batch.batch_reference,
    bottle_count: bottleCount,
    prepared_quantity: preparedQuantity,
    prepared_unit: 'bottle',
  };
}

export type StockShortage = {
  ingredientId: string;
  name: string;
  unit: string;
  required: number;
  available: number;
  shortage: number;
};

function formatStockQuantity(value: number): string {
  return String(Number(value.toFixed(3)));
}

/** Same wording as the database error so staff see one consistent message. */
export function formatInsufficientStockMessage(shortage: StockShortage): string {
  return `Insufficient stock for ${shortage.name}: required ${formatStockQuantity(shortage.required)} ${shortage.unit}, `
    + `available ${formatStockQuantity(shortage.available)} ${shortage.unit}, `
    + `shortage ${formatStockQuantity(shortage.shortage)} ${shortage.unit}`;
}

export type BatterRecipeLine = {
  ingredient_id: string;
  quantity_required: number;
  unit_of_measure: string;
  automatic_consumption_enabled: boolean;
};

/**
 * Required raw quantities for one five-bottle batch, scaled from the Owner recipe
 * (never modified here), compared with the branch's available stock.
 */
export function findBatterShortages(
  recipe: { prepared_quantity: number; ingredientLines: readonly BatterRecipeLine[] },
  stock: ReadonlyMap<string, { name: string; unit: string; quantity: number }>,
): StockShortage[] {
  const shortages: StockShortage[] = [];
  for (const line of recipe.ingredientLines) {
    if (!line.automatic_consumption_enabled || line.ingredient_id === 'prepared-batter') continue;
    const required = line.quantity_required * PREPARED_BATTER_BATCH_BOTTLES / Math.max(1, recipe.prepared_quantity);
    const item = stock.get(line.ingredient_id);
    const available = item?.quantity ?? 0;
    if (available + 1e-9 < required) {
      shortages.push({
        ingredientId: line.ingredient_id,
        name: item?.name ?? line.ingredient_id,
        unit: item?.unit ?? line.unit_of_measure,
        required,
        available,
        shortage: required - available,
      });
    }
  }
  return shortages;
}

export function formatBatterShortages(shortages: readonly StockShortage[]): string {
  return `Cannot record this batter batch. ${shortages.map(formatInsufficientStockMessage).join('; ')}`;
}
