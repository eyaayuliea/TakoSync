const SHARED_RECIPE_QUANTITY_SCALE = 6;

function assertPreparedQuantity(preparedQuantity: number) {
  if (!Number.isInteger(preparedQuantity) || preparedQuantity <= 0) {
    throw new Error('Configured prepared quantity must be a positive whole number.');
  }
}

export function getPerBottleRecipeQuantity(
  quantityForConfiguredRecipe: number,
  preparedQuantity: number,
): number {
  assertPreparedQuantity(preparedQuantity);
  if (!Number.isFinite(quantityForConfiguredRecipe) || quantityForConfiguredRecipe <= 0) {
    throw new Error('Configured recipe ingredient quantity must be greater than zero.');
  }
  return quantityForConfiguredRecipe / preparedQuantity;
}

export function getConfiguredRecipeQuantity(
  quantityPerBottle: number,
  preparedQuantity: number,
): number {
  assertPreparedQuantity(preparedQuantity);
  if (!Number.isFinite(quantityPerBottle) || quantityPerBottle <= 0) {
    throw new Error('Per-bottle ingredient quantity must be greater than zero.');
  }
  return Number((quantityPerBottle * preparedQuantity).toFixed(SHARED_RECIPE_QUANTITY_SCALE));
}
