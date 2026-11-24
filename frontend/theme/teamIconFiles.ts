// The team's own icon sets (Google Drive "STAFF MODULE" and "OWNER MODULE",
// received 2026-11-25), stored in assets/icons/<dir>. Each entry replaces the
// Ionicons fallback of the same name in appIcons.ts; names without an entry
// keep the fallback.
//
// tint: single-colour icons take the colour of the text they sit in (so they
// follow light and dark mode); multi-colour icons keep their own colours.
//
// This file is plain data so tests can read it; the images themselves are
// loaded in appIconImages.ts.
import type { AppIconName } from './appIcons.ts';

export type TeamIconFile = { dir: 'staff' | 'owner'; file: string; tint: boolean };

export const TEAM_ICON_FILES: Partial<Record<AppIconName, TeamIconFile>> = {
  sales: { dir: 'staff', file: 'more-daily-sales', tint: true },
  dailyCount: { dir: 'staff', file: 'more-physical-inventory', tint: true },
  history: { dir: 'staff', file: 'more-transaction-history', tint: true },
  profile: { dir: 'staff', file: 'more-profile-settings', tint: true },
  pos: { dir: 'staff', file: 'tab-menu', tint: true },
  box: { dir: 'staff', file: 'tab-inventory', tint: true },
  stock: { dir: 'staff', file: 'tab-stocks', tint: true },
  bell: { dir: 'staff', file: 'tab-alerts', tint: true },
  more: { dir: 'staff', file: 'tab-more', tint: true },
  stockIn: { dir: 'staff', file: 'stock-in', tint: true },
  download: { dir: 'staff', file: 'stock-in', tint: true },
  waste: { dir: 'staff', file: 'waste-spillage', tint: true },
  batter: { dir: 'staff', file: 'batter-batch', tint: true },
  calendar: { dir: 'staff', file: 'calendar', tint: true },
  themeDark: { dir: 'staff', file: 'dark-mode', tint: true },
  themeLight: { dir: 'staff', file: 'light-mode', tint: true },
  warning: { dir: 'staff', file: 'warning', tint: true },
  remove: { dir: 'staff', file: 'delete', tint: true },
  edit: { dir: 'staff', file: 'edit', tint: true },
  passwordVisible: { dir: 'staff', file: 'password-visible', tint: true },
  passwordHidden: { dir: 'staff', file: 'password-hidden', tint: true },
  error: { dir: 'staff', file: 'error', tint: false },
  info: { dir: 'staff', file: 'info', tint: false },
  noAlerts: { dir: 'staff', file: 'no-alerts', tint: false },
  noRecords: { dir: 'staff', file: 'no-records', tint: false },
  noInternet: { dir: 'staff', file: 'no-internet', tint: false },
  refresh: { dir: 'owner', file: 'refresh', tint: true },
  location: { dir: 'owner', file: 'location', tint: true },
  filter: { dir: 'owner', file: 'filter', tint: true },
  lock: { dir: 'owner', file: 'view-only', tint: true },
  logout: { dir: 'owner', file: 'log-out', tint: true },
  ownerNoAlerts: { dir: 'owner', file: 'no-alerts', tint: false },
  ownerNoRecords: { dir: 'owner', file: 'no-records', tint: false },
  ownerDashboard: { dir: 'owner', file: 'nav-dashboard', tint: true },
  ownerSales: { dir: 'owner', file: 'nav-sales', tint: true },
  ownerInventory: { dir: 'owner', file: 'nav-inventory', tint: true },
  ownerSync: { dir: 'owner', file: 'nav-reconciliation', tint: true },
  ownerBell: { dir: 'owner', file: 'nav-alerts', tint: true },
  ownerMore: { dir: 'owner', file: 'nav-more', tint: true },
};

/** Ingredient pictures by ingredient id. Octobits use the octopus picture. */
export const INGREDIENT_ICON_FILES: Record<string, string> = {
  flour: 'flour',
  'bacon-bits': 'bacon-bits',
  'baking-powder': 'baking-powder',
  'bonito-flakes': 'bonito-flakes',
  cabbage: 'cabbage',
  'cheese-cubes': 'cheese-cubes',
  'crab-sticks': 'crab-sticks',
  dashi: 'dashi',
  eggs: 'eggs',
  'japanese-mayonnaise': 'japanese-mayonnaise',
  octopus: 'octopus',
  octobits: 'octopus',
  packaging: 'packaging',
  salt: 'salt',
  'soy-sauce': 'soy-sauce',
  'prepared-batter': 'prepared-batter',
  sauces: 'sauces',
  'takoyaki-picks': 'takoyaki-pick',
};

/**
 * The owner mobile icon component (OwnerMenuIcon) by its own icon names; all
 * of these are single-colour and take the colour the component is given.
 */
export const OWNER_MENU_ICON_FILES: Record<string, string> = {
  receipt: 'records',
  profile: 'profile',
  clipboardCheck: 'sales-consumption',
  stockIn: 'stock-in',
  droplet: 'waste-spillage',
  cube: 'physical-inventory-count',
  check: 'authorized-adjustment',
  mapPin: 'location',
  dashboard: 'nav-dashboard',
  salesChart: 'nav-sales',
  inventory: 'nav-inventory',
  sync: 'nav-reconciliation',
  bell: 'nav-alerts',
  more: 'nav-more',
};
