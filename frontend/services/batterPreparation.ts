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
