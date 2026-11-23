import type { ProductVariantPriceInput } from '../services/productCatalog';

type ProductVariantDefinition = Pick<
  ProductVariantPriceInput,
  'variant_code' | 'size_label' | 'piece_count'
>;

/**
 * OW-21 c3, c4, c6: the price, pieces per portion and maximum quantity of each
 * size. Prices must be greater than zero; pieces default to the standard count.
 */
export function buildOwnerPortalVariantPrices(
  priceDrafts: Record<string, string>,
  variants: readonly ProductVariantDefinition[],
  maxQuantityDrafts: Record<string, string> = {},
  pieceDrafts: Record<string, string> = {},
): ProductVariantPriceInput[] {
  return variants.map((variant) => {
    const draft = priceDrafts[variant.variant_code]?.trim() ?? '';
    if (!draft) throw new Error(`Enter the selling price for ${variant.size_label}.`);
    const price = Number(draft);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`The selling price for ${variant.size_label} must be greater than zero.`);
    }
    const piecesDraft = pieceDrafts[variant.variant_code]?.trim() ?? '';
    const pieces = piecesDraft ? Number(piecesDraft) : variant.piece_count;
    if (!/^\d*$/.test(piecesDraft) || !Number.isSafeInteger(pieces) || pieces < 1) {
      throw new Error(`The number of pieces per portion for ${variant.size_label} must be a whole number greater than zero.`);
    }

    return {
      ...variant,
      piece_count: pieces,
      price,
      max_order_quantity: parseOwnerMaxOrderQuantity(maxQuantityDrafts[variant.variant_code], variant.size_label),
    };
  });
}

/** OW-21 c6: the required text fields of the product form, with a specific message for each. */
export function productFormErrors(form: { name: string; flavor: string; portionType: string; description: string }): string[] {
  return [
    ...(form.name.trim() ? [] : ['Enter the product name.']),
    ...(form.flavor.trim() ? [] : ['Enter the flavor.']),
    ...(form.portionType ? [] : ['Choose the portion type.']),
    ...(form.description.trim() ? [] : ['Enter the product description.']),
  ];
}

export const PRODUCT_TABLE_HEADERS = ['Name', 'Flavor', 'Portion Type', 'Selling Price', 'Availability', 'Description'];

type TableProduct = {
  product_name: string;
  flavor?: string | null;
  portion_type?: string | null;
  description: string;
  is_available: boolean;
  variants: Array<{ variant_code: string; size_label: string; price: number }>;
};

/** OW-21 c1: the product table, filtered by name or flavor. */
export function productTableRows<T extends TableProduct>(products: readonly T[], query: string): { rows: string[][]; products: T[] } {
  const text = query.trim().toLowerCase();
  const shown = products.filter((product) => !text
    || product.product_name.toLowerCase().includes(text)
    || (product.flavor ?? '').toLowerCase().includes(text));
  const order = ['4pcs', '8pcs', '10plus1pcs'];
  return {
    products: shown,
    rows: shown.map((product) => [
      product.product_name,
      product.flavor || '—',
      product.portion_type || '—',
      [...product.variants]
        .sort((left, right) => order.indexOf(left.variant_code) - order.indexOf(right.variant_code))
        .map((variant) => `${variant.size_label} ₱${variant.price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
        .join('\n') || '—',
      product.is_available ? 'Available' : 'Unavailable',
      product.description || '—',
    ]),
  };
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
