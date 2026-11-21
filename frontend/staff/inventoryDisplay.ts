// ST-04 c6: the prepared batter is shown in bottles on the Inventory screen.
// The inventory loader presents it in millilitres for the batter and count
// forms; this converts it back for display only.

export const PREPARED_BATTER_ML_PER_BOTTLE = 680;

type DisplayableInventoryItem = {
  id: string;
  unit: string;
  quantity: number;
  minimumStock: number;
  quantityPrecision: number;
  unitName?: string;
};

function roundTo3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function inventoryDisplayItem<T extends DisplayableInventoryItem>(item: T): T {
  if (item.id !== 'prepared-batter' || item.unit !== 'ml') return item;
  const quantity = roundTo3(item.quantity / PREPARED_BATTER_ML_PER_BOTTLE);
  const minimumStock = roundTo3(item.minimumStock / PREPARED_BATTER_ML_PER_BOTTLE);
  return {
    ...item,
    quantity,
    minimumStock,
    unit: 'bottles',
    unitName: `Bottle (${PREPARED_BATTER_ML_PER_BOTTLE} ml)`,
    quantityPrecision: Number.isInteger(quantity) && Number.isInteger(minimumStock) ? 0 : 3,
  };
}
