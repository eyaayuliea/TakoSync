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

const toCents = (amount: number) => Math.round(amount * 100);

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
  const totalCents = addons.reduce((total, addon) =>
    addon.isAvailable && selectedIds.has(addon.id) ? total + toCents(addon.price) : total, 0);
  return totalCents / 100;
}

/**
 * ST-02 criterion 3: an order line's quantity never drops below 1 through the
 * decrease control; a line is only removed by its explicit remove control.
 */
export function changeMenuCartQuantity(
  cart: MenuCartLine[],
  productId: string,
  change: 1 | -1,
): MenuCartLine[] {
  return cart.map((line) => {
    if (line.productId !== productId) return line;
    const quantity = Math.max(1, line.quantity + change);
    return quantity === line.quantity ? line : { ...line, quantity };
  });
}

/** Keeps only digits so the quantity field never holds signs, decimals or spaces. */
export function sanitizeMenuQuantityInput(text: string): string {
  return text.replace(/\D/g, '');
}

/** A typed quantity is valid only as a whole number of at least 1. */
export function parseMenuQuantityInput(text: string): number | null {
  const digits = text.trim();
  if (!/^\d+$/.test(digits)) return null;
  const quantity = Number(digits);
  return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : null;
}

/**
 * ST-02 criterion 3: sets an order line to a typed quantity. Invalid values
 * leave the cart unchanged (removal stays with the remove control), and an
 * optional maximum purchasing quantity (#30) caps the line.
 */
export function setMenuCartQuantity(
  cart: MenuCartLine[],
  productId: string,
  quantity: number,
  maxQuantity?: number,
): MenuCartLine[] {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return cart;
  const capped = maxQuantity !== undefined && Number.isSafeInteger(maxQuantity) && maxQuantity >= 1
    ? Math.min(quantity, maxQuantity)
    : quantity;
  if (!cart.some((line) => line.productId === productId && line.quantity !== capped)) return cart;
  return cart.map((line) => line.productId === productId ? { ...line, quantity: capped } : line);
}

export const UNAVAILABLE_MENU_ITEM_MESSAGE = 'This item is currently unavailable.';

export function calculateMenuCart(cart: MenuCartLine[], products: MenuProduct[]) {
  const totals = cart.reduce((current, line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) return current;
    return {
      count: current.count + line.quantity,
      totalCents: current.totalCents + toCents(product.price) * line.quantity,
    };
  }, { count: 0, totalCents: 0 });
  return { count: totals.count, total: totals.totalCents / 100 };
}

export function menuOrderValidationMessage(cartProductCount: number): string {
  return cartProductCount === 0 ? EMPTY_MENU_ORDER_MESSAGE : '';
}

export function shouldOfferCheckoutRetry(hasSaleError: boolean, cartProductCount: number): boolean {
  return hasSaleError && cartProductCount > 0;
}

export const MIN_TOUCH_TARGET = 44;

/** Extra touch area needed so a control of the given visual size reaches the minimum target. */
export function hitSlopForTarget(width: number, height: number, minimum = MIN_TOUCH_TARGET) {
  const horizontal = Math.max(0, Math.ceil((minimum - width) / 2));
  const vertical = Math.max(0, Math.ceil((minimum - height) / 2));
  return { top: vertical, bottom: vertical, left: horizontal, right: horizontal };
}
