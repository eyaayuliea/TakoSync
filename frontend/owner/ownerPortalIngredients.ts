// OW-22 Ingredients and Recipes on the Owner Web Portal.

export const BASE_UNITS = ['g', 'ml', 'pcs'] as const;
export type BaseUnit = (typeof BASE_UNITS)[number];

/** The units of measurement under each base unit (mass, volume, count). */
export const UNITS_BY_BASE: Record<BaseUnit, string[]> = {
  g: ['g', 'kg'],
  ml: ['ml', 'L', 'tsp', 'tbsp'],
  pcs: ['pcs', 'bottle', 'pack'],
};

/** OW-22 c1, c2: the base unit (g, ml or pcs) of a unit of measurement. */
export function baseUnitOf(unit: string): BaseUnit | null {
  return BASE_UNITS.find((base) => UNITS_BY_BASE[base].includes(unit)) ?? null;
}

export type IngredientForm = {
  id: string | null;
  name: string;
  categoryId: string;
  baseUnit: string;
  unit: string;
  purchaseLabel: string;
  purchaseQuantity: string;
};

/** OW-22 c3: required fields, unique names and a conversion factor greater than zero. */
export function ingredientFormErrors(form: IngredientForm, existing: ReadonlyArray<{ id: string; name: string }>): string[] {
  const errors: string[] = [];
  const name = form.name.trim();
  if (!name) errors.push('Enter the ingredient name.');
  else if (existing.some((item) => item.id !== form.id && item.name.trim().toLowerCase() === name.toLowerCase())) {
    errors.push(`An ingredient named “${name}” already exists.`);
  }
  if (!form.categoryId) errors.push('Choose a category.');
  if (!BASE_UNITS.includes(form.baseUnit as BaseUnit)) errors.push('Choose a base unit (g, ml or pcs).');
  else if (!UNITS_BY_BASE[form.baseUnit as BaseUnit].includes(form.unit)) errors.push('Choose a unit of measurement for this base unit.');
  const hasPurchase = Boolean(form.purchaseLabel.trim() || form.purchaseQuantity.trim());
  if (hasPurchase) {
    if (!form.purchaseLabel.trim()) errors.push('Enter the purchase unit name, e.g. One bottle.');
    const factor = Number(form.purchaseQuantity.trim());
    if (!form.purchaseQuantity.trim() || !Number.isFinite(factor) || factor <= 0) errors.push('The conversion factor must be greater than zero.');
  }
  return errors;
}

export const INGREDIENT_HEADERS = ['Ingredient', 'Category', 'Base Unit', 'Unit of Measurement', 'Purchase Unit'];

type Ingredient = { id: string; name: string; category_id: string; unit: string; active: boolean };
type PurchaseUnit = { ingredient_id: string; package_quantity: number; package_unit: string; package_label: string };

/** OW-22 c1: the ingredient list, filtered by name and category. */
export function ingredientTableRows<T extends Ingredient>(
  ingredients: readonly T[],
  categories: ReadonlyArray<{ id: string; name: string }>,
  purchaseUnits: readonly PurchaseUnit[],
  filter: { query: string; categoryId: string | null },
): { rows: string[][]; ingredients: T[] } {
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));
  const purchase = new Map(purchaseUnits.map((unit) => [unit.ingredient_id, unit]));
  const query = filter.query.trim().toLowerCase();
  const shown = ingredients
    .filter((item) => item.active)
    .filter((item) => !filter.categoryId || item.category_id === filter.categoryId)
    .filter((item) => !query || item.name.toLowerCase().includes(query));
  return {
    ingredients: shown,
    rows: shown.map((item) => {
      const pack = purchase.get(item.id);
      return [
        item.name,
        categoryName.get(item.category_id) ?? '—',
        baseUnitOf(item.unit) ?? '—',
        item.unit,
        pack ? `${pack.package_label} = ${pack.package_quantity} ${pack.package_unit}` : '—',
      ];
    }),
  };
}

export const RECIPE_HEADERS = ['Product', 'Recipe Ingredients', 'Status'];

type RecipeLine = { ingredient_id: string; quantity_required: number; unit_of_measure: string; consumption_basis?: 'per_order' | 'per_piece' };
type SharedRecipe = { name: string; active: boolean; prepared_quantity: number; prepared_unit: string; estimated_yield_pieces: number; productIds: string[] };

const qty = (value: number) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 4 }).format(value);

/**
 * OW-22 c4, c6, c8: each product with its recipe ingredients and required
 * quantities. Takoyaki consume prepared batter through the shared batter recipe;
 * a product with neither is marked "Recipe required" (it cannot be sold).
 */
export function recipeTableRows(
  products: ReadonlyArray<{ id: string; product_name: string }>,
  recipes: ReadonlyArray<RecipeLine & { product_id: string }>,
  sharedRecipes: readonly SharedRecipe[],
  ingredientName: (id: string) => string,
): { rows: string[][]; recipeRequired: string[] } {
  const recipeRequired: string[] = [];
  const rows = products.map((product) => {
    const lines = recipes.filter((line) => line.product_id === product.id && line.ingredient_id !== 'prepared-batter');
    const shared = sharedRecipes.find((recipe) => recipe.active && recipe.productIds.includes(product.id));
    const parts = [
      ...(shared ? [`Prepared batter: ${qty(shared.prepared_quantity / shared.estimated_yield_pieces)} ${shared.prepared_unit} per piece (${shared.name})`] : []),
      ...lines.map((line) => `${ingredientName(line.ingredient_id)}: ${qty(line.quantity_required)} ${line.unit_of_measure}`
        + (line.consumption_basis ? (line.consumption_basis === 'per_piece' ? ' per piece' : ' per order') : '')),
    ];
    if (!parts.length) recipeRequired.push(product.id);
    return [product.product_name, parts.join('\n') || '—', parts.length ? 'Configured' : 'Recipe required'];
  });
  return { rows, recipeRequired };
}
