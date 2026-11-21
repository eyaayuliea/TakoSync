import type { ProductVariantPriceInput } from '../services/productCatalog';

type ProductVariantDefinition = Pick<
  ProductVariantPriceInput,
  'variant_code' | 'size_label' | 'piece_count'
>;

export function buildOwnerPortalVariantPrices(
  priceDrafts: Record<string, string>,
  variants: readonly ProductVariantDefinition[],
  maxQuantityDrafts: Record<string, string> = {},
): ProductVariantPriceInput[] {
  return variants.map((variant) => {
    const draft = priceDrafts[variant.variant_code]?.trim() ?? '';
    const price = Number(draft);
    if (!draft || !Number.isFinite(price) || price < 0) {
      throw new Error(`Enter a valid selling price for ${variant.size_label}.`);
    }

    return {
      ...variant,
      price,
      max_order_quantity: parseOwnerMaxOrderQuantity(maxQuantityDrafts[variant.variant_code], variant.size_label),
    };
  });
}

/**
 * OW-21 c4, c6: the maximum quantity per order for one size. Blank means no
 * maximum; otherwise it must be a whole number greater than zero.
 */
export function parseOwnerMaxOrderQuantity(draft: string | undefined, sizeLabel: string): number | null {
  const value = draft?.trim() ?? '';
  if (!value) return null;
  const quantity = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(quantity) || quantity < 1) {
    throw new Error(`The maximum quantity per order for ${sizeLabel} must be a whole number greater than zero.`);
  }
  return quantity;
}
