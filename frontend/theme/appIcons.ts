// One icon per meaning across the app (team feedback: icons instead of text
// symbols, for a consistent design). Names are Ionicons from @expo/vector-icons.
export const APP_ICONS = {
  // navigation
  back: 'chevron-back',
  forward: 'chevron-forward',
  dropdown: 'chevron-down',
  dropdownOpen: 'chevron-up',
  close: 'close',
  search: 'search-outline',
  calendar: 'calendar-outline',
  // feedback
  success: 'checkmark-circle',
  check: 'checkmark',
  warning: 'warning-outline',
  // stock alerts (same four categories everywhere)
  lowStock: 'trending-down-outline',
  outOfStock: 'alert-circle-outline',
  nearExpiration: 'time-outline',
  expired: 'close-circle-outline',
  // inventory actions
  stockIn: 'add-circle-outline',
  stockOut: 'arrow-up-circle-outline',
  waste: 'trash-outline',
  dailyCount: 'clipboard-outline',
  batter: 'flask-outline',
  download: 'download-outline',
  // records and account
  sales: 'cash-outline',
  history: 'list-outline',
  receipt: 'receipt-outline',
  profile: 'person-circle-outline',
  lock: 'lock-closed-outline',
  logout: 'log-out-outline',
  themeDark: 'moon-outline',
  themeLight: 'sunny-outline',
  // ingredient categories (instead of per-ingredient emoji)
  categorySeafood: 'fish-outline',
  categoryDairy: 'egg-outline',
  categoryMeat: 'flame-outline',
  categoryVegetables: 'leaf-outline',
  categoryCondiments: 'water-outline',
  categoryDryGoods: 'basket-outline',
  categoryPrepared: 'beaker-outline',
  categorySupplies: 'bag-handle-outline',
  categoryOther: 'archive-outline',
  // bottom navigation
  home: 'home-outline',
  pos: 'calculator-outline',
  menu: 'restaurant-outline',
  box: 'cube-outline',
  stock: 'layers-outline',
  bell: 'notifications-outline',
  more: 'ellipsis-horizontal',
  dashboardGrid: 'grid-outline',
  salesChart: 'bar-chart-outline',
  sync: 'sync-outline',
} as const;

export type AppIconName = keyof typeof APP_ICONS;

/** The icon for a stock alert category, the same on every screen. */
export function stockAlertIcon(kind: 'lowStock' | 'outOfStock' | 'nearExpiration' | 'expired'): AppIconName {
  return kind;
}

const CATEGORY_ICONS: Record<string, AppIconName> = {
  seafood: 'categorySeafood',
  'dairy-eggs': 'categoryDairy',
  meat: 'categoryMeat',
  produce: 'categoryVegetables',
  condiments: 'categoryCondiments',
  'dry-goods': 'categoryDryGoods',
  prepared: 'categoryPrepared',
  supplies: 'categorySupplies',
};

/** The picture of an ingredient: the icon of its category, so new ingredients get one too. */
export function ingredientCategoryIcon(categoryId: string | null | undefined): AppIconName {
  return (categoryId && CATEGORY_ICONS[categoryId]) || 'categoryOther';
}
