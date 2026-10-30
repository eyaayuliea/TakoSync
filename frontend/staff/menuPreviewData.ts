export type MenuCategory = 'Octobits' | 'Cheese' | 'Crab' | 'Baconbits';
export type MenuFilter = 'All' | 'Regular' | 'Combo';

export type MenuProduct = {
  id: string;
  name: string;
  category: MenuCategory;
  type: 'Regular' | 'Combo';
  flavor: string | null;
  pieces: string;
  price: number;
};

export type MenuCartLine = {
  productId: string;
  quantity: number;
};

export const menuCategories: MenuCategory[] = ['Octobits', 'Cheese', 'Crab', 'Baconbits'];

// These examples are isolated UI-preview data, not a production catalog.
export const menuPreviewProducts: MenuProduct[] = [
  { id: 'preview-octobits-4', name: 'Octobits Takoyaki', category: 'Octobits', type: 'Regular', flavor: null, pieces: '4pcs', price: 49 },
  { id: 'preview-octobits-8', name: 'Octobits Takoyaki', category: 'Octobits', type: 'Regular', flavor: null, pieces: '8pcs', price: 89 },
  { id: 'preview-octobits-10-plus-1', name: 'Octobits Takoyaki', category: 'Octobits', type: 'Regular', flavor: null, pieces: '10+1pcs', price: 120 },
  { id: 'preview-cheese-4', name: 'Octobits Takoyaki', category: 'Cheese', type: 'Combo', flavor: 'Cheese', pieces: '4pcs', price: 59 },
  { id: 'preview-cheese-8', name: 'Octobits Takoyaki', category: 'Cheese', type: 'Combo', flavor: 'Cheese', pieces: '8pcs', price: 99 },
];

export function filterMenuProducts(
  products: MenuProduct[],
  filter: MenuFilter,
  category: MenuCategory | 'All',
  search: string,
) {
  const searchTerm = search.trim().toLowerCase();
  return products.filter((product) => {
    const matchesType = filter === 'All' || product.type === filter;
    const matchesCategory = category === 'All' || product.category === category;
    const matchesSearch = `${product.name} ${product.type} ${product.flavor ?? ''} ${product.pieces}`
      .toLowerCase().includes(searchTerm);
    return matchesType && matchesCategory && matchesSearch;
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
