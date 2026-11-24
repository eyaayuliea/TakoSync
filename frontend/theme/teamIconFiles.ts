// The team's own icon set (Google Drive "STAFF MODULE", received 2026-11-25),
// stored in assets/icons. Each entry replaces the Ionicons fallback of the same
// name in appIcons.ts; names without an entry keep the fallback.
//
// tint: single-colour icons take the colour of the text they sit in (so they
// follow light and dark mode); multi-colour icons keep their own colours.
//
// This file is plain data so tests can read it; the images themselves are
// loaded in appIconImages.ts.
import type { AppIconName } from './appIcons.ts';

export const TEAM_ICON_FILES: Partial<Record<AppIconName, { file: string; tint: boolean }>> = {
  sales: { file: 'more-daily-sales', tint: true },
  dailyCount: { file: 'more-physical-inventory', tint: true },
  history: { file: 'more-transaction-history', tint: true },
  profile: { file: 'more-profile-settings', tint: true },
  pos: { file: 'tab-menu', tint: true },
  box: { file: 'tab-inventory', tint: true },
  stock: { file: 'tab-stocks', tint: true },
  bell: { file: 'tab-alerts', tint: true },
  more: { file: 'tab-more', tint: true },
  stockIn: { file: 'stock-in', tint: true },
  download: { file: 'stock-in', tint: true },
  waste: { file: 'waste-spillage', tint: true },
  batter: { file: 'batter-batch', tint: true },
  calendar: { file: 'calendar', tint: true },
  themeDark: { file: 'dark-mode', tint: true },
  themeLight: { file: 'light-mode', tint: true },
  warning: { file: 'warning', tint: true },
  remove: { file: 'delete', tint: true },
  edit: { file: 'edit', tint: true },
  passwordVisible: { file: 'password-visible', tint: true },
  passwordHidden: { file: 'password-hidden', tint: true },
  error: { file: 'error', tint: false },
  info: { file: 'info', tint: false },
  noAlerts: { file: 'no-alerts', tint: false },
  noRecords: { file: 'no-records', tint: false },
  noInternet: { file: 'no-internet', tint: false },
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
};
