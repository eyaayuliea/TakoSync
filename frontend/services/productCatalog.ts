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
};

export type ProductVariantPriceInput = {
  variant_code: string;
  size_label: string;
  piece_count: number;
  price: number;
};

export type OwnerProductInput = {
  product_name: string;
  description: string;
  is_available: boolean;
};

function assertValidProduct(input: OwnerProductInput) {
  if (!input.product_name.trim()) throw new Error('Product name is required.');
  if (!input.description.trim()) throw new Error('Product description is required.');
}

function assertValidVariantPrices(variants: ProductVariantPriceInput[]) {
  if (variants.length !== standardProductVariants.length) {
    throw new Error('Configure all standard menu variants before saving this product.');
  }
  for (const [index, variant] of standardProductVariants.entries()) {
    const submitted = variants[index];
    if (
      submitted.variant_code !== variant.variant_code ||
      submitted.size_label !== variant.size_label ||
      submitted.piece_count !== variant.piece_count ||
      !Number.isFinite(submitted.price) ||
      submitted.price < 0
    ) {
      throw new Error(`Enter a valid selling price for ${variant.size_label}.`);
    }
  }
}

function assertValidPrice(price: number) {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('Selling prices must be valid numbers greater than or equal to zero.');
  }
}

async function restoreVariantPrices(
  client: ProductCatalogClient,
  productId: string,
  changed: Array<{ id: string; price: number }>,
): Promise<string[]> {
  const failures: string[] = [];
  for (const variant of [...changed].reverse()) {
    const { error } = await client
      .from('product_variants')
      .update({ price: variant.price })
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
  for (const variant of input.variants) assertValidPrice(variant.price);
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

  const { data: currentVariants, error: variantsLoadError } = await client
    .from('product_variants')
    .select('id, variant_code, price')
    .eq('product_id', productId);
  if (variantsLoadError) throw new Error(`Unable to load current product variants: ${variantsLoadError.message}`);

  const currentById = new Map((currentVariants ?? []).map((variant) => [variant.id, variant]));
  if (
    input.variants.length !== currentById.size ||
    input.variants.some((variant) => !currentById.has(variant.id))
  ) {
    throw new Error('The product variants changed while editing. Reload the product and try again.');
  }

  const changed: Array<{ id: string; price: number }> = [];
  try {
    for (const variant of input.variants) {
      const current = currentById.get(variant.id);
      if (!current || Number(current.price) === variant.price) continue;
      const previousPrice = Number(current.price);

      const { data, error } = await client
        .from('product_variants')
        .update({ price: variant.price })
        .eq('id', variant.id)
        .eq('product_id', productId)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`Unable to update variant ${variant.id}: ${error.message}`);
      if (!data) throw new Error(`Variant ${variant.id} no longer belongs to this product.`);
      changed.push({ id: variant.id, price: previousPrice });
    }

    const regularVariant = input.variants.find((variant) => currentById.get(variant.id)?.variant_code === '4pcs');
    const updates = {
      product_name: input.product_name.trim(),
      description: input.description.trim(),
      is_available: input.is_available,
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
  products: Array<{ id: string; product_name: string; description: string; is_available: boolean }>,
  variants: Array<{
    id: string;
    product_id: string;
    size_label: string;
    price: number;
    piece_count: number;
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
      category: 'Menu' as const,
      sizeLabel: variant.size_label,
      price: Number(variant.price),
      pieceCount: Number(variant.piece_count),
      isAvailable: product.is_available && variant.is_available,
    }];
  });
}
