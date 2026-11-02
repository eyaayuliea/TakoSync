export type MenuCategory = 'Octobits' | 'Cheese' | 'Crab' | 'Baconbits';
export type MenuFilter = 'All' | 'Available' | 'Unavailable';

export type MenuProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
};

export type MenuCartLine = {
  productId: string;
  quantity: number;
};

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
