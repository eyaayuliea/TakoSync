import type { ProductVariantPriceInput } from '../services/productCatalog';

type ProductVariantDefinition = Pick<
  ProductVariantPriceInput,
  'variant_code' | 'size_label' | 'piece_count'
>;

export function buildOwnerPortalVariantPrices(
  priceDrafts: Record<string, string>,
  variants: readonly ProductVariantDefinition[],
): ProductVariantPriceInput[] {
  return variants.map((variant) => {
    const draft = priceDrafts[variant.variant_code]?.trim() ?? '';
    const price = Number(draft);
    if (!draft || !Number.isFinite(price) || price < 0) {
      throw new Error(`Enter a valid selling price for ${variant.size_label}.`);
    }

    return { ...variant, price };
  });
}
