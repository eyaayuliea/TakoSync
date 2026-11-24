// Loads the icon images of the team (see teamIconFiles.ts). Metro needs each
// image import written out, so this file mirrors that list; appIconImages.test.mjs
// fails if the two drift apart or a file is missing.
import type { AppIconName } from './appIcons';

export const APP_ICON_IMAGES: Partial<Record<AppIconName, number>> = {
  sales: require('../../assets/icons/staff/more-daily-sales.png'),
  dailyCount: require('../../assets/icons/staff/more-physical-inventory.png'),
  history: require('../../assets/icons/staff/more-transaction-history.png'),
  profile: require('../../assets/icons/staff/more-profile-settings.png'),
  pos: require('../../assets/icons/staff/tab-menu.png'),
  box: require('../../assets/icons/staff/tab-inventory.png'),
  stock: require('../../assets/icons/staff/tab-stocks.png'),
  bell: require('../../assets/icons/staff/tab-alerts.png'),
  more: require('../../assets/icons/staff/tab-more.png'),
  stockIn: require('../../assets/icons/staff/stock-in.png'),
  download: require('../../assets/icons/staff/stock-in.png'),
  waste: require('../../assets/icons/staff/waste-spillage.png'),
  batter: require('../../assets/icons/staff/batter-batch.png'),
  calendar: require('../../assets/icons/staff/calendar.png'),
  themeDark: require('../../assets/icons/staff/dark-mode.png'),
  themeLight: require('../../assets/icons/staff/light-mode.png'),
  warning: require('../../assets/icons/staff/warning.png'),
  remove: require('../../assets/icons/staff/delete.png'),
  edit: require('../../assets/icons/staff/edit.png'),
  passwordVisible: require('../../assets/icons/staff/password-visible.png'),
  passwordHidden: require('../../assets/icons/staff/password-hidden.png'),
  error: require('../../assets/icons/staff/error.png'),
  info: require('../../assets/icons/staff/info.png'),
  noAlerts: require('../../assets/icons/staff/no-alerts.png'),
  noRecords: require('../../assets/icons/staff/no-records.png'),
  noInternet: require('../../assets/icons/staff/no-internet.png'),
};

export const INGREDIENT_ICON_IMAGES: Record<string, number> = {
  flour: require('../../assets/icons/ingredients/flour.png'),
  'bacon-bits': require('../../assets/icons/ingredients/bacon-bits.png'),
  'baking-powder': require('../../assets/icons/ingredients/baking-powder.png'),
  'bonito-flakes': require('../../assets/icons/ingredients/bonito-flakes.png'),
  cabbage: require('../../assets/icons/ingredients/cabbage.png'),
  'cheese-cubes': require('../../assets/icons/ingredients/cheese-cubes.png'),
  'crab-sticks': require('../../assets/icons/ingredients/crab-sticks.png'),
  dashi: require('../../assets/icons/ingredients/dashi.png'),
  eggs: require('../../assets/icons/ingredients/eggs.png'),
  'japanese-mayonnaise': require('../../assets/icons/ingredients/japanese-mayonnaise.png'),
  octopus: require('../../assets/icons/ingredients/octopus.png'),
  octobits: require('../../assets/icons/ingredients/octopus.png'),
  packaging: require('../../assets/icons/ingredients/packaging.png'),
  salt: require('../../assets/icons/ingredients/salt.png'),
  'soy-sauce': require('../../assets/icons/ingredients/soy-sauce.png'),
  'prepared-batter': require('../../assets/icons/ingredients/prepared-batter.png'),
  sauces: require('../../assets/icons/ingredients/sauces.png'),
};
