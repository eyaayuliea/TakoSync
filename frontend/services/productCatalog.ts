import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../backend/types/database';

type ProductCatalogClient = SupabaseClient<Database>;

export const standardProductVariants = [
  { variant_code: '4pcs', size_label: '4 PCS', piece_count: 4 },
  { variant_code: '8pcs', size_label: '8 PCS', piece_count: 8 },
  { variant_code: '10plus1pcs', size_label: '10+1 PCS', piece_count: 11 },
] as const;

export type ProductVariantPrice = {
  id: string;
  price: number;
  /** OW-21 c3: pieces per portion (used for batter consumption). Omit to keep the current value. */
  piece_count?: number;
  /** ST-02 c5 / OW-21 c4: maximum quantity per order; null = no maximum. Omit to keep the current value. */
  max_order_quantity?: number | null;
};

export type ProductVariantPriceInput = {
  variant_code: string;
  size_label: string;
  piece_count: number;
  price: number;
  max_order_quantity?: number | null;
};

/** OW-21 c6: a maximum quantity per order must be a whole number greater than zero. */
export function assertValidMaxOrderQuantity(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`The maximum quantity per order for ${label} must be a whole number greater than zero.`);
  }
}

export const PRODUCT_PORTION_TYPES = ['Regular', 'Combo + Cheese'] as const;
export type ProductPortionType = (typeof PRODUCT_PORTION_TYPES)[number];

export type OwnerProductInput = {
  product_name: string;
  description: string;
  is_available: boolean;
  /** OW-21 c2: the flavor and portion type (left unchanged when omitted). */
  flavor?: string;
  portion_type?: ProductPortionType;
};

function assertValidProduct(input: OwnerProductInput) {
  if (!input.product_name.trim()) throw new Error('Enter the product name.');
  if (input.flavor !== undefined && !input.flavor.trim()) throw new Error('Enter the flavor.');
  if (input.portion_type !== undefined && !PRODUCT_PORTION_TYPES.includes(input.portion_type)) throw new Error('Choose the portion type.');
  if (!input.description.trim()) throw new Error('Enter the product description.');
}

/** OW-21 c3: pieces per portion must be a whole number greater than zero. */
export function assertValidPieceCount(value: number | undefined, label: string) {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`The number of pieces per portion for ${label} must be a whole number greater than zero.`);
  }
}

/** OW-21 c6: a selling price must be greater than zero. */
export function assertValidSellingPrice(price: number, label: string) {
  if (!Number.isFinite(price) || price <= 0) throw new Error(`The selling price for ${label} must be greater than zero.`);
}

// The POS shows a flavor's Regular product from the "Flavors" category and its
// combo from "Combo" (ST-03), so the category follows the portion type.
const productFields = (input: OwnerProductInput) => ({
  ...(input.flavor !== undefined ? { flavor: input.flavor.trim() } : {}),
  ...(input.portion_type !== undefined
    ? { portion_type: input.portion_type, category: input.portion_type === 'Combo + Cheese' ? 'Combo' : 'Flavors' }
    : {}),
});

function assertValidVariantPrices(variants: ProductVariantPriceInput[]) {
  if (variants.length !== standardProductVariants.length) {
    throw new Error('Configure all standard menu variants before saving this product.');
  }
  for (const [index, variant] of standardProductVariants.entries()) {
    const submitted = variants[index];
    if (submitted.variant_code !== variant.variant_code || submitted.size_label !== variant.size_label) {
      throw new Error('Configure all standard menu variants before saving this product.');
    }
    assertValidSellingPrice(submitted.price, variant.size_label);
    assertValidPieceCount(submitted.piece_count, variant.size_label);
    assertValidMaxOrderQuantity(submitted.max_order_quantity, variant.size_label);
  }
}


export function parseCatalogPrice(value: unknown, label: string): number {
  const price = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`${label} has an invalid price.`);
  }
  return price;
}

/** `max_order_quantity` undefined = the column is not available, so it is left untouched. */
type VariantRestorePoint = { id: string; price: number; piece_count?: number; max_order_quantity?: number | null };

async function restoreVariantPrices(
  client: ProductCatalogClient,
  productId: string,
  changed: VariantRestorePoint[],
): Promise<string[]> {
  const failures: string[] = [];
  for (const variant of [...changed].reverse()) {
    const { error } = await client
      .from('product_variants')
      .update({
        price: variant.price,
        ...(variant.piece_count === undefined ? {} : { piece_count: variant.piece_count }),
        ...(variant.max_order_quantity === undefined ? {} : { max_order_quantity: variant.max_order_quantity }),
      })
      .eq('id', variant.id)
      .eq('product_id', productId);
    if (error) failures.push(`variant ${variant.id}: ${error.message}`);
  }
  return failures;
}

export async function createOwnerProduct(
  client: ProductCatalogClient,
  input: OwnerProductInput & { variants: ProductVariantPriceInput[] },
) {
  assertValidProduct(input);
  assertValidVariantPrices(input.variants);

  const { data: product, error: productError } = await client
    .from('products')
    .insert({
      product_name: input.product_name.trim(),
      description: input.description.trim(),
      price: input.variants[0].price,
      is_available: input.is_available,
      ...productFields(input),
    })
    .select('id, product_name, description, price, is_available, created_at, updated_at')
    .single();
  if (productError) throw new Error(`Unable to create the product: ${productError.message}`);
  if (!product) throw new Error('The product could not be created.');

  const { data: variants, error: variantsError } = await client
    .from('product_variants')
    .insert(input.variants.map((variant) => ({
      product_id: product.id,
      variant_code: variant.variant_code,
      size_label: variant.size_label,
      piece_count: variant.piece_count,
      price: variant.price,
      ...(variant.max_order_quantity ? { max_order_quantity: variant.max_order_quantity } : {}),
      active: true,
      is_available: true,
    })))
    .select('id');

  if (!variantsError && variants?.length === standardProductVariants.length) {
    return { ...product, price: Number(product.price) };
  }

  const failure = variantsError?.message ?? 'The database did not return all created variants.';
  const { data: removedProduct, error: cleanupError } = await client
    .from('products')
    .delete()
    .eq('id', product.id)
    .select('id')
    .maybeSingle();
  if (cleanupError || !removedProduct) {
    const cleanupFailure = cleanupError?.message ?? 'the created product could not be confirmed as removed';
    throw new Error(`Product variant creation failed: ${failure}. Cleanup also failed: ${cleanupFailure}.`);
  }
  throw new Error(`Product variant creation failed; the incomplete product was removed: ${failure}`);
}

export async function updateOwnerProduct(
  client: ProductCatalogClient,
  productId: string,
  input: OwnerProductInput & { variants: ProductVariantPrice[] },
) {
  assertValidProduct(input);
  for (const variant of input.variants) {
    assertValidSellingPrice(variant.price, 'this size');
    assertValidPieceCount(variant.piece_count, 'this size');
    assertValidMaxOrderQuantity(variant.max_order_quantity, 'this size');
  }
  if (new Set(input.variants.map((variant) => variant.id)).size !== input.variants.length) {
    throw new Error('A product variant may only be updated once.');
  }

  const { data: currentProduct, error: productLoadError } = await client
    .from('products')
    .select('id, product_name, description, price, is_available, created_at, updated_at')
    .eq('id', productId)
    .maybeSingle();
  if (productLoadError) throw new Error(`Unable to load the current product: ${productLoadError.message}`);
  if (!currentProduct) throw new Error('The product no longer exists.');

  let maxOrderQuantitySupported = true;
  let variantsLoad = await client
    .from('product_variants')
    .select('id, variant_code, price, piece_count, max_order_quantity')
    .eq('product_id', productId);
  if (isMissingMaxOrderQuantityColumn(variantsLoad.error)) {
    maxOrderQuantitySupported = false;
    const legacy = await client
      .from('product_variants')
      .select('id, variant_code, price, piece_count')
      .eq('product_id', productId);
    variantsLoad = { ...legacy, data: (legacy.data ?? []).map((variant) => ({ ...variant, max_order_quantity: null })) } as typeof variantsLoad;
  }
  const { data: currentVariants, error: variantsLoadError } = variantsLoad;
  if (variantsLoadError) throw new Error(`Unable to load current product variants: ${variantsLoadError.message}`);

  const currentById = new Map((currentVariants ?? []).map((variant) => [variant.id, variant]));
  if (
    input.variants.length !== currentById.size ||
    input.variants.some((variant) => !currentById.has(variant.id))
  ) {
    throw new Error('The product variants changed while editing. Reload the product and try again.');
  }

  const changed: VariantRestorePoint[] = [];
  try {
    for (const variant of input.variants) {
      const current = currentById.get(variant.id);
      if (!current) continue;
      const previousMax = current.max_order_quantity ?? null;
      const nextMax = variant.max_order_quantity === undefined || !maxOrderQuantitySupported
        ? previousMax
        : variant.max_order_quantity;
      const previousPieces = current.piece_count === null || current.piece_count === undefined ? undefined : Number(current.piece_count);
      const nextPieces = variant.piece_count ?? previousPieces;
      if (Number(current.price) === variant.price && previousMax === nextMax && previousPieces === nextPieces) continue;
      const previousPrice = Number(current.price);

      const { data, error } = await client
        .from('product_variants')
        .update({
          price: variant.price,
          ...(nextPieces !== undefined && nextPieces !== previousPieces ? { piece_count: nextPieces } : {}),
          ...(maxOrderQuantitySupported ? { max_order_quantity: nextMax } : {}),
        })
        .eq('id', variant.id)
        .eq('product_id', productId)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`Unable to update variant ${variant.id}: ${error.message}`);
      if (!data) throw new Error(`Variant ${variant.id} no longer belongs to this product.`);
      changed.push({
        id: variant.id,
        price: previousPrice,
        ...(previousPieces !== undefined ? { piece_count: previousPieces } : {}),
        ...(maxOrderQuantitySupported ? { max_order_quantity: previousMax } : {}),
      });
    }

    const regularVariant = input.variants.find((variant) => currentById.get(variant.id)?.variant_code === '4pcs');
    const updates = {
      product_name: input.product_name.trim(),
      description: input.description.trim(),
      is_available: input.is_available,
      ...productFields(input),
      ...(regularVariant ? { price: regularVariant.price } : {}),
    };
    const { data: updatedProduct, error: updateError } = await client
      .from('products')
      .update(updates)
      .eq('id', productId)
      .select('id, product_name, description, price, is_available, created_at, updated_at')
      .maybeSingle();
    if (updateError) throw new Error(`Unable to update the product: ${updateError.message}`);
    if (!updatedProduct) throw new Error('The product no longer exists.');
    return { ...updatedProduct, price: Number(updatedProduct.price) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save product changes.';
    const rollbackFailures = await restoreVariantPrices(client, productId, changed);
    if (rollbackFailures.length) {
      throw new Error(`${message} Variant price rollback was incomplete: ${rollbackFailures.join('; ')}`);
    }
    throw new Error(message);
  }
}

export function buildStaffMenuProducts(
  products: Array<{ id: string; product_name: string; description: string; is_available: boolean; category?: string; flavor?: string | null; portion_type?: string | null }>,
  variants: Array<{
    id: string;
    product_id: string;
    size_label: string;
    price: number;
    piece_count: number;
    max_order_quantity?: number | null;
    active: boolean;
    is_available: boolean;
  }>,
  visibleVariantIds: Set<string>,
) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  return variants.flatMap((variant) => {
    const product = productsById.get(variant.product_id);
    if (
      !product ||
      product.product_name === 'combo_octobits_cheese_02' ||
      !variant.active ||
      !visibleVariantIds.has(variant.id)
    ) return [];
    return [{
      id: variant.id,
      productId: variant.product_id,
      name: product.product_name,
      description: product.description,
      category: product.category ?? 'Menu',
      flavor: product.flavor ?? null,
      portionType: product.portion_type ?? null,
      sizeLabel: variant.size_label,
      price: parseCatalogPrice(variant.price, `Menu variant ${variant.id}`),
      pieceCount: Number(variant.piece_count),
      maxQuantity: normalizeMaxOrderQuantity(variant.max_order_quantity),
      isAvailable: product.is_available && variant.is_available,
    }];
  });
}

/** A usable maximum quantity per order, or null when none (or an invalid one) is set. */
export function normalizeMaxOrderQuantity(value: unknown): number | null {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * True when the database has not received the #30 migration yet, so callers can
 * fall back to the previous columns instead of breaking the menu or product screens.
 * PostgREST reports 42703 for an unknown selected column and PGRST204 for an
 * unknown column in a write payload.
 */
export function isMissingMaxOrderQuantityColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error)
    && (error!.code === '42703' || error!.code === 'PGRST204')
    && /max_order_quantity/.test(error!.message ?? '');
}
