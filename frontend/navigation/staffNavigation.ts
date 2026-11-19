export type StaffRoute =
  | 'dashboard'
  | 'menu'
  | 'cart'
  | 'checkout'
  | 'saleReceipt'
  | 'dailySales'
  | 'inventoryReporting'
  | 'inventoryReport'
  | 'inventoryCountDetails'
  | 'inventoryDiscrepancySubmission'
  | 'inventory'
  | 'stocks'
  | 'stockIn'
  | 'batterBatch'
  | 'stockOut'
  | 'usagePreview'
  | 'stockOutSuccess'
  | 'waste'
  | 'wasteSuccess'
  | 'stockInSuccess'
  | 'stockHistory'
  | 'historyFilters'
  | 'transactionDetails'
  | 'ingredientDetails'
  | 'unitsPackSizes'
  | 'expirationInfo'
  | 'inventoryHistory'
  | 'alertDetails'
  | 'dailyInventoryCheck'
  | 'dailyInventoryOverview'
  | 'dailyCheckSuccess'
  | 'profileSettings'
  | 'alerts'
  | 'more';

export type StaffTab = Extract<StaffRoute, 'dashboard' | 'menu' | 'inventory' | 'stocks' | 'alerts' | 'more'>;

export const STAFF_NAVIGATION_TOUCH_TARGET = 48;

export const staffDestinations = [
  { route: 'menu', label: 'POS', icon: 'pos' },
  { route: 'inventory', label: 'Inventory', icon: 'box' },
  { route: 'stocks', label: 'Stocks', icon: 'stock' },
  { route: 'alerts', label: 'Alerts', icon: 'bell' },
  { route: 'more', label: 'More', icon: 'more' },
] as const;

export function activeStaffTab(route: StaffRoute): StaffTab {
  if (route === 'cart' || route === 'checkout' || route === 'saleReceipt') return 'menu';
  if (
    route === 'dailySales' ||
    route === 'profileSettings'
  ) return 'more';
  if (
    route === 'stockIn' ||
    route === 'batterBatch' ||
    route === 'stockOut' ||
    route === 'usagePreview' ||
    route === 'stockOutSuccess' ||
    route === 'waste' ||
    route === 'wasteSuccess' ||
    route === 'stockInSuccess' ||
    route === 'stockHistory' ||
    route === 'historyFilters' ||
    route === 'transactionDetails'
  ) return 'stocks';
  if (
    route === 'ingredientDetails' ||
    route === 'unitsPackSizes' ||
    route === 'expirationInfo' ||
    route === 'inventoryHistory' ||
    route === 'inventoryReporting' ||
    route === 'inventoryReport' ||
    route === 'inventoryCountDetails' ||
    route === 'inventoryDiscrepancySubmission' ||
    route === 'dailyInventoryCheck' ||
    route === 'dailyInventoryOverview' ||
    route === 'dailyCheckSuccess'
  ) return 'inventory';
  if (route === 'alerts' || route === 'alertDetails') return 'alerts';
  return route;
}
