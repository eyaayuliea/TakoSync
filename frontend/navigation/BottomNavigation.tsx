import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, useTheme } from '../theme/ThemeProvider';

const colors = {
  pink: '#F20D55',
  navy: '#101027',
  orange: '#FF9418',
  white: '#FFFFFF',
} as const;

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
  | 'inventory'
  | 'stocks'
  | 'stockIn'
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
  | 'inventoryHistory'
  | 'alertDetails'
  | 'dailyInventoryCheck'
  | 'dailyCheckSuccess'
  | 'profileSettings'
  | 'alerts'
  | 'more';

export type StaffTab = Extract<StaffRoute, 'dashboard' | 'menu' | 'inventory' | 'stocks' | 'alerts' | 'more'>;

type Destination = { route: StaffTab; label: string; icon: 'home' | 'pos' | 'menu' | 'box' | 'stock' | 'bell' | 'more' };

const staffDestinations: Destination[] = [
  { route: 'menu', label: 'POS', icon: 'pos' },
  { route: 'inventory', label: 'Inventory', icon: 'box' },
  { route: 'stocks', label: 'Stock', icon: 'stock' },
  { route: 'more', label: 'More', icon: 'more' },
];
const ownerDestinations: Destination[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'home' },
  { route: 'menu', label: 'Menu', icon: 'menu' },
  { route: 'inventory', label: 'Inventory', icon: 'box' },
  { route: 'stocks', label: 'Stock movement', icon: 'stock' },
  { route: 'alerts', label: 'Alerts', icon: 'bell' },
  { route: 'more', label: 'More', icon: 'more' },
];

function NavigationIcon({ name, color }: { name: Destination['icon']; color: string }) {
  if (name === 'home') {
    return <Text style={{ color, fontSize: 20 }}>⌂</Text>;
  }

  if (name === 'pos') {
    return (
      <View style={[iconStyles.pos, { borderColor: color }]}>
        <View style={[iconStyles.posScreen, { borderColor: color }]} />
        <View style={[iconStyles.posStand, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'menu') {
    return <Text style={{ color, fontSize: 18 }}>☰</Text>;
  }

  if (name === 'box') {
    return (
      <View style={iconStyles.box}>
        <View style={[iconStyles.boxTopLeft, { borderColor: color }]} />
        <View style={[iconStyles.boxTopRight, { borderColor: color }]} />
        <View style={[iconStyles.boxBody, { borderColor: color }]} />
        <View style={[iconStyles.boxSeam, { backgroundColor: color }]} />
      </View>
    );
  }

  if (name === 'stock') {
    return (
      <View style={iconStyles.stock}>
        <View style={[iconStyles.stockStem, { backgroundColor: color }]} />
        <View style={[iconStyles.stockArrowLeft, { borderColor: color }]} />
        <View style={[iconStyles.stockArrowRight, { borderColor: color }]} />
        <View style={[iconStyles.stockTray, { borderColor: color }]} />
      </View>
    );
  }

  if (name === 'bell') {
    return <Text style={{ color, fontSize: 18 }}>♧</Text>;
  }

  return (
    <View style={iconStyles.more}>
      <View style={[iconStyles.dot, { backgroundColor: color }]} />
      <View style={[iconStyles.dot, { backgroundColor: color }]} />
      <View style={[iconStyles.dot, { backgroundColor: color }]} />
    </View>
  );
}

export function activeStaffTab(route: StaffRoute): StaffTab {
  if (route === 'cart' || route === 'checkout') return 'menu';
  if (route === 'saleReceipt') return 'menu';
  if (
    route === 'dailySales' ||
    route === 'inventoryReporting' ||
    route === 'inventoryReport' ||
    route === 'inventoryCountDetails'
  ) return 'more';
  if (
    route === 'stockIn' ||
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
  if (route === 'ingredientDetails' || route === 'inventoryHistory') return 'inventory';
  if (route === 'dailyInventoryCheck' || route === 'dailyCheckSuccess') return 'more';
  if (route === 'profileSettings') return 'more';
  if (route === 'alerts' || route === 'alertDetails') return 'more';
  return route;
}

export default function BottomNavigation({
  active,
  onSelect,
  showMenu = true,
  staffOnly = false,
}: {
  active: StaffRoute;
  onSelect: (route: StaffTab) => void;
  showMenu?: boolean;
  staffOnly?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  const styles = useNavigationStyles();
  const selectedTab = activeStaffTab(active);
  const destinations = staffOnly
    ? staffDestinations
    : (showMenu ? ownerDestinations : ownerDestinations.filter((destination) => destination.route !== 'menu'));
  return (
    <View style={styles.outer}>
      <View style={styles.bar}>
        {destinations.map((destination) => {
          const selected = destination.route === selectedTab;
          const iconColor = selected
            ? colors.white
            : themeColors.action;
          return (
            <Pressable
              key={destination.route}
              accessibilityRole="button"
              accessibilityLabel={destination.label}
              accessibilityState={{ selected }}
              onPress={() => onSelect(destination.route)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
                <NavigationIcon name={destination.icon} color={iconColor} />
              </View>
              <Text style={[styles.label, selected && styles.labelSelected]}>{destination.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function useNavigationStyles() {
  const theme = useTheme();
  return useMemo(() => StyleSheet.create(createThemedStyles({
  outer: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 11,
    backgroundColor: 'transparent',
  },
  bar: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 30,
    backgroundColor: colors.navy,
    elevation: 10,
    shadowColor: colors.navy,
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  item: {
    flex: 1,
    minWidth: 0,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  iconWrapSelected: {
    backgroundColor: colors.pink,
  },
  label: { color: colors.white, fontSize: 9, fontFamily: 'Poppins_500Medium', marginTop: 2 },
  labelSelected: { color: colors.white },
  pressed: { opacity: 0.76 },
  }, theme)), [theme]);
}

const iconStyles = StyleSheet.create({
  pos: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  posScreen: { width: 16, height: 11, borderWidth: 1.8, borderRadius: 2 },
  posStand: { width: 10, height: 2, borderRadius: 1, marginTop: 3 },
  box: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  boxTopLeft: { position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderLeftWidth: 1.8, borderTopWidth: 1.8, transform: [{ rotate: '45deg' }] },
  boxTopRight: { position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderRightWidth: 1.8, borderTopWidth: 1.8, transform: [{ rotate: '-45deg' }] },
  boxBody: { width: 15, height: 11, marginTop: 5, borderWidth: 1.8, borderTopWidth: 0, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  boxSeam: { position: 'absolute', top: 7, width: 1.5, height: 10, opacity: 0.9 },
  stock: { width: 20, height: 20, alignItems: 'center' },
  stockStem: { position: 'absolute', top: 1, width: 1.8, height: 10, borderRadius: 1 },
  stockArrowLeft: { position: 'absolute', top: 7, left: 3, width: 7, height: 7, borderLeftWidth: 1.8, borderBottomWidth: 1.8, transform: [{ rotate: '-45deg' }] },
  stockArrowRight: { position: 'absolute', top: 7, right: 3, width: 7, height: 7, borderRightWidth: 1.8, borderBottomWidth: 1.8, transform: [{ rotate: '45deg' }] },
  stockTray: { position: 'absolute', bottom: 1, width: 17, height: 5, borderBottomWidth: 1.8, borderLeftWidth: 1.8, borderRightWidth: 1.8, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  bell: { width: 20, height: 20, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
  bellBody: { width: 13, height: 13, borderWidth: 1.7, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  bellBase: { width: 17, height: 1.7, borderRadius: 1 },
  bellClapper: { width: 4, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginTop: 1 },
  more: { width: 20, height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 1 },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
});
