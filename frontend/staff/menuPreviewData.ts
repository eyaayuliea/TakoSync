export type MenuFilter = 'All' | 'Available' | 'Unavailable';

export type MenuProduct = {
  id: string;
  productId: string;
  productName: string;
  sizeLabel: string;
  pieceCount: number;
  category: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
};

export type MenuProductGroup = {
  id: string;
  name: string;
  category: string;
  description: string;
  variants: MenuProduct[];
};

export type MenuCartLine = {
  productId: string;
  quantity: number;
};

export const EMPTY_MENU_ORDER_MESSAGE = 'Please add at least one item to the order.';

export function filterMenuProducts(
  products: MenuProduct[],
  filter: MenuFilter,
  search: string,
) {
  const searchTerm = search.trim().toLowerCase();
  return products.filter((product) => {
    const matchesAvailability = filter === 'All'
      || (filter === 'Available' && product.isAvailable)
      || (filter === 'Unavailable' && !product.isAvailable);
    const matchesSearch = `${product.name} ${product.description}`
      .toLowerCase().includes(searchTerm);
    return matchesAvailability && matchesSearch;
  });
}

export function groupMenuProducts(products: MenuProduct[]): MenuProductGroup[] {
  const grouped = new Map<string, MenuProductGroup>();
  for (const product of products) {
    let group = grouped.get(product.productId);
    if (!group) {
      group = {
        id: product.productId,
        name: product.productName,
        category: product.category,
        description: product.description,
        variants: [],
      };
      grouped.set(product.productId, group);
    }
    group.variants.push(product);
  }

  const categoryRank = (category: string) => {
    if (category.toLowerCase() === 'flavors') return 0;
    if (category.toLowerCase() === 'combo') return 1;
    return 2;
  };
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      variants: [...group.variants].sort((left, right) =>
        left.pieceCount - right.pieceCount || left.sizeLabel.localeCompare(right.sizeLabel)),
    }))
    .sort((left, right) =>
      categoryRank(left.category) - categoryRank(right.category)
      || left.category.localeCompare(right.category)
      || left.name.localeCompare(right.name));
}

export function selectFlavorMenuProducts(
  groups: MenuProductGroup[],
  regularProductName: string,
  comboProductName?: string,
): MenuProductGroup[] {
  const selected: MenuProductGroup[] = [];
  const regular = groups.find((group) =>
    group.name === regularProductName && group.category.toLowerCase() === 'flavors');
  if (regular) selected.push(regular);
  if (comboProductName) {
    const combo = groups.find((group) =>
      group.name === comboProductName && group.category.toLowerCase() === 'combo');
    if (combo) selected.push(combo);
  }
  return selected;
}

export function calculateSelectedAddonTotal(
  addons: Array<{ id: string; price: number; isAvailable: boolean }>,
  selectedAddonIds: string[],
): number {
  const selectedIds = new Set(selectedAddonIds);
  return addons.reduce((total, addon) =>
    addon.isAvailable && selectedIds.has(addon.id) ? total + addon.price : total, 0);
}

export function calculateMenuCart(cart: MenuCartLine[], products: MenuProduct[]) {
  return cart.reduce((totals, line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return totals;
    return {
      count: totals.count + line.quantity,
      total: totals.total + product.price * line.quantity,
    };
  }, { count: 0, total: 0 });
}

export function menuOrderValidationMessage(cartProductCount: number): string {
  return cartProductCount === 0 ? EMPTY_MENU_ORDER_MESSAGE : '';
}

export function shouldOfferCheckoutRetry(hasSaleError: boolean, cartProductCount: number): boolean {
  return hasSaleError && cartProductCount > 0;
}
